/**
 * @feature rbac
 * @layer service
 * @hub src/server/routes/admin-roles.ts
 *
 * SYSTEM_ADMIN-only role + permission-matrix management. `SYSTEM_ADMIN` itself
 * is system-owned and never appears here as an editable row's matrix.
 */

import type { Database } from "@/db/client";
import type { RoleRow } from "@/db/schema/rbac";
import type {
  PermissionAction,
  PermissionResource,
  RoleScope,
} from "@/domain/rbac/types";
import { isUniqueViolation } from "@/lib/pg-error";
import {
  createRole,
  deleteRole,
  getRoleById,
  grantPermission,
  listRolePermissionsForRoles,
  listRoles,
  RbacRepoError,
  revokePermission,
} from "@/repo/rbac";
import { requireSystemAdmin } from "./rbac";

export type AdminRolesErrorCode = "CONFLICT" | "NOT_FOUND" | "VALIDATION_ERROR";

export class AdminRolesError extends Error {
  readonly code: AdminRolesErrorCode;
  readonly status: number;

  constructor(
    code: AdminRolesErrorCode,
    message: string,
    status: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "AdminRolesError";
    this.code = code;
    this.status = status;
  }
}

/** Keep in sync with `src/web/api/types.ts` `AdminRoleRow`. */
export interface AdminRoleRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly isSystem: boolean;
  readonly scope: RoleScope;
  readonly permissions: ReadonlyArray<{
    readonly resource: PermissionResource;
    readonly action: PermissionAction;
  }>;
}

function toRoleRow(
  role: RoleRow,
  permissions: ReadonlyArray<{
    resource: PermissionResource;
    action: PermissionAction;
  }>
): AdminRoleRow {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    scope: role.scope,
    permissions,
  };
}

export async function listAdminRoles(
  db: Database,
  actorUserId: string
): Promise<AdminRoleRow[]> {
  await requireSystemAdmin(db, actorUserId);
  const roleRows = await listRoles(db);
  const matrixRoleIds = roleRows
    .filter((role) => !role.isSystem)
    .map((role) => role.id);
  const permissionRows = await listRolePermissionsForRoles(db, matrixRoleIds);
  const byRole = new Map<
    string,
    Array<{ resource: PermissionResource; action: PermissionAction }>
  >();
  for (const cell of permissionRows) {
    const entry = { resource: cell.resource, action: cell.action };
    const existing = byRole.get(cell.roleId);
    if (existing === undefined) {
      byRole.set(cell.roleId, [entry]);
    } else {
      existing.push(entry);
    }
  }
  return roleRows
    .map((role) => toRoleRow(role, byRole.get(role.id) ?? []))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface CreateAdminRoleInput {
  readonly actorUserId: string;
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly scope: RoleScope;
}

export async function createAdminRole(
  db: Database,
  input: CreateAdminRoleInput
): Promise<AdminRoleRow> {
  await requireSystemAdmin(db, input.actorUserId);
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (code.length === 0 || name.length === 0) {
    throw new AdminRolesError(
      "VALIDATION_ERROR",
      "Role code and name are required",
      400
    );
  }
  try {
    const role = await createRole(db, {
      code,
      name,
      description: input.description ?? null,
      scope: input.scope,
    });
    return toRoleRow(role, []);
  } catch (error) {
    if (error instanceof RbacRepoError && error.message.includes("reserved")) {
      throw new AdminRolesError("VALIDATION_ERROR", error.message, 400, {
        cause: error,
      });
    }
    if (error instanceof RbacRepoError || isUniqueViolation(error)) {
      throw new AdminRolesError(
        "CONFLICT",
        `Role code already exists: ${code}`,
        409,
        { cause: error }
      );
    }
    throw error;
  }
}

export interface DeleteAdminRoleInput {
  readonly actorUserId: string;
  readonly roleId: string;
}

export async function deleteAdminRole(
  db: Database,
  input: DeleteAdminRoleInput
): Promise<{ readonly ok: true }> {
  await requireSystemAdmin(db, input.actorUserId);
  try {
    await deleteRole(db, input.roleId);
  } catch (error) {
    if (error instanceof RbacRepoError) {
      const status = error.message.includes("not found") ? 404 : 409;
      throw new AdminRolesError(
        status === 404 ? "NOT_FOUND" : "CONFLICT",
        error.message,
        status,
        { cause: error }
      );
    }
    throw error;
  }
  return { ok: true };
}

export interface SetRolePermissionInput {
  readonly actorUserId: string;
  readonly roleId: string;
  readonly resource: PermissionResource;
  readonly action: PermissionAction;
  readonly granted: boolean;
}

export async function setRolePermission(
  db: Database,
  input: SetRolePermissionInput
): Promise<AdminRoleRow> {
  await requireSystemAdmin(db, input.actorUserId);
  const role = await getRoleById(db, input.roleId);
  if (role === null) {
    throw new AdminRolesError(
      "NOT_FOUND",
      `Role ${input.roleId} not found`,
      404
    );
  }
  if (role.isSystem) {
    throw new AdminRolesError(
      "VALIDATION_ERROR",
      `${role.code} is system-owned and holds implicit full access`,
      400
    );
  }
  try {
    if (input.granted) {
      await grantPermission(db, input.roleId, input.resource, input.action);
    } else {
      await revokePermission(db, input.roleId, input.resource, input.action);
    }
  } catch (error) {
    if (error instanceof RbacRepoError) {
      throw new AdminRolesError("VALIDATION_ERROR", error.message, 400, {
        cause: error,
      });
    }
    throw error;
  }
  const cells = await listRolePermissionsForRoles(db, [input.roleId]);
  return toRoleRow(
    role,
    cells.map((cell) => ({ resource: cell.resource, action: cell.action }))
  );
}
