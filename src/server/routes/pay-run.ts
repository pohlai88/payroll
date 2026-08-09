/**
 * @feature pay-run
 * @layer route
 * @surface GET|POST /v1/pay-runs; POST …/recompute|review|approve|demote; GET|POST …/findings*; GET|POST …/gates/:gate*
 * @chain
 *   ui:      src/web/payrun/pay-run-list.tsx; workspace.tsx; panels/findings-panel.tsx; dialogs/gate-check-dialog.tsx; control-page.tsx
 *   client:  getPayRuns, createPayRun, recompute, review, approve, demotePayRun, getFindings, scanFindings, acknowledgeFinding, evaluateGate
 *   route:   src/server/routes/pay-run.ts
 *   service: src/service/payrun.ts; run-findings.ts; gates.ts; pay-run-mutation-envelope.ts
 *   repo:    src/repo/pay-run.ts; rule-pack.ts; rule-resolution.ts
 *   schema:  src/db/schema/run.ts; findings.ts; control.ts; rule-pack.ts; catalog.ts; parties.ts
 *   spine:   app.ts → payRunRoutes; app.tsx /pay-runs + /pay-runs/:runId; app-nav /pay-runs
 *
 * Pay-run CRUD/lifecycle hub. Findings + gates HTTP also live here (lean tags on leaf files use findings/gates).
 * POST …/gates/:gate/evaluate is orphan — FE uses GET evaluateGate only.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { GateKind } from "@/service/gates";
import { evaluateGate } from "@/service/gates";
import { loadPayRunMutationEnvelope } from "@/service/pay-run-mutation-envelope";
import {
  approveRunForActor,
  createRunForActor,
  demoteRunToDraft,
  listPayRunsForActor,
  recomputeRunForActor,
  reviewRunForActor,
} from "@/service/payrun";
import {
  acknowledgeRunFinding,
  listRunFindings,
  scanRunFindings,
} from "@/service/run-findings";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";
import { requirePayRunAccess } from "./pay-run-access";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected ISO date YYYY-MM-DD");

const createRunBody = z.object({
  runId: z.string().min(1),
  companyId: z.string().uuid(),
  /** Omit to resolve MY-STATUTORY via `resolveRule` on periodEnd. */
  rulePackId: z.string().min(1).optional(),
  year: z.number().int().min(2000).max(2999),
  month: z.number().int().min(1).max(12),
  periodStart: isoDate,
  periodEnd: isoDate,
  workingDays: z.number().int().positive(),
  paidDays: z.number().int().nonnegative().nullable().optional(),
  onlyEmploymentIds: z.array(z.string().uuid()).optional(),
  runType: z.enum(["REGULAR", "OFFCYCLE"]).optional(),
  offcycleReason: z
    .enum(["CORRECTION", "ARREARS", "BONUS", "MISSED_PAYMENT", "FINAL_PAYMENT"])
    .nullable()
    .optional(),
});

const revisionBody = z.object({
  calcRevision: z.string().min(1),
});

const ackBody = z.object({
  note: z.string().optional(),
});

const gateParam = z.enum(["REVIEW", "APPROVAL", "RELEASE", "CLOSE"]);

export function payRunRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/pay-runs", async (c) => {
    try {
      const user = c.get("user");
      const companyId = c.req.query("companyId") ?? undefined;
      const reportingMonth = c.req.query("reportingMonth") ?? undefined;
      const rows = await listPayRunsForActor(db, user.id, {
        companyId,
        reportingMonth,
      });
      return c.json(rows);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs", async (c) => {
    try {
      const user = c.get("user");
      const body = createRunBody.parse(await c.req.json());
      const result = await createRunForActor(
        db,
        { userId: user.id, email: user.email },
        body
      );
      const envelope = await loadPayRunMutationEnvelope(db, result.runId, {
        kind: "CREATE",
        lineCount: result.lineCount,
      });
      return c.json(envelope, 201);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/recompute", async (c) => {
    try {
      const user = c.get("user");
      const runId = c.req.param("runId");
      const result = await recomputeRunForActor(
        db,
        { userId: user.id, email: user.email },
        runId
      );
      const envelope = await loadPayRunMutationEnvelope(db, runId, {
        kind: "RECOMPUTE",
        computed: result.computed,
        failures: result.failures,
      });
      return c.json(envelope);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/pay-runs/:runId/findings", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      return c.json({ findings: await listRunFindings(db, runId) });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/findings/scan", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "UPDATE", runId);
      const scanned = await scanRunFindings(db, runId);
      const envelope = await loadPayRunMutationEnvelope(db, runId, {
        kind: "FINDINGS_SCAN",
        scanned: scanned.scanned,
        revision: scanned.revision,
      });
      return c.json(envelope);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/findings/:findingId/acknowledge", async (c) => {
    try {
      const runId = c.req.param("runId");
      const findingId = c.req.param("findingId");
      await requirePayRunAccess(db, c.get("user").id, "UPDATE", runId);
      const body = ackBody.parse(await c.req.json().catch(() => ({})));
      await acknowledgeRunFinding(
        db,
        findingId,
        c.get("user").email,
        body.note,
        {
          expectedRunId: runId,
        }
      );
      const envelope = await loadPayRunMutationEnvelope(db, runId, {
        kind: "FINDING_ACKNOWLEDGE",
        findingId,
      });
      return c.json(envelope);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/gates/:gate/evaluate", async (c) => {
    try {
      const runId = c.req.param("runId");
      const gate = gateParam.parse(c.req.param("gate")) as GateKind;
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      return c.json(await evaluateGate(db, runId, gate));
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/pay-runs/:runId/gates/:gate", async (c) => {
    try {
      const runId = c.req.param("runId");
      const gate = gateParam.parse(c.req.param("gate")) as GateKind;
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      return c.json(await evaluateGate(db, runId, gate));
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/review", async (c) => {
    try {
      const runId = c.req.param("runId");
      const body = revisionBody.parse(await c.req.json());
      await reviewRunForActor(
        db,
        { userId: c.get("user").id, email: c.get("user").email },
        runId,
        body.calcRevision
      );
      const envelope = await loadPayRunMutationEnvelope(db, runId, {
        kind: "REVIEW",
      });
      return c.json(envelope);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/approve", async (c) => {
    try {
      const runId = c.req.param("runId");
      const body = revisionBody.parse(await c.req.json());
      await approveRunForActor(
        db,
        { userId: c.get("user").id, email: c.get("user").email },
        runId,
        body.calcRevision
      );
      const envelope = await loadPayRunMutationEnvelope(db, runId, {
        kind: "APPROVE",
      });
      return c.json(envelope);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/demote", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "UPDATE", runId);
      await demoteRunToDraft(db, runId, c.get("user").email);
      const envelope = await loadPayRunMutationEnvelope(db, runId, {
        kind: "DEMOTE",
      });
      return c.json(envelope);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
