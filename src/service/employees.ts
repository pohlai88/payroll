/**
 * @feature employees
 * @layer service
 * @hub src/server/routes/employees.ts
 *
 * Tenant-scoped employee directory for pickers and the employees page.
 */

import type { Database } from "@/db/client";
import { PermissionDeniedError } from "@/domain/rbac/authorize";
import { type EmployeeSummary, listEmployeeSummaries } from "@/repo/employees";
import { listAccessibleCompanies } from "./rbac";

export type { EmployeeSummary } from "@/repo/employees";

export async function listEmployeesForActor(
  db: Database,
  actorUserId: string,
  filters: { companyId?: string; search?: string } = {}
): Promise<EmployeeSummary[]> {
  const accessible = await listAccessibleCompanies(db, actorUserId);
  const accessibleIds = accessible.map((company) => company.id);

  if (
    filters.companyId !== undefined &&
    !accessibleIds.includes(filters.companyId)
  ) {
    throw new PermissionDeniedError(
      actorUserId,
      "EMPLOYMENT",
      "READ",
      filters.companyId
    );
  }

  const scopedCompanyIds =
    filters.companyId === undefined ? accessibleIds : [filters.companyId];

  return await listEmployeeSummaries(db, {
    companyIds: scopedCompanyIds,
    search: filters.search,
  });
}
