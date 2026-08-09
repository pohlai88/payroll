/**
 * Pure gate evaluation — no writes.
 * Spec: docs/superpowers/specs/2026-08-08-phase6-findings-gates-approval-design.md
 */

import { and, eq } from "drizzle-orm";
import type { Database, DbOrTx, Transaction } from "@/db/client";
import { gateCertifications } from "@/db/schema/control";
import { anomalyFindings } from "@/db/schema/findings";
import { auditEvents, payLines, payRuns } from "@/db/schema/run";
import { ANOMALY_PACK_VERSION } from "@/domain/findings/catalog";
import { ControlError } from "./control-errors";

export type GateDb = Database | Transaction;

export type GateKind = "REVIEW" | "APPROVAL" | "RELEASE" | "CLOSE";

export interface GateIssue {
  readonly kind: "finding" | "prerequisite";
  readonly code: string;
  readonly message: string;
  readonly lineId?: string;
  readonly findingId?: string;
}

export interface GateResult {
  readonly ok: boolean;
  readonly issues: readonly GateIssue[];
}

/**
 * Evaluate whether a gate would pass. Never mutates findings or run state.
 * RELEASE/CLOSE may report missing Phase 7 prerequisites without creating
 * payment attempts, artifacts, or status transitions.
 */
export async function evaluateGate(
  db: DbOrTx,
  runId: string,
  gate: GateKind,
  opts?: { readonly lineIds?: readonly string[] }
): Promise<GateResult> {
  const [run] = await db
    .select()
    .from(payRuns)
    .where(eq(payRuns.id, runId))
    .limit(1);
  if (run === undefined) {
    throw new ControlError("NOT_FOUND", `no such run: ${runId}`);
  }

  const issues: GateIssue[] = [];

  if (
    run.calcRevision === null ||
    run.findingsScannedRevision === null ||
    run.findingsScannedRevision !== run.calcRevision
  ) {
    issues.push({
      kind: "prerequisite",
      code: "SCAN_INCOMPLETE",
      message: "findingsScannedRevision must equal calcRevision",
    });
  }

  if (gate === "REVIEW") {
    issues.push(...(await reviewPrerequisites(db, runId)));
  }

  if (gate === "APPROVAL") {
    if (run.status !== "REVIEWED") {
      issues.push({
        kind: "prerequisite",
        code: "NOT_REVIEWED",
        message: "run must be REVIEWED before APPROVAL",
      });
    }
    if (
      run.reviewedRevision === null ||
      run.calcRevision === null ||
      run.reviewedRevision !== run.calcRevision
    ) {
      issues.push({
        kind: "prerequisite",
        code: "REVISION_MISMATCH",
        message: "reviewedRevision must equal current calcRevision",
      });
    }
  }

  if (gate === "RELEASE" && run.status !== "APPROVED") {
    issues.push({
      kind: "prerequisite",
      code: "NOT_APPROVED",
      message: "run must be APPROVED before RELEASE",
    });
  }

  if (
    gate === "CLOSE" &&
    run.status !== "APPROVED" &&
    run.status !== "CLOSED"
  ) {
    issues.push({
      kind: "prerequisite",
      code: "NOT_APPROVED",
      message: "run must be APPROVED before CLOSE",
    });
  }
  // Mechanical §1.5 checklist is owned by close.ts — not duplicated here.

  issues.push(...(await findingIssuesForGate(db, runId, gate, opts?.lineIds)));

  return { ok: issues.length === 0, issues };
}

export async function certifyGate(
  db: DbOrTx,
  input: {
    readonly runId: string;
    readonly gate: GateKind;
    readonly calcRevision: string;
    readonly statutoryPackId: string;
    readonly actor: string;
  }
): Promise<void> {
  const inserted = await db
    .insert(gateCertifications)
    .values({
      runId: input.runId,
      gate: input.gate,
      calcRevision: input.calcRevision,
      statutoryPackId: input.statutoryPackId,
      anomalyPackVersion: ANOMALY_PACK_VERSION,
      actor: input.actor,
    })
    .onConflictDoNothing({
      target: [
        gateCertifications.runId,
        gateCertifications.gate,
        gateCertifications.calcRevision,
      ],
    })
    .returning({ id: gateCertifications.id });

  // Same (run, gate, revision) may be re-certified after demote→re-review;
  // uniqueness preserves the original stamp, audit records the re-attempt.
  await db.insert(auditEvents).values({
    actor: input.actor,
    runId: input.runId,
    entity: "gate_certifications",
    entityId: input.runId,
    action: `CERTIFY_${input.gate}`,
    after: {
      calcRevision: input.calcRevision,
      reusedExisting: inserted.length === 0,
    },
  });
}

async function reviewPrerequisites(
  db: DbOrTx,
  runId: string
): Promise<GateIssue[]> {
  const lines = await db
    .select({
      id: payLines.id,
      paidDays: payLines.paidDays,
      hoursWorked: payLines.hoursWorked,
      employeeSnapshot: payLines.employeeSnapshot,
    })
    .from(payLines)
    .where(eq(payLines.runId, runId));

  const issues: GateIssue[] = [];
  for (const line of lines) {
    const snap = line.employeeSnapshot as {
      payBasis?: string;
      baseRateSen?: number;
    };
    if (snap.baseRateSen === undefined || snap.baseRateSen === 0) {
      issues.push({
        kind: "prerequisite",
        code: "BASE_RATE_MISSING",
        message: "base rate must be non-zero",
        lineId: line.id,
      });
    }
    const basis = snap.payBasis ?? "MONTHLY";
    if (
      (basis === "MONTHLY" || basis === "DAILY") &&
      (line.paidDays === null || line.paidDays === undefined)
    ) {
      issues.push({
        kind: "prerequisite",
        code: "PAID_DAYS_MISSING",
        message: "paid days required for MONTHLY/DAILY",
        lineId: line.id,
      });
    }
    if (
      basis === "HOURLY" &&
      (line.hoursWorked === null || line.hoursWorked === undefined)
    ) {
      issues.push({
        kind: "prerequisite",
        code: "HOURS_MISSING",
        message: "hours worked required for HOURLY",
        lineId: line.id,
      });
    }
  }
  return issues;
}

async function findingIssuesForGate(
  db: DbOrTx,
  runId: string,
  gate: GateKind,
  lineIds?: readonly string[]
): Promise<GateIssue[]> {
  const rows = await db
    .select()
    .from(anomalyFindings)
    .where(
      and(eq(anomalyFindings.runId, runId), eq(anomalyFindings.status, "OPEN"))
    );

  const issues: GateIssue[] = [];
  for (const f of rows) {
    if (
      lineIds !== undefined &&
      f.lineId !== null &&
      !lineIds.includes(f.lineId)
    ) {
      continue;
    }
    const blocks = f.blocks ?? [];
    if (!blocks.includes(gate)) {
      continue;
    }
    if (f.severity === "INFO") {
      continue;
    }
    if (f.severity === "BLOCKING") {
      issues.push({
        kind: "finding",
        code: f.ruleId,
        message: f.detail,
        lineId: f.lineId ?? undefined,
        findingId: f.id,
      });
      continue;
    }
    if (f.severity === "WARNING" || f.severity === "REVIEW") {
      issues.push({
        kind: "finding",
        code: f.ruleId,
        message: `${f.detail} (acknowledge required)`,
        lineId: f.lineId ?? undefined,
        findingId: f.id,
      });
    }
  }
  return issues;
}
