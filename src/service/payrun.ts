/**
 * Run creation and recomputation.
 *
 * Each function is one transaction. The engine is called, never reimplemented:
 * this layer's job is to decide *which* employments belong in a run, freeze what
 * they looked like, and store what the engine produced.
 */

import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { employmentPayItems, payItems } from "@/db/schema/catalog";
import { employments, persons } from "@/db/schema/parties";
import { rulePacks } from "@/db/schema/rule-pack";
import { auditEvents, payLineItems, payLines, payRuns } from "@/db/schema/run";
import { computeLineChecked } from "@/domain/calc/compose";
import type { EmployeeSnapshot, LineResult } from "@/domain/calc/types";
import type { ValidationIssue } from "@/domain/calc/validate";
import { CALC_ENGINE_VERSION } from "@/domain/calc/version";
import { loadRunForCompute } from "@/repo/pay-run";
import {
  loadPayItems,
  loadRuleSettings,
  loadStatutoryTables,
} from "@/repo/rule-pack";

export interface CreateRunInput {
  readonly runId: string;
  readonly companyId: string;
  readonly rulePackId: string;
  readonly year: number;
  readonly month: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly workingDays: number;
  readonly paidDays?: number | null;
  readonly actor: string;
  /** Off-cycle runs contain only the employments named here. */
  readonly onlyEmploymentIds?: readonly string[];
  readonly runType?: "REGULAR" | "OFFCYCLE";
  readonly offcycleReason?:
    | "CORRECTION"
    | "ARREARS"
    | "BONUS"
    | "MISSED_PAYMENT"
    | "FINAL_PAYMENT"
    | null;
}

/**
 * Creates the run and one line per included employment.
 *
 * Membership is by employment-period overlap, never by an active flag: an
 * employment ended mid-month must still appear in its own final run, and a run
 * created after that termination date would otherwise silently drop it.
 */
export async function createRun(
  db: Database,
  input: CreateRunInput
): Promise<{ runId: string; lineCount: number }> {
  return await db.transaction(async (tx) => {
    /**
     * The run records the executable representation it used, not just its name.
     * A pack id resolves to different content once the law changes; the hash and
     * the engine version are what make "reproduce July 2026" specific.
     *
     * The database independently refuses a pack that is not approved — this read
     * is to capture the hash, not to authorise anything.
     */
    const [pack] = await tx
      .select({ contentHash: rulePacks.contentHash })
      .from(rulePacks)
      .where(eq(rulePacks.id, input.rulePackId))
      .limit(1);

    if (pack === undefined) {
      throw new Error(`no such rule pack: ${input.rulePackId}`);
    }

    await tx.insert(payRuns).values({
      id: input.runId,
      companyId: input.companyId,
      runType: input.runType ?? "REGULAR",
      offcycleReason: input.offcycleReason ?? null,
      year: input.year,
      month: input.month,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      workingDays: input.workingDays,
      rulePackId: input.rulePackId,
      rulePackHash: pack.contentHash,
      calcEngineVersion: CALC_ENGINE_VERSION,
      createdBy: input.actor,
    });

    const members = await tx
      .select({
        employment: employments,
        personName: persons.name,
        personDob: persons.dob,
      })
      .from(employments)
      .innerJoin(persons, eq(persons.id, employments.personId))
      .where(
        and(
          eq(employments.companyId, input.companyId),
          // join_date <= periodEnd AND (termination_date IS NULL OR >= periodStart)
          sql`${employments.joinDate} <= ${input.periodEnd}`,
          or(
            isNull(employments.terminationDate),
            sql`${employments.terminationDate} >= ${input.periodStart}`
          )
        )
      )
      .orderBy(asc(employments.employeeCode));

    const selected =
      input.onlyEmploymentIds === undefined
        ? members
        : members.filter((m) =>
            input.onlyEmploymentIds?.includes(m.employment.id)
          );

    const catalog = await tx.select().from(payItems);
    const catalogById = new Map(catalog.map((item) => [item.id, item]));

    for (const member of selected) {
      const snapshot = toEmployeeSnapshot(
        member.employment,
        member.personName,
        member.personDob
      );

      const [line] = await tx
        .insert(payLines)
        .values({
          runId: input.runId,
          employmentId: member.employment.id,
          employeeSnapshot: snapshot,
          workingDays: input.workingDays,
          paidDays:
            input.paidDays === undefined || input.paidDays === null
              ? null
              : String(input.paidDays),
          periodEnd: input.periodEnd,
        })
        .returning({ id: payLines.id });

      if (line === undefined) {
        throw new Error(
          `failed to create a line for employment ${member.employment.id}`
        );
      }

      const defaults = await tx
        .select()
        .from(employmentPayItems)
        .where(
          and(
            eq(employmentPayItems.employmentId, member.employment.id),
            eq(employmentPayItems.active, true)
          )
        );

      for (const entry of defaults) {
        const item = catalogById.get(entry.payItemId);
        if (item === undefined) {
          throw new Error(`pay item ${entry.payItemId} is not in the catalog`);
        }
        // BASIC is derived by the engine from the employee's base rate; carrying
        // it as an entered item too would double the earning.
        if (item.code === "BASIC") {
          continue;
        }
        await tx
          .insert(payLineItems)
          .values(
            snapshotLineItem(line.id, item, entry, defaultQuantity(item, input))
          );
      }
    }

    await tx.insert(auditEvents).values({
      actor: input.actor,
      runId: input.runId,
      entity: "pay_runs",
      entityId: input.runId,
      action: "CREATE",
      after: { lineCount: selected.length },
    });

    return { runId: input.runId, lineCount: selected.length };
  });
}

type CatalogItem = typeof payItems.$inferSelect;
type ItemDefault = typeof employmentPayItems.$inferSelect;

