/**
 * @feature reports
 * @layer repo
 * @hub src/server/routes/pay-run-reports.ts
 *
 * Reads backing the three run-scoped report facades. Drizzle only — masking,
 * totalling and DTO assembly belong to `src/service/pay-run-reports.ts`, and
 * PAY_RUN authority stays at the route edge (`requirePayRunAccess`).
 */

import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { linePayments } from "@/db/schema/control";
import { anomalyFindings } from "@/db/schema/findings";
import { companies } from "@/db/schema/parties";
import { payLines, payRuns } from "@/db/schema/run";

export interface RunReportScope {
  readonly id: string;
  readonly companyId: string;
  readonly status: string;
  readonly calcRevision: string | null;
  readonly companyName: string;
}

export interface PaymentRegisterSourceRow {
  readonly lineId: string;
  readonly employmentId: string;
  readonly employeeSnapshot: unknown;
  readonly netSen: number | null;
  readonly paymentState: string | null;
  readonly paymentRef: string | null;
}

export interface RunFindingRow {
  readonly id: string;
  readonly severity: string;
  readonly status: string;
  readonly title: string;
  readonly detail: string;
  readonly lineId: string | null;
}

export interface RunLineSnapshot {
  readonly id: string;
  readonly employeeSnapshot: unknown;
}

/** Full pay-line row: the statutory summary totals many sen columns. */
export type ReportPayLine = typeof payLines.$inferSelect;

/** Run identity plus the company name every report header carries. */
export async function findRunReportScope(
  db: Database,
  runId: string
): Promise<RunReportScope | null> {
  const [run] = await db
    .select({
      id: payRuns.id,
      companyId: payRuns.companyId,
      status: payRuns.status,
      calcRevision: payRuns.calcRevision,
      companyName: companies.name,
    })
    .from(payRuns)
    .innerJoin(companies, eq(payRuns.companyId, companies.id))
    .where(eq(payRuns.id, runId))
    .limit(1);
  return run ?? null;
}

/**
 * One row per pay line with its payment state.
 *
 * LEFT JOIN, not INNER: `line_payments` rows only exist from APPROVED onward,
 * so a DRAFT run must still list its lines with a null payment state rather
 * than reporting an empty register.
 */
export async function listPaymentRegisterRows(
  db: Database,
  runId: string
): Promise<PaymentRegisterSourceRow[]> {
  return await db
    .select({
      lineId: payLines.id,
      employmentId: payLines.employmentId,
      employeeSnapshot: payLines.employeeSnapshot,
      netSen: payLines.netSen,
      paymentState: linePayments.state,
      paymentRef: linePayments.paymentRef,
    })
    .from(payLines)
    .leftJoin(linePayments, eq(linePayments.lineId, payLines.id))
    .where(eq(payLines.runId, runId));
}

export async function listRunPayLines(
  db: Database,
  runId: string
): Promise<ReportPayLine[]> {
  return await db.select().from(payLines).where(eq(payLines.runId, runId));
}

export async function listRunFindings(
  db: Database,
  runId: string
): Promise<RunFindingRow[]> {
  return await db
    .select({
      id: anomalyFindings.id,
      severity: anomalyFindings.severity,
      status: anomalyFindings.status,
      title: anomalyFindings.title,
      detail: anomalyFindings.detail,
      lineId: anomalyFindings.lineId,
    })
    .from(anomalyFindings)
    .where(eq(anomalyFindings.runId, runId));
}

/** Line id → employee snapshot, for naming line-scoped findings. */
export async function listRunLineSnapshots(
  db: Database,
  runId: string
): Promise<RunLineSnapshot[]> {
  return await db
    .select({ id: payLines.id, employeeSnapshot: payLines.employeeSnapshot })
    .from(payLines)
    .where(eq(payLines.runId, runId));
}
