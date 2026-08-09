/**
 * Pay-run findings scan + acknowledgement.
 * Spec: docs/superpowers/specs/2026-08-08-phase6-findings-gates-approval-design.md
 */

import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { paymentAttempts } from "@/db/schema/control";
import { anomalyFindings, findingEvents } from "@/db/schema/findings";
import { employments } from "@/db/schema/parties";
import { payLineItems, payLines, payRuns, pcbEntries } from "@/db/schema/run";
import {
  detectBankDetailsMissing,
  detectEisAgeHistoryUnresolved,
  detected,
  detectMissingStatutoryNo,
  detectNetNegative,
  detectNetVarianceVsPrior,
  detectNetZero,
  detectOtOutlier,
  detectPcbUnverified,
  detectStatutoryStepShift,
  detectStatutoryZeroWithWages,
  detectVariableItemSpike,
  type LineFindingInput,
} from "@/domain/findings/detect-line";
import { fingerprintOf } from "@/domain/findings/fingerprint";
import type { DetectedFinding } from "@/domain/findings/types";
import { ControlError } from "./control-errors";
import { scanRunTransferFindings } from "./findings";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Transaction;

type LineScanRow = LineFindingInput;

/**
 * Full catalog scan for a run. Rejects once APPROVED/CLOSED.
 * Advances findingsScannedRevision only after a successful upsert pass.
 */
export async function scanRunFindings(
  db: Database,
  runId: string
): Promise<{ scanned: number; revision: string }> {
  return await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(payRuns)
      .where(eq(payRuns.id, runId))
      .for("update")
      .limit(1);

    if (run === undefined) {
      throw new ControlError("NOT_FOUND", `no such run: ${runId}`);
    }
    if (run.status === "APPROVED" || run.status === "CLOSED") {
      throw new ControlError(
        "INVALID_STATE",
        `findings are frozen when run is ${run.status}`
      );
    }
    if (run.calcRevision === null) {
      throw new ControlError(
        "SCAN_INCOMPLETE",
        "calcRevision missing — recompute before scanning"
      );
    }

    const detectedFindings = await detectRunFindings(tx, run);
    // Run-scoped §8.6 transfer rules (prior tax, dual employer, registration…).
    await scanRunTransferFindings(tx, runId, "system");
    const scanned = await upsertRunFindings(
      tx,
      runId,
      run.calcRevision,
      detectedFindings
    );

    await tx
      .update(payRuns)
      .set({ findingsScannedRevision: run.calcRevision })
      .where(eq(payRuns.id, runId));

    return { scanned, revision: run.calcRevision };
  });
}

export async function listRunFindings(db: Database, runId: string) {
  return await db
    .select()
    .from(anomalyFindings)
    .where(eq(anomalyFindings.runId, runId))
    .orderBy(asc(anomalyFindings.ruleId));
}

export async function acknowledgeRunFinding(
  db: Database,
  findingId: string,
  actor: string,
  note?: string,
  opts?: { readonly expectedRunId?: string }
): Promise<void> {
  await db.transaction(async (tx) => {
    const [finding] = await tx
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.id, findingId))
      .limit(1);

    if (finding === undefined) {
      throw new ControlError("NOT_FOUND", `no such finding: ${findingId}`);
    }
    if (finding.runId === null) {
      throw new ControlError(
        "INVALID_STATE",
        "transfer findings are not acknowledged via pay-run routes"
      );
    }
    if (
      opts?.expectedRunId !== undefined &&
      finding.runId !== opts.expectedRunId
    ) {
      throw new ControlError(
        "NOT_FOUND",
        `finding ${findingId} is not on run ${opts.expectedRunId}`
      );
    }

    const [run] = await tx
      .select({ status: payRuns.status })
      .from(payRuns)
      .where(eq(payRuns.id, finding.runId))
      .for("update")
      .limit(1);

    if (run === undefined) {
      throw new ControlError("NOT_FOUND", `no such run: ${finding.runId}`);
    }
    if (run.status === "APPROVED" || run.status === "CLOSED") {
      throw new ControlError(
        "INVALID_STATE",
        `findings are frozen when run is ${run.status}`
      );
    }
    if (finding.severity === "BLOCKING") {
      throw new ControlError(
        "INVALID_STATE",
        "BLOCKING findings cannot be acknowledged — fix the condition"
      );
    }
    if (
      finding.severity === "WARNING" &&
      (note === undefined || note.trim() === "")
    ) {
      throw new ControlError(
        "VALIDATION_ERROR",
        "WARNING findings require an acknowledgment note"
      );
    }
    if (finding.status === "RESOLVED") {
      throw new ControlError(
        "INVALID_STATE",
        "resolved findings cannot be acknowledged"
      );
    }

    await tx
      .update(anomalyFindings)
      .set({
        status: "ACKNOWLEDGED",
        ackActor: actor,
        ackAt: new Date(),
        ackNote: note ?? null,
        updatedAt: new Date(),
      })
      .where(eq(anomalyFindings.id, findingId));
    await tx.insert(findingEvents).values({
      findingId,
      kind: "ACKNOWLEDGED",
      actor,
      evidence: {
        note: note ?? null,
        fingerprint: finding.fingerprint,
        calcRevision: finding.detectedRevision,
      },
    });
  });
}

