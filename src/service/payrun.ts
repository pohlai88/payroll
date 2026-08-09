/**
 * @feature pay-run
 * @layer service
 * @hub src/server/routes/pay-run.ts
 *
 * Run creation and recomputation.
 *
 * Each function is one transaction. The engine is called, never reimplemented:
 * this layer's job is to decide *which* employments belong in a run, freeze what
 * they looked like, and store what the engine produced.
 */

import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/client";
import { employmentPayItems, payItems } from "@/db/schema/catalog";
import { employments, persons } from "@/db/schema/parties";
import { rulePacks } from "@/db/schema/rule-pack";
import { auditEvents, payLineItems, payLines, payRuns } from "@/db/schema/run";
import { payItemPcbClasses } from "@/db/schema/treatments";
import { computeLineChecked } from "@/domain/calc/compose";
import { pcbClassForItem } from "@/domain/calc/pcb-context";
import type {
  EmployeeSnapshot,
  LineResult,
  PcbRemunerationClass,
} from "@/domain/calc/types";
import type { ValidationIssue } from "@/domain/calc/validate";
import { CALC_ENGINE_VERSION } from "@/domain/calc/version";
import { parseIsoDate } from "@/domain/date";
import { quantityAmountSen } from "@/domain/money";
import { PermissionDeniedError } from "@/domain/rbac/authorize";
import type { PermissionAction } from "@/domain/rbac/types";
import { isUniqueViolation } from "@/lib/pg-error";
import {
  getPayRunCompanyId,
  listPayRunSummaries,
  loadRunForCompute,
  type PayRunSummary,
} from "@/repo/pay-run";
import {
  loadPayItems,
  loadRuleSettings,
  loadStatutoryTables,
} from "@/repo/rule-pack";
import { RuleResolutionError, resolveRule } from "@/repo/rule-resolution";
import { ControlError } from "@/service/control-errors";
import { certifyGate, evaluateGate } from "@/service/gates";
import { createReadyPaymentsForRun } from "@/service/payments";
import { listAccessibleCompanies, requirePermission } from "@/service/rbac";
import { stampCalcRevision } from "@/service/revision";
import { scanRunFindings } from "@/service/run-findings";

const CONFLICT_MESSAGE = /already exists|duplicate|unique/i;

export type PayRunErrorCode = "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT";

export class PayRunError extends Error {
  readonly code: PayRunErrorCode;
  readonly status: number;

  constructor(
    code: PayRunErrorCode,
    message: string,
    status: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "PayRunError";
    this.code = code;
    this.status = status;
  }
}

export interface PayRunActor {
  readonly userId: string;
  readonly email: string;
}

export interface CreateRunInput {
  readonly runId: string;
  readonly companyId: string;
  /**
   * Explicit pack id for reproducible runs. When omitted, `resolveRule`
   * picks the single approved `MY-STATUTORY` pack in force on `periodEnd`.
   */
  readonly rulePackId?: string;
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
    const rulePackId =
      input.rulePackId ??
      (
        await resolveRule(tx, {
          scheme: "STATUTORY_CALCULATION",
          ruleCode: "MY-STATUTORY",
          statutoryDate: input.periodEnd,
        })
      ).rulePackId;
    const resolved: CreateRunInput & { rulePackId: string } = {
      ...input,
      rulePackId,
    };
    const pack = await loadApprovedRulePack(tx, resolved.rulePackId);
    await insertRunRow(tx, resolved, pack.contentHash);

    const members = await loadPeriodMembers(tx, resolved);
    const selected = selectMembers(members, resolved);

    const catalog = await tx.select().from(payItems);
    const catalogById = new Map(catalog.map((item) => [item.id, item]));
    const pcbClassByItemId = await loadOpenPcbClasses(tx);

    for (const member of selected) {
      await createLineForMember(
        tx,
        resolved,
        member,
        catalogById,
        pcbClassByItemId
      );
    }

    await tx.insert(auditEvents).values({
      actor: resolved.actor,
      runId: resolved.runId,
      entity: "pay_runs",
      entityId: resolved.runId,
      action: "CREATE",
      after: {
        lineCount: selected.length,
        rulePackId: resolved.rulePackId,
        rulePackResolved: input.rulePackId === undefined,
      },
    });

