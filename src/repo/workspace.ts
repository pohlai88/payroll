/**
 * The pay-run workspace read model — `GET /v1/pay-runs/:runId/workspace`.
 *
 * Composes the run header, action availability, aggregate tiles, findings
 * summary and per-employee line DTOs from existing tables. This is a read
 * facade: every figure it returns was already computed and stored by the
 * engine (`payLines`) or the findings scan (`anomalyFindings`). The only
 * arithmetic performed here is summing already-computed `sen` integers for
 * the totals tiles, and diffing this run's roots against the `linkedRunId`
 * prior run's roots for `previousRoots`/`variance` — read-model aggregation
 * and comparison, not payroll calculation.
 */

import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { anomalyFindings } from "@/db/schema/findings";
import { companies } from "@/db/schema/parties";
import { payLines, payRuns } from "@/db/schema/run";
import { roundBps } from "@/domain/money";

export interface RunSummary {
  readonly id: string;
  readonly companyId: string;
  readonly companyName: string;
  /** `YYYY-MM`. */
  readonly reportingMonth: string;
  readonly status: string;
  readonly label: string;
  /** Content hash of the last successful recompute; required by review/approve. */
  readonly calcRevision: string | null;
}

export interface ActionAvailability {
  readonly canRecompute: boolean;
  readonly canReview: boolean;
  readonly canApprove: boolean;
  readonly canClose: boolean;
}

export interface VarianceDto {
  readonly previousSen: number | null;
  readonly deltaSen: number | null;
  readonly deltaBps: number | null;
  readonly direction: "UP" | "DOWN" | "SAME" | "NO_PRIOR";
}

export interface SparkPoint {
  readonly reportingMonth: string;
  readonly sen: number;
}

export interface AggregateTile {
  readonly key: string;
  readonly label: string;
  readonly currentSen: number | null;
  readonly variance: VarianceDto;
  readonly history: SparkPoint[];
}

export interface FindingsSummary {
  readonly blockingCount: number;
  readonly warningCount: number;
}

export interface EmployeeVarianceDto {
  readonly hasChanges: boolean;
  readonly changedRootKeys: string[];
  readonly direction: "UP" | "DOWN" | "SAME" | "NO_PRIOR";
}

export interface RootValue {
  readonly sen: number | null;
  readonly notApplicable: boolean;
}

export interface EmployeeLineDto {
  readonly lineId: string;
  readonly employeeId: string;
  readonly employeeCode: string;
  readonly employeeName: string;
  readonly roots: Record<string, RootValue>;
  readonly previousRoots: Record<string, RootValue> | null;
  readonly variance: EmployeeVarianceDto | null;
  readonly rootVariances: Record<string, VarianceDto> | null;
  readonly findingsCount: number;
}

export interface PayRunWorkspaceView {
  readonly run: RunSummary;
  readonly actionAvailability: ActionAvailability;
  readonly totals: AggregateTile[];
  readonly findingsSummary: FindingsSummary | null;
  readonly lines: EmployeeLineDto[];
}

const NO_PRIOR_VARIANCE: VarianceDto = {
  previousSen: null,
  deltaSen: null,
  deltaBps: null,
  direction: "NO_PRIOR",
};

/** The 19 named sen roots every pay line carries — see `src/db/schema/run.ts` `payLines`. */
const ROOT_KEYS = [
  "gross",
  "epfWages",
  "socsoWages",
  "eisWages",
  "epfEe",
  "epfEr",
  "socsoEeCore",
  "socsoEeSkbbk",
  "socsoEr",
  "eisEe",
  "eisEr",
  "pcbNet",
  "cp38",
  "zakat",
  "otherDeductions",
  "deductionsTotal",
  "net",
  "hrdf",
  "employerCost",
] as const;

type RootKey = (typeof ROOT_KEYS)[number];

const AGGREGATE_TILE_DEFS: readonly {
  readonly key: string;
  readonly label: string;
  readonly rootKey: RootKey;
}[] = [
  { key: "gross_pay", label: "Gross Pay", rootKey: "gross" },
  { key: "net_pay", label: "Net Pay", rootKey: "net" },
  { key: "epf_ee", label: "EPF Employee", rootKey: "epfEe" },
  { key: "socso_ee", label: "SOCSO Employee", rootKey: "socsoEeCore" },
  { key: "eis_ee", label: "EIS Employee", rootKey: "eisEe" },
];

type PayLineRow = typeof payLines.$inferSelect;

function rootValue(sen: number | null): RootValue {
  return { sen, notApplicable: false };
}