async function detectRunFindings(
  db: DbOrTx,
  run: typeof payRuns.$inferSelect
): Promise<DetectedFinding[]> {
  const lines = await db
    .select({
      lineId: payLines.id,
      employmentId: payLines.employmentId,
      netSen: payLines.netSen,
      epfEeSen: payLines.epfEeSen,
      socsoEeCoreSen: payLines.socsoEeCoreSen,
      socsoErSen: payLines.socsoErSen,
      eisEeSen: payLines.eisEeSen,
      eisErSen: payLines.eisErSen,
      epfWagesSen: payLines.epfWagesSen,
      socsoWagesSen: payLines.socsoWagesSen,
      eisWagesSen: payLines.eisWagesSen,
      employeeSnapshot: payLines.employeeSnapshot,
    })
    .from(payLines)
    .where(eq(payLines.runId, run.id));

  const lineRows: LineScanRow[] = lines.map((l) => ({
    lineId: l.lineId,
    employmentId: l.employmentId,
    netSen: l.netSen,
    epfEeSen: l.epfEeSen,
    socsoEeCoreSen: l.socsoEeCoreSen,
    socsoErSen: l.socsoErSen,
    eisEeSen: l.eisEeSen,
    eisErSen: l.eisErSen,
    epfWagesSen: l.epfWagesSen,
    socsoWagesSen: l.socsoWagesSen,
    eisWagesSen: l.eisWagesSen,
    employeeSnapshot: l.employeeSnapshot as Record<string, unknown>,
  }));

  const out: DetectedFinding[] = [];
  const lineIds = lineRows.map((l) => l.lineId);
  const employmentIds = lineRows.map((l) => l.employmentId);

  const pcbRows =
    lineIds.length === 0
      ? []
      : await db
          .select()
          .from(pcbEntries)
          .where(inArray(pcbEntries.lineId, lineIds));
  const pcbByLine = new Map(pcbRows.map((p) => [p.lineId, p]));

  const empRows =
    employmentIds.length === 0
      ? []
      : await db
          .select()
          .from(employments)
          .where(inArray(employments.id, employmentIds));
  const empById = new Map(empRows.map((e) => [e.id, e]));

  const items =
    lineIds.length === 0
      ? []
      : await db
          .select({
            lineId: payLineItems.lineId,
            itemCodeSnap: payLineItems.itemCodeSnap,
            resolvedAmountSen: payLineItems.resolvedAmountSen,
            quantity: payLineItems.quantity,
          })
          .from(payLineItems)
          .where(inArray(payLineItems.lineId, lineIds));
  const itemsByLine = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByLine.get(item.lineId) ?? [];
    list.push(item);
    itemsByLine.set(item.lineId, list);
  }

  const prior = await loadPriorRegularBaseline(db, run);
  const priorByEmployment = prior?.byEmployment ?? new Map();

  for (const line of lineRows) {
    const emp = empById.get(line.employmentId);
    const pcb = pcbByLine.get(line.lineId);
    const baseline = priorByEmployment.get(line.employmentId);

    const pcbFinding = detectPcbUnverified(line, pcb, run.id);
    if (pcbFinding) {
      out.push(pcbFinding);
    }
    const netNeg = detectNetNegative(line, run.id);
    if (netNeg) {
      out.push(netNeg);
    }
    const netZero = detectNetZero(line, run.id);
    if (netZero) {
      out.push(netZero);
    }

    if (baseline !== undefined) {
      const variance = detectNetVarianceVsPrior(
        line,
        baseline,
        prior?.runId ?? null,
        run.id
      );
      if (variance) {
        out.push(variance);
      }
      const step = detectStatutoryStepShift(line, baseline, run.id);
      if (step) {
        out.push(step);
      }
    }

    const zero = detectStatutoryZeroWithWages(line, run.id);
    if (zero) {
      out.push(zero);
    }

    const eisAge = detectEisAgeHistoryUnresolved(
      line,
      emp?.eisPriorContribution,
      run.periodEnd,
      run.id
    );
    if (eisAge) {
      out.push(eisAge);
    }

    const lineItems = itemsByLine.get(line.lineId) ?? [];
    for (const item of lineItems) {
      const ot = detectOtOutlier(line, item, run.id);
      if (ot) {
        out.push(ot);
      }
      const spike = detectVariableItemSpike(line, item, run.id);
      if (spike) {
        out.push(spike);
      }
    }

    // NEW_EMPLOYEE: new arrival relative to an established prior REGULAR baseline.
    // First-ever payroll (no eligible prior) does not emit NEW_EMPLOYEE for everyone.
    if (prior !== null && baseline === undefined) {
      const everPaid = await employmentHasPriorLine(
        db,
        line.employmentId,
        run.id
      );
      if (!everPaid) {
        out.push(
          detected("NEW_EMPLOYEE", run.id, line.lineId, {
            employmentId: line.employmentId,
            baselineRunId: prior.runId,
          })
        );
      }
    }

    if (emp !== undefined) {
      const missing = detectMissingStatutoryNo(line, emp, run.id);
      if (missing) {
        out.push(missing);
      }

      const bankMissing = detectBankDetailsMissing(line, emp, run.id);
      if (bankMissing) {
        out.push(bankMissing);
      } else {
        const account = emp.bankAccountNo?.trim() ?? "";
        const bank = emp.bankName?.trim() ?? "";
        const changed = await bankDetailsChanged(db, line.employmentId, {
          bank,
          account,
        });
        if (changed) {
          out.push(
            detected("BANK_DETAILS_CHANGED", run.id, line.lineId, {
              bank,
              account,
            })
          );
        }
      }
    }
  }

  // Run-scoped: omitted employees + overlapping runs
  if (prior !== null) {
    const currentEmp = new Set(lineRows.map((l) => l.employmentId));
    for (const [employmentId, baseline] of prior.byEmployment) {
      if (!currentEmp.has(employmentId) && baseline.activeInPeriod) {
        out.push(
          detected("EMPLOYEE_OMITTED", run.id, null, {
            employmentId,
            baselineRunId: prior.runId,
            baselineNetSen: baseline.netSen,
          })
        );
      }
    }
  }

  const overlaps = await overlappingRunMemberships(db, run, employmentIds);
  for (const hit of overlaps) {
    out.push(
      detected("EMPLOYEE_IN_OVERLAPPING_RUNS", run.id, hit.lineId, {
        employmentId: hit.employmentId,
        otherRunId: hit.otherRunId,
      })
    );
  }

  return out;
}