    return { runId: resolved.runId, lineCount: selected.length };
  });
}

/**
 * The run records the executable representation it used, not just its name.
 * A pack id resolves to different content once the law changes; the hash and
 * the engine version are what make "reproduce July 2026" specific.
 *
 * The database independently refuses a pack that is not approved — this read
 * is to capture the hash, not to authorise anything.
 */
async function loadApprovedRulePack(tx: Transaction, rulePackId: string) {
  const [pack] = await tx
    .select({ contentHash: rulePacks.contentHash })
    .from(rulePacks)
    .where(eq(rulePacks.id, rulePackId))
    .limit(1);

  if (pack === undefined) {
    throw new Error(`no such rule pack: ${rulePackId}`);
  }
  return pack;
}

async function insertRunRow(
  tx: Transaction,
  input: CreateRunInput & { rulePackId: string },
  rulePackHash: string | null
): Promise<void> {
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
    rulePackHash,
    calcEngineVersion: CALC_ENGINE_VERSION,
    createdBy: input.actor,
  });
}

interface PeriodMember {
  employment: typeof employments.$inferSelect;
  personName: string;
  personDob: string | null;
}

/**
 * Membership is by employment-period overlap, never by an active flag: an
 * employment ended mid-month must still appear in its own final run, and a run
 * created after that termination date would otherwise silently drop it.
 */
async function loadPeriodMembers(
  tx: Transaction,
  input: Pick<CreateRunInput, "companyId" | "periodStart" | "periodEnd">
): Promise<PeriodMember[]> {
  return await tx
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
}

/**
 * Narrows membership to `onlyEmploymentIds` for off-cycle runs.
 *
 * An id that does not resolve to an eligible member (wrong company, outside
 * the period-overlap window, or a typo) is a caller error, not a quiet
 * no-op: off-cycle runs exist specifically to pay someone by name, and
 * silently dropping one of those names is how "why wasn't this person paid"
 * surfaces days later instead of immediately.
 */
function selectMembers(
  members: PeriodMember[],
  input: Pick<
    CreateRunInput,
    "onlyEmploymentIds" | "companyId" | "periodStart" | "periodEnd"
  >
): PeriodMember[] {
  if (input.onlyEmploymentIds === undefined) {
    return members;
  }

  const memberIds = new Set(members.map((m) => m.employment.id));
  const unresolved = input.onlyEmploymentIds.filter((id) => !memberIds.has(id));
  if (unresolved.length > 0) {
    throw new Error(
      "onlyEmploymentIds requested employments that are not eligible members of " +
        `company=${input.companyId} period=${input.periodStart}..${input.periodEnd}: ` +
        unresolved.join(", ")
    );
  }

  const requested = new Set(input.onlyEmploymentIds);
  return members.filter((m) => requested.has(m.employment.id));
}

async function loadOpenPcbClasses(
  tx: Transaction
): Promise<Map<string, PcbRemunerationClass>> {
  const rows = await tx
    .select({
      payItemId: payItemPcbClasses.payItemId,
      class: payItemPcbClasses.class,
    })
    .from(payItemPcbClasses)
    .where(isNull(payItemPcbClasses.effectiveTo));
  return new Map(rows.map((r) => [r.payItemId, r.class]));
}