function buildRootsFromLine(line: PayLineRow): Record<RootKey, RootValue> {
  return {
    gross: rootValue(line.grossSen),
    epfWages: rootValue(line.epfWagesSen),
    socsoWages: rootValue(line.socsoWagesSen),
    eisWages: rootValue(line.eisWagesSen),
    epfEe: rootValue(line.epfEeSen),
    epfEr: rootValue(line.epfErSen),
    socsoEeCore: rootValue(line.socsoEeCoreSen),
    socsoEeSkbbk: rootValue(line.socsoEeSkbbkSen),
    socsoEr: rootValue(line.socsoErSen),
    eisEe: rootValue(line.eisEeSen),
    eisEr: rootValue(line.eisErSen),
    pcbNet: rootValue(line.pcbNetSen),
    cp38: rootValue(line.cp38Sen),
    zakat: rootValue(line.zakatSen),
    otherDeductions: rootValue(line.otherDeductionsSen),
    deductionsTotal: rootValue(line.deductionsTotalSen),
    net: rootValue(line.netSen),
    hrdf: rootValue(line.hrdfSen),
    employerCost: rootValue(line.employerCostSen),
  };
}

function sumRoot(
  roots: readonly Record<RootKey, RootValue>[],
  rootKey: RootKey
): number {
  return roots.reduce((acc, r) => {
    const value = r[rootKey]?.sen;
    return value == null ? acc : acc + value;
  }, 0);
}

function directionOf(deltaSen: number): "UP" | "DOWN" | "SAME" {
  if (deltaSen > 0) {
    return "UP";
  }
  return deltaSen < 0 ? "DOWN" : "SAME";
}

function computeTileVariance(
  currentSen: number,
  previousRoots: readonly Record<RootKey, RootValue>[],
  rootKey: RootKey
): VarianceDto {
  const previousSen = sumRoot(previousRoots, rootKey);
  const deltaSen = currentSen - previousSen;
  const deltaBps = roundBps(deltaSen, previousSen);
  return { previousSen, deltaSen, deltaBps, direction: directionOf(deltaSen) };
}

function buildAggregateTiles(
  lines: EmployeeLineDto[],
  previousRoots: readonly Record<RootKey, RootValue>[] | null
): AggregateTile[] {
  return AGGREGATE_TILE_DEFS.map(({ key, label, rootKey }) => {
    const currentSen = lines.reduce((acc, line) => {
      const value = line.roots[rootKey]?.sen;
      return value == null ? acc : acc + value;
    }, 0);

    return {
      key,
      label,
      currentSen,
      variance:
        previousRoots === null
          ? NO_PRIOR_VARIANCE
          : computeTileVariance(currentSen, previousRoots, rootKey),
      history: [],
    };
  });
}

/**
 * Diffs one employee's current roots against the same employee's roots on
 * the prior (`linkedRunId`) run. `net` is the direction proxy — the single
 * figure the payslip actually pays out — but `changedRootKeys` reports every
 * root that moved, not just net.
 */
function computeEmployeeVariance(
  current: Record<RootKey, RootValue>,
  previous: Record<RootKey, RootValue>
): EmployeeVarianceDto {
  const changedRootKeys: string[] = [];
  for (const key of ROOT_KEYS) {
    if (current[key]?.sen !== previous[key]?.sen) {
      changedRootKeys.push(key);
    }
  }
  const curNet = current.net?.sen;
  const prevNet = previous.net?.sen;
  // Unknown nets are not comparable — do not treat null as zero.
  if (curNet == null || prevNet == null) {
    return {
      hasChanges: changedRootKeys.length > 0,
      changedRootKeys,
      direction: "SAME",
    };
  }
  return {
    hasChanges: changedRootKeys.length > 0,
    changedRootKeys,
    direction: directionOf(curNet - prevNet),
  };
}

function computeRootVariance(
  current: RootValue,
  previous: RootValue
): VarianceDto {
  if (current.sen == null || previous.sen == null) {
    return {
      previousSen: previous.sen,
      deltaSen: null,
      deltaBps: null,
      direction: "SAME",
    };
  }
  const deltaSen = current.sen - previous.sen;
  return {
    previousSen: previous.sen,
    deltaSen,
    deltaBps: roundBps(deltaSen, previous.sen),
    direction: directionOf(deltaSen),
  };
}

function computeRootVariances(
  current: Record<RootKey, RootValue>,
  previous: Record<RootKey, RootValue>
): Record<RootKey, VarianceDto> {
  const result = {} as Record<RootKey, VarianceDto>;
  for (const key of ROOT_KEYS) {
    result[key] = computeRootVariance(current[key], previous[key]);
  }
  return result;
}

function actionAvailabilityFor(status: string): ActionAvailability {
  return {
    canRecompute: status === "DRAFT",
    canReview: status === "DRAFT",
    canApprove: status === "REVIEWED",
    canClose: status === "APPROVED",
  };
}

