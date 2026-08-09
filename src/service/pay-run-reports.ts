/**
 * @feature reports
 * @layer service
 * @hub src/server/routes/pay-run-reports.ts
 *
 * The three run-scoped report facades: payment register, statutory summary and
 * exception report. Reads come from `repo/pay-run-reports`; PAY_RUN authority
 * stays at the route edge via `requirePayRunAccess`, as it does for every other
 * run-scoped surface.
 *
 * Every total carries `incomplete`. A null sen column is unknown, not zero, so
 * a report that silently summed it would understate a figure an operator may
 * pay or file against — the flag is the report's own admission that it did.
 */

import type { Database } from "@/db/client";
import { sumNullableSen } from "@/domain/sum-nullable-sen";
import {
  findRunReportScope,
  listPaymentRegisterRows,
  listRunFindings,
  listRunLineSnapshots,
  listRunPayLines,
  type ReportPayLine,
  type RunReportScope,
} from "@/repo/pay-run-reports";
import { ControlError } from "./control-errors";

const REPORT_SCHEMA_VERSION = "1.0";
const VISIBLE_ACCOUNT_DIGITS = 4;

/** Keep in sync with `ReportMeta` in `src/web/api/types.ts`. */
export interface ReportMeta {
  readonly companyId: string;
  readonly companyName: string;
  readonly runId: string;
  readonly runStatus: string;
  readonly calcRevision: string | null;
  readonly generatedAt: string;
  readonly reportSchemaVersion: string;
}

/** Keep in sync with `PaymentRegisterRow` in `src/web/api/types.ts`. */
export interface PaymentRegisterRow {
  readonly lineId: string;
  readonly employeeCode: string;
  readonly employeeName: string;
  readonly netSen: number | null;
  readonly paymentState: string | null;
  readonly paymentRef: string | null;
  readonly maskedBankAccount: string | null;
}

/** Keep in sync with `PaymentRegisterDto` in `src/web/api/types.ts`. */
export interface PaymentRegisterReport {
  readonly reportMeta: ReportMeta;
  readonly rows: PaymentRegisterRow[];
  readonly totalNetSen: number;
  readonly incomplete: boolean;
}

/** Keep in sync with `StatutorySummaryDto` in `src/web/api/types.ts`. */
export interface StatutorySummaryReport {
  readonly reportMeta: ReportMeta;
  readonly employeeCount: number;
  readonly grossTotalSen: number;
  readonly netTotalSen: number;
  readonly epfEeTotalSen: number;
  readonly epfErTotalSen: number;
  readonly socsoEeCoreTotalSen: number;
  readonly socsoErTotalSen: number;
  readonly eisEeTotalSen: number;
  readonly eisErTotalSen: number;
  readonly pcbNetTotalSen: number;
  readonly cp38TotalSen: number;
  readonly incomplete: boolean;
}

/** Keep in sync with `ExceptionFindingRow` in `src/web/api/types.ts`. */
export interface ExceptionFindingRow {
  readonly id: string;
  readonly severity: string;
  readonly status: string;
  readonly title: string;
  readonly detail: string;
  readonly lineId: string | null;
  readonly employeeName: string | null;
}

/** Keep in sync with `ExceptionReportDto` in `src/web/api/types.ts`. */
export interface ExceptionReport {
  readonly reportMeta: ReportMeta;
  readonly findings: ExceptionFindingRow[];
}

interface EmployeeSnapshot {
  readonly id?: string;
  readonly name?: string;
  readonly bankAccount?: string;
}

/**
 * Last four digits only.
 *
 * A payment register is printed, emailed and filed, so it must be usable for
 * reconciliation without carrying a full account number into all of that.
 */
function maskBankAccount(account: string | undefined): string | null {
  if (!account) {
    return null;
  }
  return account.length > VISIBLE_ACCOUNT_DIGITS
    ? `****${account.slice(-VISIBLE_ACCOUNT_DIGITS)}`
    : "****";
}

function buildMeta(run: RunReportScope): ReportMeta {
  return {
    companyId: run.companyId,
    companyName: run.companyName,
    runId: run.id,
    runStatus: run.status,
    calcRevision: run.calcRevision ?? null,
    generatedAt: new Date().toISOString(),
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
  };
}

