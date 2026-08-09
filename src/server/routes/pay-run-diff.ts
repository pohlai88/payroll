/**
 * Phase 8 — graph-level run diff read facade.
 * GET /v1/pay-runs/:runId/lines/:lineId/diff
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

const EMPTY_GRAPH: DerivationGraph = {
  schemaVersion: 1,
  rulePackId: "",
  nodes: {},
  order: [],
  roots: {},
};

function parseTrace(raw: unknown): DerivationGraph {
  if (!raw || typeof raw !== "object") {
    return EMPTY_GRAPH;
  }
  const g = raw as Partial<DerivationGraph>;
  return {
    schemaVersion: 1,
    rulePackId: g.rulePackId ?? "",
    nodes: g.nodes ?? {},
    order: g.order ?? [],
    roots: g.roots ?? {},
  };
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
        return c.json(
          { code: "NOT_FOUND", message: `no such run: ${runId}` },
          404
        );
      }

      const [line] = await db
        .select({
          id: payLines.id,
          employmentId: payLines.employmentId,
          trace: payLines.trace,
        })
        .from(payLines)
        .where(and(eq(payLines.id, lineId), eq(payLines.runId, runId)))
        .limit(1);
      if (!line) {
        return c.json(
          { code: "NOT_FOUND", message: `no such line: ${lineId}` },
          404
        );
      }

      const currentGraph = parseTrace(line.trace);
      const priorRunId = run.linkedRunId ?? null;

      if (!priorRunId) {
        return c.json({
          runId,
          lineId,
          employmentId: line.employmentId,
          priorRunId: null,
          diffs: [],
        });
      }

      const [priorLine] = await db
        .select({ trace: payLines.trace })
        .from(payLines)
        .where(
          and(
            eq(payLines.runId, priorRunId),
            eq(payLines.employmentId, line.employmentId)
          )
        )
        .limit(1);

      if (!priorLine) {
        return c.json({
          runId,
          lineId,
          employmentId: line.employmentId,
          priorRunId,
          diffs: [],
        });
      }

      const priorGraph = parseTrace(priorLine.trace);
      const rawDiffs = diffGraphs(priorGraph, currentGraph);
      const diffs = rawDiffs.map((d) => mapDiff(d, currentGraph));

      return c.json({
        runId,
        lineId,
        employmentId: line.employmentId,
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
