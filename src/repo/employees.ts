/**
 * @feature employees
 * @layer repo
 * @hub src/server/routes/employees.ts
 *
 * Employee list read model — `GET /v1/employees`.
 * Always called with an already-scoped company id set (RBAC happens in service).
 * Full stack map: open `@hub` target for the wired path list.
 */

import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { employments, persons } from "@/db/schema/parties";

/** Keep in sync with `src/web/api/types.ts` `EmployeeSummary`. */
export interface EmployeeSummary {
  /** Employment id — use as `fromEmploymentId` for transfers. */
  readonly id: string;
  readonly personId: string;
  readonly code: string;
  readonly name: string;
  readonly companyId: string;
  readonly status: "ACTIVE" | "TERMINATED";
}

export async function listEmployeeSummaries(
  db: Database,
  filters: {
    companyIds: readonly string[];
    search?: string;
  }
): Promise<EmployeeSummary[]> {
  if (filters.companyIds.length === 0) {
    return [];
  }

  const conditions = [
    inArray(employments.companyId, [...filters.companyIds]),
    filters.search
      ? or(
          ilike(persons.name, `%${filters.search}%`),
          ilike(employments.employeeCode, `%${filters.search}%`)
        )
      : undefined,
  ].filter((cond): cond is NonNullable<typeof cond> => cond !== undefined);

  const rows = await db
    .select({
      id: employments.id,
      personId: employments.personId,
      code: employments.employeeCode,
      name: persons.name,
      companyId: employments.companyId,
      status: sql<
        "ACTIVE" | "TERMINATED"
      >`case when ${employments.terminationDate} is null then 'ACTIVE' else 'TERMINATED' end`,
    })
    .from(employments)
    .innerJoin(persons, eq(employments.personId, persons.id))
    .where(and(...conditions));

  return rows;
}