/** Non-`RESOLVED` findings scoped to a run's lines, grouped by `lineId`. */
async function loadOpenFindingsCountByLine(
  db: Database,
  runId: string
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      lineId: anomalyFindings.lineId,
      status: anomalyFindings.status,
    })
    .from(anomalyFindings)
    .where(eq(anomalyFindings.runId, runId));

  const byLine = new Map<string, number>();
  for (const row of rows) {
    if (row.lineId === null || row.status === "RESOLVED") {
      continue;
    }
    byLine.set(row.lineId, (byLine.get(row.lineId) ?? 0) + 1);
  }
  return byLine;
}

/**
 * `blockingCount`/`warningCount` count `OPEN` findings only: `BLOCKING`
 * findings cannot be acknowledged (see `service/run-findings.ts`), so an
 * open one always needs addressing; an acknowledged `WARNING` has already
 * been triaged and should not keep showing as outstanding.
 */
function summarizeFindings(
  rows: readonly { readonly severity: string; readonly status: string }[]
): FindingsSummary | null {
  if (rows.length === 0) {
    return null;
  }
  let blockingCount = 0;
  let warningCount = 0;
  for (const row of rows) {
    if (row.status !== "OPEN") {
      continue;
    }
    if (row.severity === "BLOCKING") {
      blockingCount += 1;
    } else if (row.severity === "WARNING") {
      warningCount += 1;
    }
  }
  return { blockingCount, warningCount };
}

/**
 * Loads the full workspace view for one run, or `null` when the run does
 * not exist. Authorization (`requirePayRunAccess`) is the route's job, not
 * this function's — it only assembles data.
 */
export async function loadWorkspaceView(
  db: Database,
  runId: string,
  _userId: string
): Promise<PayRunWorkspaceView | null> {
  const [run] = await db
    .select({
      id: payRuns.id,
      companyId: payRuns.companyId,
      companyName: companies.name,
      year: payRuns.year,
      month: payRuns.month,
      status: payRuns.status,
      linkedRunId: payRuns.linkedRunId,
      calcRevision: payRuns.calcRevision,
    })
    .from(payRuns)
    .innerJoin(companies, eq(payRuns.companyId, companies.id))
    .where(eq(payRuns.id, runId))
    .limit(1);

  if (run === undefined) {
    return null;
  }

  const lineRows = await db
    .select()
    .from(payLines)
    .where(eq(payLines.runId, runId));

  const lineIds = lineRows.map((line) => line.id);

  const [findingsCountByLine, findingsRows, prevLineRows] = await Promise.all([
    loadOpenFindingsCountByLine(db, runId),
    lineIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            severity: anomalyFindings.severity,
            status: anomalyFindings.status,
          })
          .from(anomalyFindings)
          .where(eq(anomalyFindings.runId, runId)),
    run.linkedRunId === null
      ? Promise.resolve(null)
      : db.select().from(payLines).where(eq(payLines.runId, run.linkedRunId)),
  ]);

  const prevRootsByEmployment = new Map<string, Record<RootKey, RootValue>>();
  if (prevLineRows !== null) {
    for (const prevLine of prevLineRows) {
      prevRootsByEmployment.set(
        prevLine.employmentId,
        buildRootsFromLine(prevLine)
      );
    }
  }
  const previousRunRoots =
    prevLineRows === null ? null : prevLineRows.map(buildRootsFromLine);

  const employeeLines: EmployeeLineDto[] = lineRows.map((line) => {
    const snapshot = line.employeeSnapshot as {
      id?: string;
      name?: string;
    };
    const roots = buildRootsFromLine(line);
    const previousRoots = prevRootsByEmployment.get(line.employmentId) ?? null;
    return {
      lineId: line.id,
      employeeId: line.employmentId,
      employeeCode: snapshot.id ?? line.employmentId,
      employeeName: snapshot.name ?? "Unknown",
      roots,
      previousRoots,
      variance:
        previousRoots === null
          ? null
          : computeEmployeeVariance(roots, previousRoots),
      rootVariances:
        previousRoots === null
          ? null
          : computeRootVariances(roots, previousRoots),
      findingsCount: findingsCountByLine.get(line.id) ?? 0,
    };
  });

  return {
    run: {
      id: run.id,
      companyId: run.companyId,
      companyName: run.companyName,
      reportingMonth: `${run.year}-${String(run.month).padStart(2, "0")}`,
      status: run.status,
      label: run.id,
      calcRevision: run.calcRevision,
    },
    actionAvailability: actionAvailabilityFor(run.status),
    totals: buildAggregateTiles(employeeLines, previousRunRoots),
    findingsSummary: summarizeFindings(findingsRows),
    lines: employeeLines,
  };
}