function isQuantityBasis(basis: CatalogItem["rateBasis"]): boolean {
  return basis === "PER_DAY" || basis === "PER_HOUR" || basis === "PER_UNIT";
}

/**
 * How many units a newly created line starts with.
 *
 * A per-day item defaults to the run's paid days — the common case is an
 * allowance earned on every day worked. Per-hour and per-unit items have no
 * sensible default, so they start at zero and wait for a real figure rather than
 * inventing one.
 */
function defaultQuantity(
  item: CatalogItem,
  input: Pick<CreateRunInput, "paidDays" | "workingDays">
): number {
  if (item.rateBasis === "PER_DAY") {
    return input.paidDays ?? input.workingDays;
  }
  return 0;
}

/**
 * Freezes the catalog definition onto the line item.
 *
 * Everything read back later comes from these `_snap` columns, so editing the
 * catalog tomorrow cannot change what this run was calculated from.
 */
function snapshotLineItem(
  lineId: string,
  item: CatalogItem,
  entry: ItemDefault,
  quantity: number
): typeof payLineItems.$inferInsert {
  const quantityBased = isQuantityBasis(item.rateBasis);
  return {
    lineId,
    payItemId: item.id,
    itemCodeSnap: item.code,
    kindSnap: item.kind,
    basisSnap: item.rateBasis,
    nameEnSnap: item.nameEn,
    nameMsSnap: item.nameMs,
    epfWagesSnap: item.epfWages,
    socsoWagesSnap: item.socsoWages,
    eisWagesSnap: item.eisWages,
    proratesSnap: item.prorates,
    sortSnap: item.sort,
    quantity: quantityBased ? String(quantity) : null,
    rateSen: quantityBased ? entry.rateSen : null,
    amountSen: quantityBased ? null : entry.amountSen,
    resolvedAmountSen: quantityBased
      ? Math.round(quantity * (entry.rateSen ?? 0))
      : (entry.amountSen ?? 0),
  };
}

function toEmployeeSnapshot(
  employment: typeof employments.$inferSelect,
  personName: string,
  personDob: string | null
): EmployeeSnapshot {
  return {
    id: employment.employeeCode,
    name: personName,
    isMalaysian: employment.isMalaysian,
    isPermanentResident: employment.isPermanentResident,
    dob: personDob,
    payBasis: employment.payBasis,
    baseRateSen: employment.baseRateSen,
    epfApplicable: employment.epfApplicable,
    socsoApplicable: employment.socsoApplicable,
    eisApplicable: employment.eisApplicable,
    pcbApplicable: employment.pcbApplicable,
    epfMemberBeforeAug1998: employment.epfMemberBeforeAug1998,
    eisPriorContribution: employment.eisPriorContribution,
    epfPartOverride: employment.epfPartOverride,
    socsoCategoryOverride: employment.socsoCategoryOverride,
  };
}

export interface RecomputeFailure {
  readonly lineId: string;
  readonly issues: ValidationIssue[];
}

export interface RecomputeOutcome {
  readonly computed: number;
  readonly failures: RecomputeFailure[];
}

/**
 * Recomputes every line of a run and stores the result.
 *
 * Validation failures are returned, not thrown, and nothing is persisted for a
 * failing line: structured issues with field paths are what a form or an API can
 * report, where an exception out of the arithmetic is not.
 */
export async function recomputeRun(
  db: Database,
  runId: string,
  actor: string
): Promise<RecomputeOutcome> {
  const run = await loadRunForCompute(db, runId);
  const [tables, settings, catalog] = await Promise.all([
    loadStatutoryTables(db, run.rulePackId),
    loadRuleSettings(db, run.rulePackId),
    loadPayItems(db),
  ]);

  const failures: RecomputeFailure[] = [];
  let computed = 0;

  await db.transaction(async (tx) => {
    for (const line of run.lines) {
      const outcome = computeLineChecked({
        employee: line.employee,
        inputs: line.inputs,
        payItems: catalog,
        tables,
        settings,
        overrides: line.overrides,
        pcb: line.pcb,
      });

      if (!outcome.ok) {
        failures.push({ lineId: line.lineId, issues: outcome.issues });
        continue;
      }

      await tx
        .update(payLines)
        .set(toLineColumns(outcome.result))
        .where(eq(payLines.id, line.lineId));
      computed += 1;
    }

    await tx
      .update(payRuns)
      .set({ calculatedAt: new Date(), calcEngineVersion: CALC_ENGINE_VERSION })
      .where(eq(payRuns.id, runId));

    await tx.insert(auditEvents).values({
      actor,
      runId,
      entity: "pay_runs",
      entityId: runId,
      action: "RECOMPUTE",
      after: { computed, failed: failures.length },
    });
  });

  return { computed, failures };
}

function toLineColumns(result: LineResult) {
  return {
    grossSen: result.grossSen,
    epfWagesSen: result.epfWagesSen,
    socsoWagesSen: result.socsoWagesSen,
    eisWagesSen: result.eisWagesSen,
    epfEeSen: result.epfEeSen,
    epfErSen: result.epfErSen,
    socsoEeCoreSen: result.socsoEeCoreSen,
    socsoEeSkbbkSen: result.socsoEeSkbbkSen,
    socsoErSen: result.socsoErSen,
    eisEeSen: result.eisEeSen,
    eisErSen: result.eisErSen,
    pcbNetSen: result.pcbNetSen,
    cp38Sen: result.cp38Sen,
    zakatSen: result.zakatSen,
    otherDeductionsSen: result.otherDeductionsSen,
    deductionsTotalSen: result.deductionsTotalSen,
    netSen: result.netSen,
    trace: result.trace,
    computedAt: new Date(),
  };
}