async function createLineForMember(
  tx: Transaction,
  input: CreateRunInput,
  member: PeriodMember,
  catalogById: Map<string, CatalogItem>,
  pcbClassByItemId: Map<string, PcbRemunerationClass>
): Promise<void> {
  const snapshot = toEmployeeSnapshot(
    member.employment,
    member.personName,
    member.personDob
  );
  const paidDaysForMember = membershipPaidDays(member.employment, input);

  const [line] = await tx
    .insert(payLines)
    .values({
      runId: input.runId,
      employmentId: member.employment.id,
      employeeSnapshot: snapshot,
      workingDays: input.workingDays,
      paidDays: paidDaysForMember === null ? null : String(paidDaysForMember),
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

  const itemRows = buildLineItemRows(
    line.id,
    defaults,
    catalogById,
    pcbClassByItemId,
    paidDaysForMember,
    input.workingDays
  );
  if (itemRows.length > 0) {
    await tx.insert(payLineItems).values(itemRows);
  }
}

type CatalogItem = typeof payItems.$inferSelect;
type ItemDefault = typeof employmentPayItems.$inferSelect;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole calendar days spanning [startIso, endIso], inclusive of both ends. */
function calendarDaysInclusive(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso, "calendarDaysInclusive(start)");
  const end = parseIsoDate(endIso, "calendarDaysInclusive(end)");
  const startMs = Date.UTC(start.y, start.m - 1, start.d);
  const endMs = Date.UTC(end.y, end.m - 1, end.d);
  return Math.round((endMs - startMs) / MS_PER_DAY) + 1;
}

/**
 * The paid days a line should start with, given how much of the run's period
 * this specific employment actually spans.
 *
 * An employment that joined or was terminated mid-period is deliberately
 * included in run membership (see `loadPeriodMembers`), but it did not work
 * the run's full period — carrying the run-wide paid/working days onto its
 * line would pay it a full period regardless. This prorates by calendar-day
 * overlap between the employment's span and the period: the same fraction of
 * the run's paid days (or working days, absent an override) that the
 * employment actually covers. An employment that spans the whole period is
 * untouched, preserving the exact figure the caller passed in.
 */
function membershipPaidDays(
  employment: Pick<
    typeof employments.$inferSelect,
    "joinDate" | "terminationDate"
  >,
  input: Pick<
    CreateRunInput,
    "periodStart" | "periodEnd" | "workingDays" | "paidDays"
  >
): number | null {
  const { periodStart, periodEnd, workingDays, paidDays } = input;
  const spansFullPeriod =
    employment.joinDate <= periodStart &&
    (employment.terminationDate === null ||
      employment.terminationDate >= periodEnd);

  if (spansFullPeriod) {
    return paidDays ?? null;
  }

  const overlapStart =
    employment.joinDate > periodStart ? employment.joinDate : periodStart;
  const terminationOrOpen = employment.terminationDate ?? periodEnd;
  const overlapEnd =
    terminationOrOpen < periodEnd ? terminationOrOpen : periodEnd;

  const totalCalendarDays = calendarDaysInclusive(periodStart, periodEnd);
  const overlapCalendarDays = Math.max(
    0,
    calendarDaysInclusive(overlapStart, overlapEnd)
  );
  const runWidePaidDays = paidDays ?? workingDays;

  const prorated = (runWidePaidDays * overlapCalendarDays) / totalCalendarDays;
  return Math.round(prorated * 100) / 100;
}

function isQuantityBasis(basis: CatalogItem["rateBasis"]): boolean {
  return basis === "PER_DAY" || basis === "PER_HOUR" || basis === "PER_UNIT";
}

/**
 * How many units a newly created line starts with.
 *
 * A per-day item defaults to the line's own paid days (already prorated for
 * partial-period membership) — the common case is an allowance earned on
 * every day worked. Per-hour and per-unit items have no sensible default, so
 * they start at zero and wait for a real figure rather than inventing one.
 */
function defaultQuantity(
  item: CatalogItem,
  paidDaysForMember: number | null,
  workingDays: number
): number {
  if (item.rateBasis === "PER_DAY") {
    return paidDaysForMember ?? workingDays;
  }
  return 0;
}

/**
 * Builds every stored line item for a member's default pay items in one pass,
 * so `createLineForMember` can insert them in a single batched statement
 * instead of one round-trip per item.
 */
function buildLineItemRows(
  lineId: string,
  defaults: ItemDefault[],
  catalogById: Map<string, CatalogItem>,
  pcbClassByItemId: Map<string, PcbRemunerationClass>,
  paidDaysForMember: number | null,
  workingDays: number
): (typeof payLineItems.$inferInsert)[] {
  const rows: (typeof payLineItems.$inferInsert)[] = [];
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
    const quantity = defaultQuantity(item, paidDaysForMember, workingDays);
    rows.push(
      snapshotLineItem(
        lineId,
        item,
        entry,
        quantity,
        pcbClassByItemId.get(item.id)
      )
    );
  }
  return rows;
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
  quantity: number,
  pcbClass?: PcbRemunerationClass
): typeof payLineItems.$inferInsert {
  const quantityBased = isQuantityBasis(item.rateBasis);
  if (
    quantityBased &&
    (entry.rateSen === null || entry.rateSen === undefined)
  ) {
    throw new Error(
      `employment pay item ${entry.payItemId} is quantity-based (${item.rateBasis}) but has no rate`
    );
  }
  if (
    !quantityBased &&
    (entry.amountSen === null || entry.amountSen === undefined)
  ) {
    throw new Error(
      `employment pay item ${entry.payItemId} is amount-based (${item.rateBasis}) but has no amount`
    );
  }
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
    pcbClassSnap: pcbClassForItem(item.code, {
      kind: item.kind,
      pcbRemunerationClass: pcbClass,
    }),
    sortSnap: item.sort,
    quantity: quantityBased ? String(quantity) : null,
    rateSen: quantityBased ? entry.rateSen : null,
    amountSen: quantityBased ? null : entry.amountSen,
    resolvedAmountSen: quantityBased
      ? quantityAmountSen(quantity, entry.rateSen as number)
      : (entry.amountSen as number),
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
 * Validation failures are returned, not thrown, and never leave stale figures
 * behind: a line that fails has its previously computed columns cleared, so a
 * consumer reading `pay_lines` cannot mistake last run's numbers for this
 * run's. `pay_runs.calculatedAt`/`calcEngineVersion` are only stamped when
 * every line computed cleanly — a partially failed recompute must not look
 * like a fully calculated run just because its timestamp says so.
 */
export async function recomputeRun(
  db: Database,
  runId: string,
  actor: string
): Promise<RecomputeOutcome> {
  const run = await loadRunForCompute(db, runId);
  // Service guard: do not enter calculation work and rely on the DB immutability
  // trigger. APPROVED/CLOSED corrections use the governed off-cycle path.
  if (run.status === "APPROVED" || run.status === "CLOSED") {
    throw new ControlError(
      "INVALID_STATE",
      `cannot recompute a ${run.status} run — use a governed correction/off-cycle`
    );
  }
  const [tables, settings, catalog] = await Promise.all([
    loadStatutoryTables(db, run.rulePackId),
    loadRuleSettings(db, run.rulePackId),
    loadPayItems(db),
  ]);

  const failures: RecomputeFailure[] = [];
  let computed = 0;

  await db.transaction(async (tx) => {
    // Serializes concurrent recomputes of the same run: the second caller
    // blocks here until the first commits, rather than interleaving writes
    // from two overlapping passes over the same lines.
    await tx
      .select({ id: payRuns.id })
      .from(payRuns)
      .where(eq(payRuns.id, runId))
      .for("update");

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
        await tx
          .update(payLines)
          .set(staleLineColumns())
          .where(eq(payLines.id, line.lineId));
        continue;
      }

      await tx
        .update(payLines)
        .set(toLineColumns(outcome.result))
        .where(eq(payLines.id, line.lineId));
      computed += 1;
    }

    if (failures.length === 0) {
      const [locked] = await tx
        .select({ status: payRuns.status })
        .from(payRuns)
        .where(eq(payRuns.id, runId))
        .limit(1);

      const demote = locked?.status === "REVIEWED";
      await tx
        .update(payRuns)
        .set({
          calculatedAt: new Date(),
          calcEngineVersion: CALC_ENGINE_VERSION,
          // New revision invalidates prior scan until scanRunFindings succeeds.
          findingsScannedRevision: null,
          ...(demote
            ? {
                status: "DRAFT" as const,
                reviewedAt: null,
                reviewedBy: null,
                reviewedRevision: null,
              }
            : {}),
        })
        .where(eq(payRuns.id, runId));
      await stampCalcRevision(tx, runId);
    }

    await tx.insert(auditEvents).values({
      actor,
      runId,
      entity: "pay_runs",
      entityId: runId,
      action: "RECOMPUTE",
      after: { computed, failed: failures.length },
    });
  });

  if (failures.length === 0) {
    // Scan under its own lock after calcRevision is committed.
    await scanRunFindings(db, runId);
  }

  return { computed, failures };
}