/**
 * Run header, or NOT_FOUND.
 *
 * `requirePayRunAccess` already rejects an unknown run at the route edge with
 * this same code and message, so in practice this guards only the impossible
 * case of a run whose company row vanished. Kept because the report would
 * otherwise assemble a header from nothing.
 */
async function requireRunScope(
  db: Database,
  runId: string
): Promise<RunReportScope> {
  const run = await findRunReportScope(db, runId);
  if (run === null) {
    throw new ControlError("NOT_FOUND", `no such run: ${runId}`);
  }
  return run;
}

export async function loadPaymentRegister(
  db: Database,
  runId: string
): Promise<PaymentRegisterReport> {
  const run = await requireRunScope(db, runId);
  const sourceRows = await listPaymentRegisterRows(db, runId);

  const rows: PaymentRegisterRow[] = sourceRows.map((row) => {
    const snapshot = row.employeeSnapshot as EmployeeSnapshot;
    return {
      lineId: row.lineId,
      // Fall back to the employment id so a line is never unidentifiable.
      employeeCode: snapshot.id ?? row.employmentId,
      employeeName: snapshot.name ?? "Unknown",
      netSen: row.netSen,
      paymentState: row.paymentState ?? null,
      paymentRef: row.paymentRef ?? null,
      maskedBankAccount: maskBankAccount(snapshot.bankAccount),
    };
  });

  const net = sumNullableSen(rows.map((row) => row.netSen));

  return {
    reportMeta: buildMeta(run),
    rows,
    totalNetSen: net.sum,
    incomplete: net.incomplete,
  };
}

export async function loadStatutorySummary(
  db: Database,
  runId: string
): Promise<StatutorySummaryReport> {
  const run = await requireRunScope(db, runId);
  const lines = await listRunPayLines(db, runId);

  const total = (key: keyof ReportPayLine) =>
    sumNullableSen(lines.map((line) => line[key] as number | null));

  const gross = total("grossSen");
  const net = total("netSen");
  const epfEe = total("epfEeSen");
  const epfEr = total("epfErSen");
  const socsoEe = total("socsoEeCoreSen");
  const socsoEr = total("socsoErSen");
  const eisEe = total("eisEeSen");
  const eisEr = total("eisErSen");
  const pcb = total("pcbNetSen");
  const cp38 = total("cp38Sen");

  return {
    reportMeta: buildMeta(run),
    employeeCount: lines.length,
    grossTotalSen: gross.sum,
    netTotalSen: net.sum,
    epfEeTotalSen: epfEe.sum,
    epfErTotalSen: epfEr.sum,
    socsoEeCoreTotalSen: socsoEe.sum,
    socsoErTotalSen: socsoEr.sum,
    eisEeTotalSen: eisEe.sum,
    eisErTotalSen: eisEr.sum,
    pcbNetTotalSen: pcb.sum,
    cp38TotalSen: cp38.sum,
    incomplete:
      gross.incomplete ||
      net.incomplete ||
      epfEe.incomplete ||
      epfEr.incomplete ||
      socsoEe.incomplete ||
      socsoEr.incomplete ||
      eisEe.incomplete ||
      eisEr.incomplete ||
      pcb.incomplete ||
      cp38.incomplete,
  };
}

export async function loadExceptionReport(
  db: Database,
  runId: string
): Promise<ExceptionReport> {
  const run = await requireRunScope(db, runId);
  const findings = await listRunFindings(db, runId);

  const hasLineScoped = findings.some((finding) => finding.lineId !== null);
  const namesByLineId = new Map<string, string>();
  if (hasLineScoped) {
    for (const line of await listRunLineSnapshots(db, runId)) {
      const snapshot = line.employeeSnapshot as EmployeeSnapshot;
      namesByLineId.set(line.id, snapshot.name ?? "Unknown");
    }
  }

  return {
    reportMeta: buildMeta(run),
    findings: findings.map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      status: finding.status,
      title: finding.title,
      detail: finding.detail,
      lineId: finding.lineId ?? null,
      employeeName:
        finding.lineId === null
          ? null
          : (namesByLineId.get(finding.lineId) ?? null),
    })),
  };
}