async function upsertRunFindings(
  db: DbOrTx,
  runId: string,
  revision: string,
  detectedFindings: DetectedFinding[]
): Promise<number> {
  const existing = await db
    .select()
    .from(anomalyFindings)
    .where(eq(anomalyFindings.runId, runId));

  const byKey = new Map(
    existing.map((f) => [`${f.lineId ?? ""}:${f.ruleId}`, f])
  );
  let touched = 0;
  const seen = new Set<string>();

  for (const d of detectedFindings) {
    const key = `${d.lineId ?? ""}:${d.ruleId}`;
    seen.add(key);
    const fingerprint = fingerprintOf(d.evidence);
    const prev = byKey.get(key);

    if (prev === undefined) {
      const [inserted] = await db
        .insert(anomalyFindings)
        .values({
          runId,
          lineId: d.lineId ?? null,
          ruleId: d.ruleId,
          fingerprint,
          severity: d.severity,
          blocks: [...d.blocks],
          title: d.title,
          detail: d.detail,
          evidence: d.evidence,
          status: "OPEN",
          detectedRevision: revision,
        })
        .returning({ id: anomalyFindings.id });
      if (inserted === undefined) {
        throw new ControlError(
          "CONFLICT",
          `failed to insert finding ${d.ruleId}`
        );
      }
      await db.insert(findingEvents).values({
        findingId: inserted.id,
        kind: "DETECTED",
        actor: "system",
        evidence: d.evidence,
      });
      touched += 1;
      continue;
    }

    if (prev.fingerprint !== fingerprint) {
      const priorAck =
        prev.status === "ACKNOWLEDGED"
          ? {
              ackActor: prev.ackActor,
              ackAt: prev.ackAt?.toISOString() ?? null,
              ackNote: prev.ackNote,
              fingerprint: prev.fingerprint,
            }
          : null;
      await db
        .update(anomalyFindings)
        .set({
          fingerprint,
          severity: d.severity,
          blocks: [...d.blocks],
          title: d.title,
          detail: d.detail,
          evidence: d.evidence,
          status: "OPEN",
          ackActor: null,
          ackAt: null,
          ackNote: null,
          detectedRevision: revision,
          resolvedAt: null,
          resolvedRevision: null,
          resolutionType: null,
          updatedAt: new Date(),
        })
        .where(eq(anomalyFindings.id, prev.id));
      await db.insert(findingEvents).values({
        findingId: prev.id,
        kind: "REOPENED",
        actor: "system",
        evidence: {
          ...d.evidence,
          reason: "EVIDENCE_CHANGED",
          priorAcknowledgement: priorAck,
        },
      });
      touched += 1;
      continue;
    }

    // Same fingerprint — revision-bound acknowledgement (Option 2).
    const revisionChanged = prev.detectedRevision !== revision;
    const gateRelevant =
      prev.severity !== "INFO" && (prev.blocks?.length ?? 0) > 0;

    if (revisionChanged && prev.status === "ACKNOWLEDGED" && gateRelevant) {
      const priorAck = {
        ackActor: prev.ackActor,
        ackAt: prev.ackAt?.toISOString() ?? null,
        ackNote: prev.ackNote,
        fingerprint: prev.fingerprint,
        priorDetectedRevision: prev.detectedRevision,
      };
      await db
        .update(anomalyFindings)
        .set({
          status: "OPEN",
          ackActor: null,
          ackAt: null,
          ackNote: null,
          detectedRevision: revision,
          updatedAt: new Date(),
        })
        .where(eq(anomalyFindings.id, prev.id));
      await db.insert(findingEvents).values({
        findingId: prev.id,
        kind: "REOPENED",
        actor: "system",
        evidence: {
          reason: "REVISION_CHANGED",
          priorAcknowledgement: priorAck,
          calcRevision: revision,
        },
      });
      touched += 1;
      continue;
    }

    if (revisionChanged && prev.status === "OPEN") {
      await db
        .update(anomalyFindings)
        .set({
          detectedRevision: revision,
          updatedAt: new Date(),
        })
        .where(eq(anomalyFindings.id, prev.id));
      touched += 1;
    }
  }

  for (const prev of existing) {
    const key = `${prev.lineId ?? ""}:${prev.ruleId}`;
    if (seen.has(key) || prev.status === "RESOLVED") {
      continue;
    }
    await db
      .update(anomalyFindings)
      .set({
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolvedRevision: revision,
        resolutionType: "CONDITION_CLEARED",
        updatedAt: new Date(),
      })
      .where(eq(anomalyFindings.id, prev.id));
    await db.insert(findingEvents).values({
      findingId: prev.id,
      kind: "RESOLVED",
      actor: "system",
      evidence: { resolutionType: "CONDITION_CLEARED" },
    });
    touched += 1;
  }

  return touched;
}

