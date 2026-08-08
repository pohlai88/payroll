/**
 * Loads a run's lines as engine input.
 *
 * This is the only place that assembles `EmployeeSnapshot` and `LineInputs` from
 * stored rows. Everything downstream — the service layer, and eventually the API
 * — receives the engine's own types, which is what keeps `src/domain` free of
 * any knowledge that a database exists.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
  companies,
  employmentPcbYtd,
  employmentTaxProfiles,
} from "@/db/schema/parties";
import {
  payLineItems,
  payLineOverrides,
  payLines,
  payRuns,
  pcbEntries,
} from "@/db/schema/run";
import { buildPcbMonthContext } from "@/domain/calc/pcb-context";
import type {
  EmployeeSnapshot,
  LineInputs,
  LineItemInput,
  OverrideInput,
  PcbFormulaRegime,
  PcbInput,
  PcbTaxProfile,
} from "@/domain/calc/types";

/**
 * The snapshot is jsonb, so the database cannot vouch for its shape. It was
 * written by `createRun` from typed columns, but a run may be read back years
 * later — after a schema change, a restore, or an import — and a silently
 * malformed snapshot would reach the engine as `undefined` fields.
 */
const employeeSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  isMalaysian: z.boolean(),
  isPermanentResident: z.boolean(),
  dob: z.string().nullable(),
  payBasis: z.enum(["MONTHLY", "DAILY", "HOURLY"]),
  baseRateSen: z.number().int(),
  epfApplicable: z.boolean(),
  socsoApplicable: z.boolean(),
  eisApplicable: z.boolean(),
  pcbApplicable: z.boolean(),
  epfMemberBeforeAug1998: z.boolean().nullable(),
  eisPriorContribution: z.boolean().nullable(),
  epfPartOverride: z.enum(["A", "C", "E", "F", "NONE"]).nullable(),
  socsoCategoryOverride: z.enum(["FIRST", "SECOND", "NONE"]).nullable(),
});

export interface LineForCompute {
  readonly lineId: string;
  readonly employmentId: string;
  readonly employee: EmployeeSnapshot;
  readonly inputs: LineInputs;
  readonly overrides: OverrideInput[];
  readonly pcb: PcbInput | null;
}

export interface RunForCompute {
  readonly runId: string;
  readonly rulePackId: string;
  readonly status: string;
  readonly lines: LineForCompute[];
}

export interface PayRunSummary {
  readonly id: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly label: string;
  readonly year: number;
  readonly month: number;
  readonly status: string;
  readonly employeeCount: number;
  readonly createdAt: string;
}

