/**
 * @feature remuneration
 * @layer service
 * @hub src/server/routes/employee-remuneration.ts
 *
 * Annual remuneration summary: REPORT READ authority, aggregation, and the
 * statutory notices that must travel with every response.
 *
 * This is deliberately **not** Form EA / C.P.8A. Totals aggregate by reporting
 * month rather than income receipt date, so arrears, advance salary and
 * prior-period bonuses can land in the wrong year. That limitation is the
 * reason `limitationNotice` and `disclaimer` are part of the DTO rather than UI
 * copy — the caveat cannot be dropped by a consumer that forgets to render it.
 */

import type { Database } from "@/db/client";
import { sumNullableSen } from "@/domain/sum-nullable-sen";
import { listCompaniesByIds } from "@/repo/companies";
import {
  type EligibleRun,
  findEmploymentScope,
  listEligibleRuns,
  listPayLinesForRuns,
  type RemunerationPayLine,
} from "@/repo/employee-remuneration";
import { requirePermission } from "@/service/rbac";
import { ControlError } from "./control-errors";

const REPORT_SCHEMA_VERSION = "1.0";

const LIMITATION_NOTICE =
  "This summary aggregates payroll figures by reporting month, not by income receipt date. " +
  "Arrears, advance salary, late December payroll, and bonuses relating to prior periods may " +
  "require manual adjustment for annual income tax reporting purposes. " +
  "This is not a substitute for the official annual employer remuneration statement.";

const DISCLAIMER =
  "Annual remuneration summary prepared from payroll records in this system. " +
  "The employer must prepare and issue the annual remuneration statement to each employee " +
  "in accordance with the applicable statutory requirements and prescribed format.";

/** Keep in sync with `AnnualRemunerationSummaryDto` in `src/web/api/types.ts`. */
export interface AnnualRemunerationSummary {
  readonly reportMeta: {
    readonly companyId: string;
    readonly companyName: string;
    readonly generatedAt: string;
    readonly reportSchemaVersion: string;
  };
  readonly year: number;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly employeeCode: string;
  readonly runsIncluded: string[];
  readonly months: string[];
  readonly grossSen: number;
  readonly netSen: number;
  readonly epfEeSen: number;
  readonly epfErSen: number;
  readonly socsoEeCoreSen: number;
  readonly eisEeSen: number;
  readonly pcbNetSen: number;
  readonly cp38Sen: number;
  /** True when any contributing column was null — the total understates. */
  readonly incomplete: boolean;
  readonly limitationNotice: string;
  readonly disclaimer: string;
}

interface AnnualTotals {
  grossSen: number;
  netSen: number;
  epfEeSen: number;
  epfErSen: number;
  socsoEeCoreSen: number;
  eisEeSen: number;
  pcbNetSen: number;
  cp38Sen: number;
  incomplete: boolean;
  employeeName: string;
  employeeCode: string;
  months: string[];
  runsIncluded: string[];
}

function emptyTotals(employeeCode: string): AnnualTotals {
  return {
    grossSen: 0,
    netSen: 0,
    epfEeSen: 0,
    epfErSen: 0,
    socsoEeCoreSen: 0,
    eisEeSen: 0,
    pcbNetSen: 0,
    cp38Sen: 0,
    incomplete: false,
    employeeName: "Unknown",
    employeeCode,
    months: [],
    runsIncluded: [],
  };
}

/**
 * Pure aggregate over the year's lines.
 *
 * `incomplete` propagates from every column: a null sen value is unknown, not
 * zero, so a total built over one is understated and must say so.
 */