async function loadPriorRegularBaseline(
  db: DbOrTx,
  run: typeof payRuns.$inferSelect
): Promise<{
  runId: string;
  byEmployment: Map<
    string,
    {
      netSen: number | null;
      epfEeSen: number | null;
      socsoEeCoreSen: number | null;
      eisEeSen: number | null;
      activeInPeriod: boolean;
    }
  >;
} | null> {
  if (run.runType !== "REGULAR") {
    // Off-cycle uses most recent prior REGULAR as baseline too
  }
  const [priorRun] = await db
    .select()
    .from(payRuns)
    .where(
      and(
        eq(payRuns.companyId, run.companyId),
        eq(payRuns.runType, "REGULAR"),
        ne(payRuns.id, run.id),
        inArray(payRuns.status, ["APPROVED", "CLOSED"]),
        sql`(${payRuns.year}, ${payRuns.month}) < (${run.year}, ${run.month})`
      )
    )
    .orderBy(desc(payRuns.year), desc(payRuns.month))
    .limit(1);

  if (priorRun === undefined) {
    return null;
  }

  const priorLines = await db
    .select({
      employmentId: payLines.employmentId,
      netSen: payLines.netSen,
      epfEeSen: payLines.epfEeSen,
      socsoEeCoreSen: payLines.socsoEeCoreSen,
      eisEeSen: payLines.eisEeSen,
    })
    .from(payLines)
    .where(eq(payLines.runId, priorRun.id));

  const priorEmploymentIds = priorLines.map((l) => l.employmentId);
  const priorEmps =
    priorEmploymentIds.length === 0
      ? []
      : await db
          .select({
            id: employments.id,
            joinDate: employments.joinDate,
            terminationDate: employments.terminationDate,
          })
          .from(employments)
          .where(inArray(employments.id, priorEmploymentIds));
  const empMeta = new Map(priorEmps.map((e) => [e.id, e]));

  const byEmployment = new Map(
    priorLines.map((l) => {
      const meta = empMeta.get(l.employmentId);
      const activeInPeriod =
        meta === undefined
          ? true
          : employmentActiveInPeriod(
              meta.joinDate,
              meta.terminationDate,
              run.periodStart,
              run.periodEnd
            );
      return [
        l.employmentId,
        {
          netSen: l.netSen,
          epfEeSen: l.epfEeSen,
          socsoEeCoreSen: l.socsoEeCoreSen,
          eisEeSen: l.eisEeSen,
          activeInPeriod,
        },
      ];
    })
  );

  return { runId: priorRun.id, byEmployment };
}

