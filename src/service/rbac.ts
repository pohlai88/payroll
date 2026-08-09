/**
 * Authorization service — loads a user's grants from the database and evaluates
 * them through the pure decision functions in `src/domain/rbac`.
 */

import type { Database } from "@/db/client";
import {
  hasPermission as evaluateHasPermission,
  isSystemAdmin as evaluateIsSystemAdmin,
  listEffectivePermissions as evaluateListEffective,
  requirePermission as evaluateRequire,
  PermissionDeniedError,
} from "@/domain/rbac/authorize";
import type {
  PermissionAction,
  PermissionMatrix,
  PermissionResource,
} from "@/domain/rbac/types";
import {
  listAllCompanies,
  listCompaniesByIds,
  loadAuthRoleGrants,
} from "@/repo/rbac";

export async function hasPermission(
  db: Database,
  userId: string,
  resource: PermissionResource,
  action: PermissionAction,
  companyId?: string | null
): Promise<boolean> {
  const grants = await loadAuthRoleGrants(db, userId);
  return evaluateHasPermission(grants, resource, action, companyId);
}

export async function requirePermission(
  db: Database,
  userId: string,
  resource: PermissionResource,
  action: PermissionAction,
  companyId?: string | null
): Promise<void> {
  const grants = await loadAuthRoleGrants(db, userId);
  evaluateRequire(grants, userId, resource, action, companyId);
}

export async function listEffectivePermissions(
  db: Database,
  userId: string,
  companyId?: string | null
): Promise<PermissionMatrix> {
  const grants = await loadAuthRoleGrants(db, userId);
  return evaluateListEffective(grants, companyId);
}

/**
 * Companies the user may pick in the scope selector.
 *
 * System Admin holds implicit total access, so it sees every company
 * regardless of assignments. Everyone else sees only the companies named on
 * their own (COMPANY-scoped) role assignments.
 */
export async function listAccessibleCompanies(
  db: Database,
  userId: string
): Promise<Array<{ id: string; code: string; name: string }>> {
  const grants = await loadAuthRoleGrants(db, userId);

  const rows = evaluateIsSystemAdmin(grants)
    ? await listAllCompanies(db)
    : await listCompaniesByIds(db, [
        ...new Set(
          grants
            .map((grant) => grant.companyId)
            .filter((companyId): companyId is string => companyId !== null)
        ),
      ]);

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
  }));
}

/**
 * Admin-platform operations (invite, role assignment) are System Admin only —
 * there is no USER resource in the permission matrix.
 */
export async function requireSystemAdmin(
  db: Database,
  userId: string
): Promise<void> {
  const grants = await loadAuthRoleGrants(db, userId);
  if (!evaluateIsSystemAdmin(grants)) {
    throw new PermissionDeniedError(userId, "COMPANY", "UPDATE");
  }
}
