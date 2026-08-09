/**
 * Phase 7 control routes — payments, release, close, artifacts.
 * Phase 6 findings/review/approve live in pay-run.ts.
 */

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "@/db/client";
import { linePayments } from "@/db/schema/control";
import { payLines } from "@/db/schema/run";
import type { ArtifactStore } from "@/domain/artifacts/store";
import {
  listRunArtifacts,
  setArtifactStore,
  signedArtifactUrl,
  storeArtifact,
} from "@/service/artifacts";
import {
  closeRun,
  closureChecklist,
  reconcileAttempt,
  recordDistribution,
} from "@/service/close";
import { holdLine, unholdLine, withdrawLine } from "@/service/payments";
import {
  cancelRelease,
  commitRelease,
  getBatch,
  previewRelease,
  settleAttempt,
} from "@/service/release";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";
import { requirePayRunAccess } from "./pay-run-access";

export function payRunControlRoutes(
  db: Database,
  deps?: { readonly artifactStore?: ArtifactStore }
) {
  if (deps?.artifactStore !== undefined) {
    setArtifactStore(deps.artifactStore);
  }

  const app = new Hono<{ Variables: AuthVariables }>();

  app.post("/pay-runs/:runId/close", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "UPDATE", runId);
      return c.json(await closeRun(db, runId, c.get("user").email));
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/pay-runs/:runId/closure-checklist", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      return c.json({ checklist: await closureChecklist(db, runId) });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/pay-runs/:runId/payments", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      const rows = await db
        .select({
          lineId: linePayments.lineId,
          employmentId: payLines.employmentId,
          state: linePayments.state,
          holdReason: linePayments.holdReason,
          releaseBatchId: linePayments.releaseBatchId,
          paymentRef: linePayments.paymentRef,
          netSen: payLines.netSen,
        })
        .from(linePayments)
        .innerJoin(payLines, eq(payLines.id, linePayments.lineId))
        .where(eq(payLines.runId, runId));
      return c.json({ payments: rows });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/lines/:lineId/hold", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "UPDATE", runId);
      const body = z
        .object({ reason: z.string().min(1) })
        .parse(await c.req.json());
      await holdLine(
        db,
        c.req.param("lineId"),
        body.reason,
        c.get("user").email
      );
      return c.json({ ok: true });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/lines/:lineId/unhold", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "UPDATE", runId);
      await unholdLine(db, c.req.param("lineId"), c.get("user").email);
      return c.json({ ok: true });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/lines/:lineId/withdraw", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "UPDATE", runId);
      const body = z
        .object({
          reasonCode: z.enum([
            "MOVED_TO_OFFCYCLE",
            "DUPLICATE_LINE",
            "EMPLOYEE_NOT_PAYABLE",
            "PAYMENT_CANCELLED_BY_AUTHORITY",
            "OTHER_CONTROLLED_EXCEPTION",
          ]),
          note: z.string().min(1),
          postApprovalApprover: z.string().optional(),
          replacementRunId: z.string().optional(),
        })
        .parse(await c.req.json());
      await withdrawLine(db, {
        lineId: c.req.param("lineId"),
        reasonCode: body.reasonCode,
        note: body.note,
        actor: c.get("user").email,
        postApprovalApprover: body.postApprovalApprover,
        replacementRunId: body.replacementRunId,
      });
      return c.json({ ok: true });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/release/preview", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      const body = z
        .object({ lineIds: z.array(z.string().uuid()).min(1) })
        .parse(await c.req.json());
      return c.json(await previewRelease(db, runId, body.lineIds));
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/release", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "UPDATE", runId);
      const body = z
        .object({
          lineIds: z.array(z.string().uuid()).min(1),
          method: z.enum(["BANK", "CASH"]).default("BANK"),
        })
        .parse(await c.req.json());
      return c.json(
        await commitRelease(db, runId, body.lineIds, {
          method: body.method,
          actor: c.get("user").email,
        })
      );
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/pay-runs/:runId/batches/:batchId", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      return c.json(await getBatch(db, c.req.param("batchId")));
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/attempts/:attemptId/settle", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "UPDATE", runId);
      const body = z
        .object({
          outcome: z.enum(["PAID", "FAILED"]),
          paymentRef: z.string().optional(),
          failedReason: z.string().optional(),
          settledAt: z.string().optional(),
        })
        .parse(await c.req.json());
      await settleAttempt(db, c.req.param("attemptId"), {
        ...body,
        actor: c.get("user").email,
      });
      return c.json({ ok: true });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/attempts/:attemptId/reconcile", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "UPDATE", runId);
      const body = z
        .object({ evidenceArtifactId: z.string().uuid().optional() })
        .parse(await c.req.json().catch(() => ({})));
      await reconcileAttempt(
        db,
        c.req.param("attemptId"),
        c.get("user").email,
        body.evidenceArtifactId
      );
      return c.json({ ok: true });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/batches/:batchId/cancel", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "UPDATE", runId);
      const body = z
        .object({ reason: z.string().min(1) })
        .parse(await c.req.json());
      await cancelRelease(
        db,
        c.req.param("batchId"),
        c.get("user").email,
        body.reason
      );
      return c.json({ ok: true });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/lines/:lineId/distributions", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "UPDATE", runId);
      const body = z
        .object({
          channel: z.enum([
            "GENERATED",
            "SENT",
            "DELIVERED",
            "HANDED",
            "PRINTED",
          ]),
          artifactId: z.string().uuid().optional(),
          note: z.string().optional(),
        })
        .parse(await c.req.json());
      const id = await recordDistribution(db, {
        lineId: c.req.param("lineId"),
        channel: body.channel,
        actor: c.get("user").email,
        artifactId: body.artifactId,
        note: body.note,
      });
      return c.json({ id });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/pay-runs/:runId/artifacts", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      return c.json({ artifacts: await listRunArtifacts(db, runId) });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-runs/:runId/artifacts", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "UPDATE", runId);
      const body = z
        .object({
          filename: z.string().min(1),
          mimeType: z.string().min(1),
          base64: z.string().min(1),
          type: z
            .enum([
              "EVIDENCE",
              "PAYMENT_REGISTER",
              "BANK_FILE",
              "CASH_SHEET",
              "PAYSLIP_PDF",
              "MANIFEST",
              "EXCEPTION_REPORT",
            ])
            .default("EVIDENCE"),
        })
        .parse(await c.req.json());
      const bytes = Uint8Array.from(Buffer.from(body.base64, "base64"));
      const stored = await storeArtifact(db, {
        runId,
        type: body.type,
        filename: body.filename,
        body: bytes,
        mimeType: body.mimeType,
        createdBy: c.get("user").email,
        source: "ATTACHED",
      });
      return c.json(stored);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/pay-runs/:runId/artifacts/:artifactId/url", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      return c.json(await signedArtifactUrl(db, c.req.param("artifactId")));
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
