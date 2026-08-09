/**
 * @feature remuneration
 * @layer repo
 * @hub src/server/routes/employee-remuneration.ts
 *
 * Reads backing the annual remuneration summary. Drizzle only — no RBAC and no
 * report assembly; both belong to `src/service/employee-remuneration.ts`.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { employments } from "@/db/schema/parties";
import { payLines, payRuns } from "@/db/schema/run";

export interface EmploymentScope {
  readonly id: string;
  readonly companyId: string;
  readonly employeeCode: string;
}

export interface EligibleRun {
  readonly id: string;
  readonly month: number;
}

/** Full pay-line row: the aggregate reads many sen columns plus the snapshot. */
export type RemunerationPayLine = typeof payLines.$inferSelect;

/** The employment's company decides who may read the summary — load it first. */
export async function findEmploymentScope(
  db: Database,
  employmentId: string
): Promise<EmploymentScope | null> {
  const [row] = await db
    .select({
      id: employments.id,
      companyId: employments.companyId,
      employeeCode: employments.employeeCode,
    })
    .from(employments)
    .where(eq(employments.id, employmentId))
    .limit(1);
  return row ?? null;
}

/**
 * Runs whose figures count toward the year.
 *
 * APPROVED and CLOSED only: a DRAFT run is still being computed, so including
 * it would let an unapproved figure appear in an annual total.
 */
export async function listEligibleRuns(
  db: Database,
  companyId: string,
  year: number
): Promise<EligibleRun[]> {
  return await db
    .select({ id: payRuns.id, month: payRuns.month })
    .from(payRuns)
    .where(
      and(
        eq(payRuns.companyId, companyId),
        eq(payRuns.year, year),
        inArray(payRuns.status, ["APPROVED", "CLOSED"])
      )
    );
}

/** This employment's lines within the given runs. Empty `runIds` reads nothing. */
export async function listPayLinesForRuns(
  db: Database,
  employmentId: string,
  runIds: readonly string[]
): Promise<RemunerationPayLine[]> {
  if (runIds.length === 0) {
    return [];
  }
  return await db
    .select()
    .from(payLines)
    .where(
      and(
        eq(payLines.employmentId, employmentId),
        inArray(payLines.runId, [...runIds])
      )
    );
}