/** REVIEWED — certify REVIEW gate and bind reviewedRevision. */
export async function reviewRun(
  db: Database,
  runId: string,
  actor: string,
  calcRevision: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(payRuns)
      .where(eq(payRuns.id, runId))
      .for("update")
      .limit(1);
    if (run === undefined) {
      throw new ControlError("NOT_FOUND", `no such run: ${runId}`);
    }
    if (run.status !== "DRAFT") {
      throw new ControlError(
        "INVALID_STATE",
        `run must be DRAFT to review (currently ${run.status})`
      );
    }
    assertRevisionBound(run, calcRevision);

    const gate = await evaluateGate(tx, runId, "REVIEW");
    if (!gate.ok) {
      throw new ControlError(
        "GATE_BLOCKED",
        `REVIEW blocked: ${gate.issues.map((i) => i.message).join("; ")}`
      );
    }

    await tx
      .update(payRuns)
      .set({
        status: "REVIEWED",
        reviewedAt: new Date(),
        reviewedBy: actor,
        reviewedRevision: calcRevision,
      })
      .where(eq(payRuns.id, runId));
    await certifyGate(tx, {
      runId,
      gate: "REVIEW",
      calcRevision,
      statutoryPackId: run.rulePackId,
      actor,
    });
  });
}

/** APPROVED — freeze calc, create READY line_payments (payment obligation projection). */
export async function approveRun(
  db: Database,
  runId: string,
  actor: string,
  calcRevision: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(payRuns)
      .where(eq(payRuns.id, runId))
      .for("update")
      .limit(1);
    if (run === undefined) {
      throw new ControlError("NOT_FOUND", `no such run: ${runId}`);
    }
    if (run.status !== "REVIEWED") {
      throw new ControlError(
        "INVALID_STATE",
        `run must be REVIEWED to approve (currently ${run.status})`
      );
    }
    assertRevisionBound(run, calcRevision);
    if (run.reviewedRevision !== calcRevision) {
      throw new ControlError(
        "STALE_REVISION",
        "reviewedRevision must equal calcRevision"
      );
    }

    const gate = await evaluateGate(tx, runId, "APPROVAL");
    if (!gate.ok) {
      throw new ControlError(
        "GATE_BLOCKED",
        `APPROVAL blocked: ${gate.issues.map((i) => i.message).join("; ")}`
      );
    }

    await tx
      .update(payRuns)
      .set({
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: actor,
        approvedRevision: calcRevision,
      })
      .where(eq(payRuns.id, runId));
    await createReadyPaymentsForRun(tx, runId);
    await certifyGate(tx, {
      runId,
      gate: "APPROVAL",
      calcRevision,
      statutoryPackId: run.rulePackId,
      actor,
    });
  });
}

