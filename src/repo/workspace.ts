/**
 * The pay-run workspace read model — `GET /v1/pay-runs/:runId/workspace`.
 *
 * Composes the run header, action availability, aggregate tiles, findings
 * summary and per-employee line DTOs from existing tables. This is a read
 * facade: every figure it returns was already computed and stored by the
 * engine (`payLines`) or the findings scan (`anomalyFindings`). The only
 * arithmetic performed here is summing already-computed `sen` integers for
 * the totals tiles — read-model aggregation, not payroll calculation.
 *
 * Prior-run comparison (`previousRoots`, `EmployeeVarianceDto`, tile
 * `variance`/`history`) is out of scope for this task — see Task 3, which
 * adds the `linkedRunId`/prior-period join.
 */

import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { anomalyFindings } from "@/db/schema/findings";
import { companies } from "@/db/schema/parties";
import { payLines, payRuns } from "@/db/schema/run";

export interface RunSummary {
  readonly id: string;
  readonly companyId: string;
  readonly companyName: string;
  /** `YYYY-MM`. */
  readonly reportingMonth: string;
  readonly status: string;
  readonly label: string;
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
  readonly employeeId: string;
  readonly employeeCode: string;
  readonly employeeName: string;
  readonly roots: Record<string, RootValue>;
  readonly previousRoots: Record<string, RootValue> | null;
  readonly variance: EmployeeVarianceDto | null;
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

function buildAggregateTiles(lines: EmployeeLineDto[]): AggregateTile[] {
  return AGGREGATE_TILE_DEFS.map(({ key, label, rootKey }) => {
    const currentSen = lines.reduce((acc, line) => {
      const value = line.roots[rootKey]?.sen;
      return value == null ? acc : acc + value;
    }, 0);

    return {
      key,
      label,
      currentSen,
      variance: NO_PRIOR_VARIANCE,
      history: [],
    };
  });
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

  const [findingsCountByLine, findingsRows] = await Promise.all([
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
  ]);

  const employeeLines: EmployeeLineDto[] = lineRows.map((line) => {
    const snapshot = line.employeeSnapshot as {
      id?: string;
      name?: string;
    };
    return {
      employeeId: line.employmentId,
      employeeCode: snapshot.id ?? line.employmentId,
      employeeName: snapshot.name ?? "Unknown",
      roots: buildRootsFromLine(line),
      previousRoots: null,
      variance: null,
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
    },
    actionAvailability: actionAvailabilityFor(run.status),
    totals: buildAggregateTiles(employeeLines),
    findingsSummary: summarizeFindings(findingsRows),
    lines: employeeLines,
  };
}
