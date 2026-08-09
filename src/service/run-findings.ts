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
  NET_VARIANCE_ABS_SEN,
  NET_VARIANCE_PCT,
  OT_HOURS_OUTLIER,
  OT_PAY_VS_BASIC_RATIO,
  ruleDef,
  VARIABLE_ITEM_SPIKE_SEN,
} from "@/domain/findings/catalog";
import { fingerprintOf } from "@/domain/findings/fingerprint";
import type { DetectedFinding } from "@/domain/findings/types";
import { ControlError } from "./control-errors";
import { scanRunTransferFindings } from "./findings";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Transaction;

interface LineScanRow {
  readonly lineId: string;
  readonly employmentId: string;
  readonly netSen: number | null;
  readonly epfEeSen: number | null;
  readonly socsoEeCoreSen: number | null;
  readonly eisEeSen: number | null;
  readonly employeeSnapshot: Record<string, unknown>;
}

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
      eisEeSen: payLines.eisEeSen,
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
    eisEeSen: l.eisEeSen,
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
    const snap = line.employeeSnapshot;
    const emp = empById.get(line.employmentId);
    const pcbApplicable = snap.pcbApplicable !== false;
    const pcb = pcbByLine.get(line.lineId);

    if (pcbApplicable && (pcb === undefined || !pcb.verified)) {
      out.push(
        detected("PCB_UNVERIFIED", run.id, line.lineId, {
          pcbAmountSen: pcb?.pcbAmountSen ?? null,
          verified: pcb?.verified ?? false,
        })
      );
    }

    if (line.netSen !== null && line.netSen < 0) {
      out.push(
        detected("NET_NEGATIVE", run.id, line.lineId, { netSen: line.netSen })
      );
    }
    if (line.netSen === 0) {
      out.push(
        detected("NET_ZERO", run.id, line.lineId, { netSen: line.netSen })
      );
    }

    const baseline = priorByEmployment.get(line.employmentId);
    if (
      baseline !== undefined &&
      line.netSen !== null &&
      baseline.netSen !== null
    ) {
      const abs = Math.abs(line.netSen - baseline.netSen);
      const pct = netVariancePct(abs, baseline.netSen);
      if (abs > NET_VARIANCE_ABS_SEN && pct > NET_VARIANCE_PCT) {
        out.push(
          detected("NET_VARIANCE_VS_PRIOR", run.id, line.lineId, {
            netSen: line.netSen,
            baselineNetSen: baseline.netSen,
            baselineRunId: prior?.runId ?? null,
            absVarianceSen: abs,
            pct,
          })
        );
      }

      if (wagesSimilar(line, baseline) && statutoryStepShift(line, baseline)) {
        out.push(
          detected("STATUTORY_STEP_SHIFT", run.id, line.lineId, {
            epfEeSen: line.epfEeSen,
            baselineEpfEeSen: baseline.epfEeSen,
            socsoEeCoreSen: line.socsoEeCoreSen,
            baselineSocsoEeCoreSen: baseline.socsoEeCoreSen,
            eisEeSen: line.eisEeSen,
            baselineEisEeSen: baseline.eisEeSen,
          })
        );
      }
    }

    const epfApplicable = snap.epfApplicable !== false;
    const socsoApplicable = snap.socsoApplicable !== false;
    const eisApplicable = snap.eisApplicable !== false;
    const wagesProxy = Number(snap.baseRateSen ?? 0);

    if (
      (epfApplicable && wagesProxy > 0 && (line.epfEeSen ?? 0) === 0) ||
      (socsoApplicable && wagesProxy > 0 && (line.socsoEeCoreSen ?? 0) === 0) ||
      (eisApplicable && wagesProxy > 0 && (line.eisEeSen ?? 0) === 0)
    ) {
      out.push(
        detected("STATUTORY_ZERO_WITH_WAGES", run.id, line.lineId, {
          epfEeSen: line.epfEeSen,
          socsoEeCoreSen: line.socsoEeCoreSen,
          eisEeSen: line.eisEeSen,
          baseRateSen: wagesProxy,
        })
      );
    }

    if (
      eisApplicable &&
      emp?.eisPriorContribution === null &&
      isAge57Plus(snap)
    ) {
      out.push(
        detected("EIS_AGE_HISTORY_UNRESOLVED", run.id, line.lineId, {
          eisPriorContribution: null,
          age: snap.age ?? null,
        })
      );
    }

    const lineItems = itemsByLine.get(line.lineId) ?? [];
    for (const item of lineItems) {
      if (item.itemCodeSnap === "OT") {
        const hours = Number(item.quantity ?? 0);
        const otPay = item.resolvedAmountSen ?? 0;
        const basic = Number(snap.baseRateSen ?? 0);
        if (
          hours > OT_HOURS_OUTLIER ||
          (basic > 0 && otPay > basic * OT_PAY_VS_BASIC_RATIO)
        ) {
          out.push(
            detected("OT_OUTLIER", run.id, line.lineId, {
              hours,
              otPaySen: otPay,
              basicSen: basic,
            })
          );
        }
      }
      if (
        item.itemCodeSnap !== "BASIC" &&
        item.itemCodeSnap !== "OT" &&
        (item.resolvedAmountSen ?? 0) > VARIABLE_ITEM_SPIKE_SEN
      ) {
        out.push(
          detected("VARIABLE_ITEM_SPIKE", run.id, line.lineId, {
            itemCode: item.itemCodeSnap,
            amountSen: item.resolvedAmountSen,
          })
        );
      }
    }

    if (baseline === undefined && prior !== null) {
      // first appearance in this app relative to prior regular baseline existence
      // handled below via NEW_EMPLOYEE when no prior line ever
    }
    if (prior !== null && baseline === undefined) {
      // employee is in this run but was not in baseline — not NEW; skip
    } else if (prior === null || baseline === undefined) {
      const everPaid = await employmentHasPriorLine(
        db,
        line.employmentId,
        run.id
      );
      if (!everPaid) {
        out.push(
          detected("NEW_EMPLOYEE", run.id, line.lineId, {
            employmentId: line.employmentId,
          })
        );
      }
    }

    if (emp !== undefined) {
      const missing: string[] = [];
      if (epfApplicable && blank(emp.epfNo)) {
        missing.push("epfNo");
      }
      if (socsoApplicable && blank(emp.socsoNo)) {
        missing.push("socsoNo");
      }
      if (pcbApplicable && blank(emp.tin)) {
        missing.push("tin");
      }
      if (missing.length > 0) {
        out.push(
          detected("MISSING_STATUTORY_NO", run.id, line.lineId, { missing })
        );
      }

      const account = emp.bankAccountNo?.trim() ?? "";
      const bank = emp.bankName?.trim() ?? "";
      if (account === "" || bank === "") {
        out.push(
          detected("BANK_DETAILS_MISSING", run.id, line.lineId, {
            bankName: bank || null,
            bankAccountNo: account || null,
          })
        );
      } else {
        const changed = await bankDetailsChanged(db, line.lineId, {
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

function detected(
  ruleId: string,
  runId: string,
  lineId: string | null,
  evidence: Record<string, unknown>
): DetectedFinding {
  const def = ruleDef(ruleId);
  return {
    ruleId,
    severity: def.severity,
    blocks: def.blocks,
    title: def.title,
    detail: def.title,
    evidence,
    runId,
    lineId,
  };
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
          priorAcknowledgement: priorAck,
        },
      });
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

  const byEmployment = new Map(
    priorLines.map((l) => [
      l.employmentId,
      {
        netSen: l.netSen,
        epfEeSen: l.epfEeSen,
        socsoEeCoreSen: l.socsoEeCoreSen,
        eisEeSen: l.eisEeSen,
        activeInPeriod: true,
      },
    ])
  );

  return { runId: priorRun.id, byEmployment };
}

function netVariancePct(
  absVarianceSen: number,
  baselineNetSen: number
): number {
  if (baselineNetSen === 0) {
    return absVarianceSen > 0 ? 1 : 0;
  }
  return absVarianceSen / Math.abs(baselineNetSen);
}

function wagesSimilar(
  line: LineScanRow,
  baseline: { epfEeSen: number | null; netSen: number | null }
): boolean {
  // Proxy: nets within 10% → wages considered similar for step-shift rule
  if (
    line.netSen === null ||
    baseline.netSen === null ||
    baseline.netSen === 0
  ) {
    return false;
  }
  const pct =
    Math.abs(line.netSen - baseline.netSen) / Math.abs(baseline.netSen);
  return pct <= 0.1;
}

function statutoryStepShift(
  line: LineScanRow,
  baseline: {
    epfEeSen: number | null;
    socsoEeCoreSen: number | null;
    eisEeSen: number | null;
  }
): boolean {
  const steps = (a: number | null, b: number | null) => {
    if (a === null || b === null || a === b) {
      return false;
    }
    // Band tables are discrete; any non-equal contribution with similar wages
    // is treated as ≥1 step for REVIEW severity.
    return true;
  };
  return (
    steps(line.epfEeSen, baseline.epfEeSen) ||
    steps(line.socsoEeCoreSen, baseline.socsoEeCoreSen) ||
    steps(line.eisEeSen, baseline.eisEeSen)
  );
}

function isAge57Plus(snap: Record<string, unknown>): boolean {
  const { age } = snap;
  return typeof age === "number" && age >= 57;
}

function blank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
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
  lineId: string,
  current: { bank: string; account: string }
): Promise<boolean> {
  const [prior] = await db
    .select({ bankSnapshot: paymentAttempts.bankSnapshot })
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.lineId, lineId),
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