function assertRevisionBound(
  run: {
    calcRevision: string | null;
    findingsScannedRevision: string | null;
  },
  bodyRevision: string
): void {
  if (run.calcRevision === null || bodyRevision !== run.calcRevision) {
    throw new ControlError(
      "STALE_REVISION",
      "body.calcRevision must equal pay_runs.calcRevision"
    );
  }
  if (
    run.findingsScannedRevision === null ||
    run.findingsScannedRevision !== run.calcRevision
  ) {
    throw new ControlError(
      "SCAN_INCOMPLETE",
      "findingsScannedRevision must equal calcRevision"
    );
  }
}

/** Demote REVIEWED → DRAFT when calc-affecting edits are needed. */
export async function demoteRunToDraft(
  db: Database,
  runId: string,
  actor: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(payRuns)
      .where(eq(payRuns.id, runId))
      .for("update")
      .limit(1);
    if (run === undefined) {
      throw new ControlError("NOT_FOUND", `no such run: ${runId}`);
    }
    if (run.status !== "REVIEWED") {
      throw new ControlError(
        "INVALID_STATE",
        `only REVIEWED runs can demote to DRAFT (currently ${run.status})`
      );
    }
    await tx
      .update(payRuns)
      .set({
        status: "DRAFT",
        reviewedAt: null,
        reviewedBy: null,
        reviewedRevision: null,
      })
      .where(eq(payRuns.id, runId));
    await tx.insert(auditEvents).values({
      actor,
      runId,
      entity: "pay_runs",
      entityId: runId,
      action: "DEMOTE_TO_DRAFT",
    });
  });
}