/** Runs visible to the caller, newest period first. `reportingMonth` is `YYYY-MM`. */
export async function listPayRunSummaries(
  db: Database,
  filters: { companyId?: string; reportingMonth?: string }
): Promise<PayRunSummary[]> {
  const employeeCounts = db
    .select({
      runId: payLines.runId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(payLines)
    .groupBy(payLines.runId)
    .as("employee_counts");

  const rows = await db
    .select({
      id: payRuns.id,
      companyId: payRuns.companyId,
      companyName: companies.name,
      year: payRuns.year,
      month: payRuns.month,
      status: payRuns.status,
      employeeCount: sql<number>`coalesce(${employeeCounts.count}, 0)`,
      createdAt: payRuns.createdAt,
    })
    .from(payRuns)
    .innerJoin(companies, eq(payRuns.companyId, companies.id))
    .leftJoin(employeeCounts, eq(employeeCounts.runId, payRuns.id))
    .where(
      and(
        filters.companyId
          ? eq(payRuns.companyId, filters.companyId)
          : undefined,
        filters.reportingMonth
          ? eq(
              sql`${payRuns.year}::text || '-' || lpad(${payRuns.month}::text, 2, '0')`,
              filters.reportingMonth
            )
          : undefined
      )
    )
    .orderBy(desc(payRuns.year), desc(payRuns.month));

  return rows.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    companyName: r.companyName,
    label: r.id,
    year: r.year,
    month: r.month,
    status: r.status,
    employeeCount: Number(r.employeeCount),
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Company id for AuthZ, or null when the run does not exist. */
export async function getPayRunCompanyId(
  db: Database,
  runId: string
): Promise<string | null> {
  const [row] = await db
    .select({ companyId: payRuns.companyId })
    .from(payRuns)
    .where(eq(payRuns.id, runId))
    .limit(1);
  return row?.companyId ?? null;
}

/** Postgres returns numeric as a string to preserve precision; inputs are numbers. */
function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

export async function loadRunForCompute(
  db: Database,
  runId: string
): Promise<RunForCompute> {
  return await db.transaction(async (tx) => {
    const [run] = await tx
      .select({
        id: payRuns.id,
        rulePackId: payRuns.rulePackId,
        status: payRuns.status,
      })
      .from(payRuns)
      .where(eq(payRuns.id, runId))
      .limit(1);

    if (run === undefined) {
      throw new Error(`no such pay run: ${runId}`);
    }

    const lineRows = await tx
      .select({
        id: payLines.id,
        employmentId: payLines.employmentId,
        employeeSnapshot: payLines.employeeSnapshot,
        workingDays: payLines.workingDays,
        paidDays: payLines.paidDays,
        hoursWorked: payLines.hoursWorked,
        periodEnd: payLines.periodEnd,
      })
      .from(payLines)
      .where(eq(payLines.runId, runId))
      .orderBy(asc(payLines.id));

    const lineIds = lineRows.map((row) => row.id);
    const employmentIds = [...new Set(lineRows.map((row) => row.employmentId))];
    const years = [
      ...new Set(lineRows.map((row) => Number(row.periodEnd.slice(0, 4)))),
    ];

    const [itemsByLine, overridesByLine, pcbByLine, profiles, ytdRows] =
      await Promise.all([
        loadLineItemsForLines(tx, lineIds),
        loadOverridesForLines(tx, lineIds),
        loadPcbEntriesForLines(tx, lineIds),
        loadTaxProfiles(tx, employmentIds),
        loadPcbYtd(tx, employmentIds, years),
      ]);

    const lines: LineForCompute[] = lineRows.map((row) => {
      const snapshot = employeeSnapshotSchema.safeParse(row.employeeSnapshot);
      if (!snapshot.success) {
        throw new Error(
          `line ${row.id} has a malformed employee snapshot: ` +
            snapshot.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")
        );
      }

      const year = Number(row.periodEnd.slice(0, 4));
      const pcb = assemblePcbInput(
        pcbByLine.get(row.id) ?? null,
        profiles.get(row.employmentId) ?? null,
        ytdRows.get(`${row.employmentId}:${year}`) ?? null,
        row.periodEnd
      );

      return {
        lineId: row.id,
        employmentId: row.employmentId,
        employee: snapshot.data,
        inputs: {
          workingDays: row.workingDays,
          paidDays: toNumber(row.paidDays),
          hoursWorked: toNumber(row.hoursWorked),
          items: itemsByLine.get(row.id) ?? [],
          periodEnd: row.periodEnd,
        },
        overrides: overridesByLine.get(row.id) ?? [],
        pcb,
      };
    });

    return {
      runId: run.id,
      rulePackId: run.rulePackId,
      status: run.status,
      lines,
    };
  });
}

/** Any object with the same read methods as {@link Database}, transaction or not. */
type Queryable = Pick<Database, "select">;

interface PcbEntryRow {
  lineId: string;
  pcbAmountSen: number | null;
  cp38Sen: number;
  zakatOffsetSen: number;
  verified: boolean;
  y1Sen: number | null;
  ytSen: number;
  ktSen: number;
  lp1Sen: number;
}

interface TaxProfileRow {
  residence: "RESIDENT" | "NON_RESIDENT";
  category: "1" | "2" | "3";
  formulaRegime: PcbFormulaRegime;
  disabledIndividual: boolean;
  disabledSpouse: boolean;
  qualifyingChildUnits: number;
  electDeductBelowRm10: boolean;
}

interface YtdRow {
  ySen: number;
  kSen: number;
  xSen: number;
  zSen: number;
  accumulatedLpSen: number;
}

function toTaxProfile(row: TaxProfileRow): PcbTaxProfile {
  return {
    residence: row.residence,
    category: Number(row.category) as 1 | 2 | 3,
    formulaRegime: row.formulaRegime,
    disabledIndividual: row.disabledIndividual,
    disabledSpouse: row.disabledSpouse,
    qualifyingChildUnits: row.qualifyingChildUnits,
  };
}

/**
 * Merge entry + standing profile + YTD into engine `PcbInput`.
 * Without a tax profile, only the override/entered path is available.
 */
function assemblePcbInput(
  entry: PcbEntryRow | null,
  profileRow: TaxProfileRow | null,
  ytd: YtdRow | null,
  periodEnd: string
): PcbInput | null {
  if (entry === null && profileRow === null) {
    return null;
  }

  const base: PcbInput = {
    pcbAmountSen: entry?.pcbAmountSen ?? null,
    cp38Sen: entry?.cp38Sen ?? 0,
    zakatOffsetSen: entry?.zakatOffsetSen ?? 0,
    verified: entry?.verified ?? false,
  };

  if (profileRow === null) {
    return base;
  }

  const ytdAcc = ytd ?? {
    ySen: 0,
    kSen: 0,
    xSen: 0,
    zSen: 0,
    accumulatedLpSen: 0,
  };

  return {
    ...base,
    taxProfile: toTaxProfile(profileRow),
    monthContext: buildPcbMonthContext({
      periodEndIso: periodEnd,
      ytd: ytdAcc,
      y1Sen: entry?.y1Sen ?? 0,
      k1Sen: 0,
      ytSen: entry?.ytSen ?? 0,
      ktSen: entry?.ktSen ?? 0,
      lp1Sen: entry?.lp1Sen ?? 0,
      electDeductBelowRm10: profileRow.electDeductBelowRm10,
    }),
    autoRemunerationFromItems: entry?.y1Sen == null,
  };
}

async function loadTaxProfiles(
  db: Queryable,
  employmentIds: string[]
): Promise<Map<string, TaxProfileRow>> {
  const map = new Map<string, TaxProfileRow>();
  if (employmentIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      employmentId: employmentTaxProfiles.employmentId,
      residence: employmentTaxProfiles.residence,
      category: employmentTaxProfiles.category,
      formulaRegime: employmentTaxProfiles.formulaRegime,
      disabledIndividual: employmentTaxProfiles.disabledIndividual,
      disabledSpouse: employmentTaxProfiles.disabledSpouse,
      qualifyingChildUnits: employmentTaxProfiles.qualifyingChildUnits,
      electDeductBelowRm10: employmentTaxProfiles.electDeductBelowRm10,
    })
    .from(employmentTaxProfiles)
    .where(inArray(employmentTaxProfiles.employmentId, employmentIds));

  for (const row of rows) {
    map.set(row.employmentId, {
      residence: row.residence,
      category: row.category,
      formulaRegime: row.formulaRegime,
      disabledIndividual: row.disabledIndividual,
      disabledSpouse: row.disabledSpouse,
      qualifyingChildUnits: row.qualifyingChildUnits,
      electDeductBelowRm10: row.electDeductBelowRm10,
    });
  }
  return map;
}

async function loadPcbYtd(
  db: Queryable,
  employmentIds: string[],
  years: number[]
): Promise<Map<string, YtdRow>> {
  const map = new Map<string, YtdRow>();
  if (employmentIds.length === 0 || years.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      employmentId: employmentPcbYtd.employmentId,
      calendarYear: employmentPcbYtd.calendarYear,
      ySen: employmentPcbYtd.ySen,
      kSen: employmentPcbYtd.kSen,
      xSen: employmentPcbYtd.xSen,
      zSen: employmentPcbYtd.zSen,
      accumulatedLpSen: employmentPcbYtd.accumulatedLpSen,
    })
    .from(employmentPcbYtd)
    .where(
      and(
        inArray(employmentPcbYtd.employmentId, employmentIds),
        inArray(employmentPcbYtd.calendarYear, years)
      )
    );

  for (const row of rows) {
    map.set(`${row.employmentId}:${row.calendarYear}`, {
      ySen: row.ySen,
      kSen: row.kSen,
      xSen: row.xSen,
      zSen: row.zSen,
      accumulatedLpSen: row.accumulatedLpSen,
    });
  }
  return map;
}

async function loadLineItemsForLines(
  db: Queryable,
  lineIds: string[]
): Promise<Map<string, LineItemInput[]>> {
  const itemsByLine = new Map<string, LineItemInput[]>();
  if (lineIds.length === 0) {
    return itemsByLine;
  }

  const rows = await db
    .select({
      lineId: payLineItems.lineId,
      itemCodeSnap: payLineItems.itemCodeSnap,
      basisSnap: payLineItems.basisSnap,
      quantity: payLineItems.quantity,
      rateSen: payLineItems.rateSen,
      amountSen: payLineItems.amountSen,
    })
    .from(payLineItems)
    .where(inArray(payLineItems.lineId, lineIds))
    .orderBy(asc(payLineItems.sortSnap), asc(payLineItems.itemCodeSnap));

  for (const row of rows) {
    const item = toLineItemInput(row);
    const existing = itemsByLine.get(row.lineId);
    if (existing === undefined) {
      itemsByLine.set(row.lineId, [item]);
    } else {
      existing.push(item);
    }
  }
  return itemsByLine;
}

function toLineItemInput(row: {
  itemCodeSnap: string;
  basisSnap: LineItemInput["basis"];
  quantity: string | null;
  rateSen: number | null;
  amountSen: number | null;
}): LineItemInput {
  if (
    row.basisSnap === "PER_DAY" ||
    row.basisSnap === "PER_HOUR" ||
    row.basisSnap === "PER_UNIT"
  ) {
    if (row.quantity === null || row.rateSen === null) {
      throw new Error(
        `line item ${row.itemCodeSnap} is ${row.basisSnap} but has no quantity or rate`
      );
    }
    return {
      payItemCode: row.itemCodeSnap,
      basis: row.basisSnap,
      qty: Number(row.quantity),
      rateSen: row.rateSen,
    };
  }
  if (row.amountSen === null) {
    throw new Error(
      `line item ${row.itemCodeSnap} is ${row.basisSnap} but has no amount`
    );
  }
  return {
    payItemCode: row.itemCodeSnap,
    basis: row.basisSnap,
    amountSen: row.amountSen,
  };
}

async function loadOverridesForLines(
  db: Queryable,
  lineIds: string[]
): Promise<Map<string, OverrideInput[]>> {
  const overridesByLine = new Map<string, OverrideInput[]>();
  if (lineIds.length === 0) {
    return overridesByLine;
  }

  const rows = await db
    .select({
      lineId: payLineOverrides.lineId,
      field: payLineOverrides.field,
      overrideSen: payLineOverrides.overrideSen,
    })
    .from(payLineOverrides)
    .where(inArray(payLineOverrides.lineId, lineIds))
    .orderBy(asc(payLineOverrides.field));

  for (const { lineId, ...override } of rows) {
    const existing = overridesByLine.get(lineId);
    if (existing === undefined) {
      overridesByLine.set(lineId, [override]);
    } else {
      existing.push(override);
    }
  }
  return overridesByLine;
}

async function loadPcbEntriesForLines(
  db: Queryable,
  lineIds: string[]
): Promise<Map<string, PcbEntryRow>> {
  const pcbByLine = new Map<string, PcbEntryRow>();
  if (lineIds.length === 0) {
    return pcbByLine;
  }

  const rows = await db
    .select({
      lineId: pcbEntries.lineId,
      pcbAmountSen: pcbEntries.pcbAmountSen,
      cp38Sen: pcbEntries.cp38Sen,
      zakatOffsetSen: pcbEntries.zakatOffsetSen,
      verified: pcbEntries.verified,
      y1Sen: pcbEntries.y1Sen,
      ytSen: pcbEntries.ytSen,
      ktSen: pcbEntries.ktSen,
      lp1Sen: pcbEntries.lp1Sen,
    })
    .from(pcbEntries)
    .where(inArray(pcbEntries.lineId, lineIds));

  for (const row of rows) {
    pcbByLine.set(row.lineId, row);
  }
  return pcbByLine;
}