/** Overlap: joinDate ≤ periodEnd AND (terminationDate IS NULL OR terminationDate ≥ periodStart). */
function employmentActiveInPeriod(
  joinDate: string,
  terminationDate: string | null,
  periodStart: string,
  periodEnd: string
): boolean {
  if (joinDate > periodEnd) {
    return false;
  }
  if (terminationDate !== null && terminationDate < periodStart) {
    return false;
  }
  return true;
}

async function employmentHasPriorLine(
  db: DbOrTx,
  employmentId: string,
  currentRunId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: payLines.id })
    .from(payLines)
    .where(
      and(
        eq(payLines.employmentId, employmentId),
        ne(payLines.runId, currentRunId)
      )
    )
    .limit(1);
  return row !== undefined;
}

async function bankDetailsChanged(
  db: DbOrTx,
  employmentId: string,
  current: { bank: string; account: string }
): Promise<boolean> {
  // Compare against the latest PAID attempt for this employment on any prior
  // line — payment_attempts.line_id is the paid run's line, not the current one.
  const [prior] = await db
    .select({ bankSnapshot: paymentAttempts.bankSnapshot })
    .from(paymentAttempts)
    .innerJoin(payLines, eq(paymentAttempts.lineId, payLines.id))
    .where(
      and(
        eq(payLines.employmentId, employmentId),
        eq(paymentAttempts.status, "PAID")
      )
    )
    .orderBy(desc(paymentAttempts.settledAt))
    .limit(1);
  if (prior === undefined) {
    return false;
  }
  const snap = prior.bankSnapshot as {
    bank?: string;
    account?: string;
  };
  return (
    (snap.bank ?? "") !== current.bank ||
    (snap.account ?? "") !== current.account
  );
}

async function overlappingRunMemberships(
  db: DbOrTx,
  run: typeof payRuns.$inferSelect,
  employmentIds: readonly string[]
): Promise<
  readonly {
    employmentId: string;
    lineId: string;
    otherRunId: string;
  }[]
> {
  if (employmentIds.length === 0) {
    return [];
  }
  const peers = await db
    .select({
      employmentId: payLines.employmentId,
      lineId: payLines.id,
      otherRunId: payRuns.id,
    })
    .from(payLines)
    .innerJoin(payRuns, eq(payLines.runId, payRuns.id))
    .where(
      and(
        inArray(payLines.employmentId, [...employmentIds]),
        ne(payRuns.id, run.id),
        eq(payRuns.companyId, run.companyId),
        eq(payRuns.year, run.year),
        eq(payRuns.month, run.month),
        sql`${payRuns.status} <> 'CLOSED'`
      )
    );

  // Map peer employment → current line id
  const currentLineByEmp = new Map(
    (
      await db
        .select({
          employmentId: payLines.employmentId,
          lineId: payLines.id,
        })
        .from(payLines)
        .where(eq(payLines.runId, run.id))
    ).map((r) => [r.employmentId, r.lineId])
  );

  return peers.map((p) => ({
    employmentId: p.employmentId,
    lineId: currentLineByEmp.get(p.employmentId) ?? p.lineId,
    otherRunId: p.otherRunId,
  }));
}
