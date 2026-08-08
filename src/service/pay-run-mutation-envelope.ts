/**
 * Unified success payload for pay-run mutations — run snapshot + counters.
 * No per-line sen roots (Phase 5B). Spec: phase5a-mutation-envelope-design.
 */

import { count, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { anomalyFindings } from "@/db/schema/findings";
import { payLines, payRuns } from "@/db/schema/run";
import { ControlError } from "@/service/control-errors";
import { evaluateGate, type GateKind } from "@/service/gates";
import type { RecomputeFailure } from "@/service/payrun";

const GATE_KINDS = [
  "REVIEW",
  "APPROVAL",
  "RELEASE",
  "CLOSE",
] as const satisfies readonly GateKind[];

export type PayRunMutationKind =
  | {
      readonly kind: "CREATE";
      readonly lineCount: number;
    }
  | {
      readonly kind: "RECOMPUTE";
      readonly computed: number;
      readonly failures: readonly RecomputeFailure[];
    }
  | { readonly kind: "REVIEW" }
  | { readonly kind: "APPROVE" }
  | { readonly kind: "DEMOTE" }
  | {
      readonly kind: "FINDINGS_SCAN";
      readonly scanned: number;
      readonly revision: string | null;
    }
  | {
      readonly kind: "FINDING_ACKNOWLEDGE";
      readonly findingId: string;
    };

export interface PayRunMutationEnvelope {
  readonly run: {
    readonly id: string;
    readonly companyId: string;
    readonly status: string;
    readonly calcRevision: string | null;
    readonly findingsScannedRevision: string | null;
    readonly reviewedRevision: string | null;
    readonly approvedRevision: string | null;
    readonly year: number;
    readonly month: number;
  };
  readonly counters: {
    readonly lineCount: number;
    readonly findingsTotal: number;
    readonly findingsOpen: number;
    readonly findingsBlocking: number;
    readonly findingsWarning: number;
    readonly gates: Readonly<
      Record<GateKind, { readonly ok: boolean; readonly issueCount: number }>
    >;
  };
  readonly mutation: PayRunMutationKind;
}

export async function loadPayRunMutationEnvelope(
  db: Database,
  runId: string,
  mutation: PayRunMutationKind
): Promise<PayRunMutationEnvelope> {
  const [run] = await db
    .select({
      id: payRuns.id,
      companyId: payRuns.companyId,
      status: payRuns.status,
      calcRevision: payRuns.calcRevision,
      findingsScannedRevision: payRuns.findingsScannedRevision,
      reviewedRevision: payRuns.reviewedRevision,
      approvedRevision: payRuns.approvedRevision,
      year: payRuns.year,
      month: payRuns.month,
    })
    .from(payRuns)
    .where(eq(payRuns.id, runId))
    .limit(1);

  if (run === undefined) {
    throw new ControlError("NOT_FOUND", `no such pay run: ${runId}`);
  }

  const [lineCountRow] = await db
    .select({ n: count() })
    .from(payLines)
    .where(eq(payLines.runId, runId));

  const [findingsAgg] = await db
    .select({
      total: count(),
      open: sql<number>`count(*) filter (where ${anomalyFindings.status} = 'OPEN')`,
      blocking: sql<number>`count(*) filter (where ${anomalyFindings.severity} = 'BLOCKING' and ${anomalyFindings.status} = 'OPEN')`,
      warning: sql<number>`count(*) filter (where ${anomalyFindings.severity} = 'WARNING' and ${anomalyFindings.status} = 'OPEN')`,
    })
    .from(anomalyFindings)
    .where(eq(anomalyFindings.runId, runId));

  const gates = {} as Record<
    GateKind,
    { readonly ok: boolean; readonly issueCount: number }
  >;
  for (const gate of GATE_KINDS) {
    const result = await evaluateGate(db, runId, gate);
    gates[gate] = { ok: result.ok, issueCount: result.issues.length };
  }

  return {
    run: {
      id: run.id,
      companyId: run.companyId,
      status: run.status,
      calcRevision: run.calcRevision,
      findingsScannedRevision: run.findingsScannedRevision,
      reviewedRevision: run.reviewedRevision,
      approvedRevision: run.approvedRevision,
      year: run.year,
      month: run.month,
    },
    counters: {
      lineCount: Number(lineCountRow?.n ?? 0),
      findingsTotal: Number(findingsAgg?.total ?? 0),
      findingsOpen: Number(findingsAgg?.open ?? 0),
      findingsBlocking: Number(findingsAgg?.blocking ?? 0),
      findingsWarning: Number(findingsAgg?.warning ?? 0),
      gates,
    },
    mutation,
  };
}