function aggregateAnnualTotals(
  lines: RemunerationPayLine[],
  eligibleRuns: EligibleRun[],
  year: number,
  defaultEmployeeCode: string
): AnnualTotals {
  let employeeName = "Unknown";
  let employeeCode = defaultEmployeeCode;

  for (const line of lines) {
    const snap = line.employeeSnapshot as { name?: string; id?: string };
    if (snap.name) {
      employeeName = snap.name;
    }
    if (snap.id) {
      employeeCode = snap.id;
    }
  }

  const gross = sumNullableSen(lines.map((l) => l.grossSen));
  const net = sumNullableSen(lines.map((l) => l.netSen));
  const epfEe = sumNullableSen(lines.map((l) => l.epfEeSen));
  const epfEr = sumNullableSen(lines.map((l) => l.epfErSen));
  const socsoEe = sumNullableSen(lines.map((l) => l.socsoEeCoreSen));
  const eisEe = sumNullableSen(lines.map((l) => l.eisEeSen));
  const pcb = sumNullableSen(lines.map((l) => l.pcbNetSen));
  const cp38 = sumNullableSen(lines.map((l) => l.cp38Sen));

  const runMonthMap = new Map(eligibleRuns.map((r) => [r.id, r.month]));
  const seenRunIds = new Set<string>();
  const seenMonths = new Set<number>();
  for (const line of lines) {
    seenRunIds.add(line.runId);
    const month = runMonthMap.get(line.runId);
    if (month !== undefined) {
      seenMonths.add(month);
    }
  }
  const months = [...seenMonths]
    .map((m) => `${year}-${String(m).padStart(2, "0")}`)
    .sort((a, b) => a.localeCompare(b));
  const runsIncluded = [...seenRunIds].sort((a, b) => a.localeCompare(b));

  return {
    grossSen: gross.sum,
    netSen: net.sum,
    epfEeSen: epfEe.sum,
    epfErSen: epfEr.sum,
    socsoEeCoreSen: socsoEe.sum,
    eisEeSen: eisEe.sum,
    pcbNetSen: pcb.sum,
    cp38Sen: cp38.sum,
    incomplete:
      gross.incomplete ||
      net.incomplete ||
      epfEe.incomplete ||
      epfEr.incomplete ||
      socsoEe.incomplete ||
      eisEe.incomplete ||
      pcb.incomplete ||
      cp38.incomplete,
    employeeName,
    employeeCode,
    months,
    runsIncluded,
  };
}

/**
 * Annual summary for one employment, gated on REPORT READ in the employment's
 * own company — the employee's employer decides who may read their year.
 *
 * A year with no eligible runs is zero totals, not an error: "this employee has
 * no approved payroll yet" is a real answer, and a 404 would be read as "no
 * such employee".
 */
export async function getAnnualRemunerationSummaryForActor(
  db: Database,
  actorUserId: string,
  employmentId: string,
  year: number
): Promise<AnnualRemunerationSummary> {
  const employment = await findEmploymentScope(db, employmentId);
  if (employment === null) {
    throw new ControlError("NOT_FOUND", `no such employee: ${employmentId}`);
  }

  await requirePermission(
    db,
    actorUserId,
    "REPORT",
    "READ",
    employment.companyId
  );

  const [company] = await listCompaniesByIds(db, [employment.companyId]);
  const eligibleRuns = await listEligibleRuns(db, employment.companyId, year);
  const lines = await listPayLinesForRuns(
    db,
    employmentId,
    eligibleRuns.map((run) => run.id)
  );

  const totals =
    lines.length === 0
      ? emptyTotals(employment.employeeCode)
      : aggregateAnnualTotals(
          lines,
          eligibleRuns,
          year,
          employment.employeeCode
        );

  return {
    reportMeta: {
      companyId: employment.companyId,
      companyName: company?.name ?? "Unknown",
      generatedAt: new Date().toISOString(),
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
    },
    year,
    employeeId: employmentId,
    employeeName: totals.employeeName,
    employeeCode: totals.employeeCode,
    runsIncluded: totals.runsIncluded,
    months: totals.months,
    grossSen: totals.grossSen,
    netSen: totals.netSen,
    epfEeSen: totals.epfEeSen,
    epfErSen: totals.epfErSen,
    socsoEeCoreSen: totals.socsoEeCoreSen,
    eisEeSen: totals.eisEeSen,
    pcbNetSen: totals.pcbNetSen,
    cp38Sen: totals.cp38Sen,
    incomplete: totals.incomplete,
    limitationNotice: LIMITATION_NOTICE,
    disclaimer: DISCLAIMER,
  };
}
