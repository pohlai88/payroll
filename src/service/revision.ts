/**
 * @feature pay-run
 * @layer service
 * @hub src/server/routes/pay-run.ts
 *
 * Canonical calcRevision hash over calculation-relevant run state.
 */

import { createHash } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import {
  payLineItems,
  payLineOverrides,
  payLines,
  payRuns,
  pcbEntries,
} from "@/db/schema/run";

/**
 * Deterministic hash of calc-relevant state for a run.
 * Excludes payment/distribution/UI/acknowledgment fields.
 */
async function computeCalcRevision(db: DbOrTx, runId: string): Promise<string> {
  const [run] = await db
    .select({
      id: payRuns.id,
      companyId: payRuns.companyId,
      year: payRuns.year,
      month: payRuns.month,
      periodStart: payRuns.periodStart,
      periodEnd: payRuns.periodEnd,
      workingDays: payRuns.workingDays,
      rulePackId: payRuns.rulePackId,
      rulePackHash: payRuns.rulePackHash,
      calcEngineVersion: payRuns.calcEngineVersion,
      runType: payRuns.runType,
    })
    .from(payRuns)
    .where(eq(payRuns.id, runId))
    .limit(1);

  if (run === undefined) {
    throw new Error(`no such run: ${runId}`);
  }

  const lines = await db
    .select({
      id: payLines.id,
      employmentId: payLines.employmentId,
      employeeSnapshot: payLines.employeeSnapshot,
      workingDays: payLines.workingDays,
      paidDays: payLines.paidDays,
      hoursWorked: payLines.hoursWorked,
      periodEnd: payLines.periodEnd,
      grossSen: payLines.grossSen,
      netSen: payLines.netSen,
      epfEeSen: payLines.epfEeSen,
      socsoEeCoreSen: payLines.socsoEeCoreSen,
      eisEeSen: payLines.eisEeSen,
      pcbNetSen: payLines.pcbNetSen,
    })
    .from(payLines)
    .where(eq(payLines.runId, runId))
    .orderBy(asc(payLines.employmentId));

  const lineIds = lines.map((l) => l.id);
  const items =
    lineIds.length === 0
      ? []
      : await db
          .select({
            lineId: payLineItems.lineId,
            itemCodeSnap: payLineItems.itemCodeSnap,
            resolvedAmountSen: payLineItems.resolvedAmountSen,
            quantity: payLineItems.quantity,
            rateSen: payLineItems.rateSen,
            amountSen: payLineItems.amountSen,
          })
          .from(payLineItems)
          .where(inArray(payLineItems.lineId, lineIds))
          .orderBy(asc(payLineItems.lineId), asc(payLineItems.itemCodeSnap));

  const overrides =
    lineIds.length === 0
      ? []
      : await db
          .select({
            lineId: payLineOverrides.lineId,
            field: payLineOverrides.field,
            overrideSen: payLineOverrides.overrideSen,
          })
          .from(payLineOverrides)
          .where(inArray(payLineOverrides.lineId, lineIds))
          .orderBy(asc(payLineOverrides.lineId), asc(payLineOverrides.field));

  const pcbs =
    lineIds.length === 0
      ? []
      : await db
          .select({
            lineId: pcbEntries.lineId,
            pcbAmountSen: pcbEntries.pcbAmountSen,
            verified: pcbEntries.verified,
            cp38Sen: pcbEntries.cp38Sen,
            zakatOffsetSen: pcbEntries.zakatOffsetSen,
          })
          .from(pcbEntries)
          .where(inArray(pcbEntries.lineId, lineIds))
          .orderBy(asc(pcbEntries.lineId));

  const payload = {
    run,
    lines: lines.map((l) => ({
      ...l,
      items: items.filter((i) => i.lineId === l.id),
      overrides: overrides.filter((o) => o.lineId === l.id),
      pcb: pcbs.find((p) => p.lineId === l.id) ?? null,
    })),
  };

  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

/** Stamp calcRevision on the run (caller holds the transaction when needed). */
export async function stampCalcRevision(
  db: DbOrTx,
  runId: string
): Promise<string> {
  const revision = await computeCalcRevision(db, runId);
  await db
    .update(payRuns)
    .set({ calcRevision: revision })
    .where(eq(payRuns.id, runId));
  return revision;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}
