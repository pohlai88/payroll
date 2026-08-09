/**
 * @feature diff
 * @layer route
 * @surface GET /v1/pay-runs/:runId/lines/:lineId/diff
 * @chain
 *   ui:      src/web/payrun/employee/employee-diff.tsx
 *   client:  getLineDiff
 *   route:   src/server/routes/pay-run-diff.ts
 *   service: src/service/line-derivation.ts (loadDerivedGraph); domain derive/diff
 *   repo:    src/repo/pay-run.ts; rule-pack.ts (via line-derivation)
 *   schema:  src/db/schema/run.ts
 *   spine:   app.ts → payRunDiffRoutes; workspace employee slide-over
 *
 * Compute-on-read line graph diff (do not parse pay_lines.trace as DerivationGraph).
 */
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "@/db/client";
import { payLines, payRuns } from "@/db/schema/run";
import type { NodeDiff } from "@/domain/derive/diff";
import { diffGraphs } from "@/domain/derive/diff";
import type { DerivationGraph } from "@/domain/derive/graph";
import { formatPct, renderLabel } from "@/domain/derive/i18n/render";
import type { NodeValue } from "@/domain/derive/value";
import { formatRM } from "@/domain/money";
import { ControlError } from "@/service/control-errors";
import { loadDerivedGraph } from "@/service/line-derivation";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";
import { requirePayRunAccess } from "./pay-run-access";

function formatValue(v: NodeValue): string {
  switch (v.t) {
    case "SEN":
      return `RM ${formatRM(v.sen)}`;
    case "EXACT_SEN":
      return `≈RM ${formatRM(v.approxSen)}`;
    case "SEN_UNKNOWN":
      return "—";
    case "ROW":
      return `RM ${formatRM(v.row.fromSen)}–RM ${formatRM(v.row.toSen)}`;
    case "ENUM":
      return `${v.domain}:${v.code}`;
    case "BOOL":
      return String(v.value);
    case "COUNT":
      return `${v.value} ${v.unit}`;
    case "RATE_PCT":
      return formatPct(v.pctX100);
    case "DATE":
      return v.iso;
    default: {
      const unhandled: never = v;
      return JSON.stringify(unhandled);
    }
  }
}

interface NodeDiffRow {
  readonly d: "ADDED" | "REMOVED" | "VALUE" | "STRUCTURE" | "CITATION";
  readonly id: string;
  readonly label: string;
  readonly fromValue: string | null;
  readonly toValue: string | null;
  readonly deltaSen: number | null;
  readonly addedRefs: readonly string[];
  readonly removedRefs: readonly string[];
}

function mapDiff(diff: NodeDiff, graph: DerivationGraph): NodeDiffRow {
  switch (diff.d) {
    case "VALUE": {
      const node = graph.nodes[diff.id];
      const label = node ? renderLabel(node.label, "en") : diff.id;
      return {
        d: "VALUE",
        id: diff.id,
        label,
        fromValue: formatValue(diff.from),
        toValue: formatValue(diff.to),
        deltaSen: diff.deltaSen ?? null,
        addedRefs: [],
        removedRefs: [],
      };
    }
    case "ADDED":
      return {
        d: "ADDED",
        id: diff.id,
        label: renderLabel(diff.to.label, "en"),
        fromValue: null,
        toValue: formatValue(diff.to.value),
        deltaSen: null,
        addedRefs: [],
        removedRefs: [],
      };
    case "REMOVED":
      return {
        d: "REMOVED",
        id: diff.id,
        label: renderLabel(diff.from.label, "en"),
        fromValue: formatValue(diff.from.value),
        toValue: null,
        deltaSen: null,
        addedRefs: [],
        removedRefs: [],
      };
    case "STRUCTURE": {
      const node = graph.nodes[diff.id];
      const label = node ? renderLabel(node.label, "en") : diff.id;
      return {
        d: "STRUCTURE",
        id: diff.id,
        label,
        fromValue: null,
        toValue: null,
        deltaSen: null,
        addedRefs: diff.added.map((r) => `${r.nodeId}:${r.role}`),
        removedRefs: diff.removed.map((r) => `${r.nodeId}:${r.role}`),
      };
    }
    case "CITATION": {
      const node = graph.nodes[diff.id];
      const label = node ? renderLabel(node.label, "en") : diff.id;
      return {
        d: "CITATION",
        id: diff.id,
        label,
        fromValue: JSON.stringify(diff.from),
        toValue: JSON.stringify(diff.to),
        deltaSen: null,
        addedRefs: [],
        removedRefs: [],
      };
    }
    default: {
      const unhandled: never = diff;
      throw new Error(`unhandled diff kind: ${JSON.stringify(unhandled)}`);
    }
  }
}

export function payRunDiffRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/pay-runs/:runId/lines/:lineId/diff", async (c) => {
    try {
      const runId = c.req.param("runId");
      const lineId = c.req.param("lineId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);

      const [run] = await db
        .select({ id: payRuns.id, linkedRunId: payRuns.linkedRunId })
        .from(payRuns)
        .where(eq(payRuns.id, runId))
        .limit(1);
      if (!run) {
        throw new ControlError("NOT_FOUND", `no such run: ${runId}`);
      }

      const current = await loadDerivedGraph(db, runId, lineId);
      const priorRunId = run.linkedRunId ?? null;

      if (!priorRunId) {
        return c.json({
          runId,
          lineId,
          employmentId: current.employmentId,
          priorRunId: null,
          diffs: [],
        });
      }

      const [priorLine] = await db
        .select({ id: payLines.id })
        .from(payLines)
        .where(
          and(
            eq(payLines.runId, priorRunId),
            eq(payLines.employmentId, current.employmentId)
          )
        )
        .limit(1);

      if (!priorLine) {
        return c.json({
          runId,
          lineId,
          employmentId: current.employmentId,
          priorRunId,
          diffs: [],
        });
      }

      const prior = await loadDerivedGraph(db, priorRunId, priorLine.id);
      const rawDiffs = diffGraphs(prior.graph, current.graph);
      const diffs = rawDiffs.map((d) => mapDiff(d, current.graph));

      return c.json({
        runId,
        lineId,
        employmentId: current.employmentId,
        priorRunId,
        diffs,
      });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}

export type { NodeDiffRow };