export async function listPayRunsForActor(
  db: Database,
  actorUserId: string,
  filters: { companyId?: string; reportingMonth?: string } = {}
): Promise<PayRunSummary[]> {
  const accessible = await listAccessibleCompanies(db, actorUserId);
  const accessibleIds = accessible.map((company) => company.id);

  if (
    filters.companyId !== undefined &&
    !accessibleIds.includes(filters.companyId)
  ) {
    throw new PermissionDeniedError(
      actorUserId,
      "PAY_RUN",
      "READ",
      filters.companyId
    );
  }

  if (filters.companyId !== undefined) {
    return await listPayRunSummaries(db, {
      companyId: filters.companyId,
      reportingMonth: filters.reportingMonth,
    });
  }

  return await listPayRunSummaries(db, {
    companyIds: accessibleIds,
    reportingMonth: filters.reportingMonth,
  });
}

/**
 * AuthZ + Neon-linked actor email over {@link createRun}.
 */
export async function createRunForActor(
  db: Database,
  actor: PayRunActor,
  input: Omit<CreateRunInput, "actor">
): Promise<{ runId: string; lineCount: number }> {
  await requirePermission(
    db,
    actor.userId,
    "PAY_RUN",
    "CREATE",
    input.companyId
  );
  try {
    return await createRun(db, { ...input, actor: actor.email });
  } catch (error) {
    throw mapCreateRunError(error);
  }
}

/**
 * AuthZ + Neon-linked actor email over {@link recomputeRun}.
 */
export async function recomputeRunForActor(
  db: Database,
  actor: PayRunActor,
  runId: string
): Promise<RecomputeOutcome> {
  await requirePayRunPermission(db, actor.userId, "UPDATE", runId);
  try {
    return await recomputeRun(db, runId, actor.email);
  } catch (error) {
    throw mapMissingPayRunError(error);
  }
}

export async function reviewRunForActor(
  db: Database,
  actor: PayRunActor,
  runId: string,
  calcRevision: string
): Promise<void> {
  await requirePayRunPermission(db, actor.userId, "UPDATE", runId);
  await reviewRun(db, runId, actor.email, calcRevision);
}

export async function approveRunForActor(
  db: Database,
  actor: PayRunActor,
  runId: string,
  calcRevision: string
): Promise<void> {
  await requirePayRunPermission(db, actor.userId, "UPDATE", runId);
  await approveRun(db, runId, actor.email, calcRevision);
}

/** Load company, 404 if missing, then `PAY_RUN` + action. Returns companyId. */
export async function requirePayRunPermission(
  db: Database,
  userId: string,
  action: PermissionAction,
  runId: string
): Promise<string> {
  const companyId = await getPayRunCompanyId(db, runId);
  if (companyId === null) {
    throw new PayRunError("NOT_FOUND", `no such pay run: ${runId}`, 404);
  }
  await requirePermission(db, userId, "PAY_RUN", action, companyId);
  return companyId;
}

function mapCreateRunError(error: unknown): Error {
  if (error instanceof RuleResolutionError) {
    return new PayRunError("VALIDATION_ERROR", error.message, 400, {
      cause: error,
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("no such rule pack")) {
    return new PayRunError("NOT_FOUND", message, 404, { cause: error });
  }
  if (isUniqueViolation(error) || CONFLICT_MESSAGE.test(message)) {
    return new PayRunError("CONFLICT", message, 409, { cause: error });
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(message, { cause: error });
}

function mapMissingPayRunError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("no such pay run")) {
    return new PayRunError("NOT_FOUND", message, 404, { cause: error });
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(message, { cause: error });
}

/** Every computed column, nulled out — a failing line has nothing knowable. */
function staleLineColumns() {
  return {
    grossSen: null,
    epfWagesSen: null,
    socsoWagesSen: null,
    eisWagesSen: null,
    epfEeSen: null,
    epfErSen: null,
    socsoEeCoreSen: null,
    socsoEeSkbbkSen: null,
    socsoErSen: null,
    eisEeSen: null,
    eisErSen: null,
    pcbNetSen: null,
    cp38Sen: null,
    zakatSen: null,
    otherDeductionsSen: null,
    deductionsTotalSen: null,
    netSen: null,
    hrdfSen: null,
    employerCostSen: null,
    trace: null,
    computedAt: null,
  };
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
    hrdfSen: result.hrdfLevySen,
    employerCostSen: result.employerCostSen,
    trace: result.trace,
    computedAt: new Date(),
  };
}
