/**
 * @feature rbac
 * @layer repo
 * @hub src/server/routes/me.ts
 *
 * Persistence for users, roles, permission-matrix cells and assignments.
 *
 * Authorization decisions live in `src/domain/rbac` and `src/service/rbac`;
 * this module only loads and mutates rows.
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  type RolePermissionRow,
  type RoleRow,
  rolePermissions,
  roles,
  type UserRoleAssignmentRow,
  type UserRow,
  userRoleAssignments,
  users,
} from "@/db/schema/rbac";
import { normalizeEmail } from "@/domain/rbac/email";
import type {
  PermissionAction,
  PermissionResource,
  RoleScope,
  UserStatus,
} from "@/domain/rbac/types";
import { SYSTEM_ADMIN_ROLE_CODE } from "@/domain/rbac/types";

export class RbacRepoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RbacRepoError";
  }
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function createUser(
  db: Database,
  input: { email: string; name: string; status?: UserStatus }
): Promise<UserRow> {
  const [row] = await db
    .insert(users)
    .values({
      email: normalizeEmail(input.email),
      name: input.name.trim(),
      status: input.status ?? "ACTIVE",
    })
    .returning();
  if (row === undefined) {
    throw new RbacRepoError("createUser: insert returned no row");
  }
  return row;
}

export async function getUserById(
  db: Database,
  userId: string
): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row ?? null;
}

export async function getUserByEmail(
  db: Database,
  email: string
): Promise<UserRow | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)));
  return row ?? null;
}

export async function getUserByAuthSubject(
  db: Database,
  authSubject: string
): Promise<UserRow | null> {
  const subject = authSubject.trim();
  if (subject.length === 0) {
    throw new RbacRepoError("getUserByAuthSubject: authSubject is blank");
  }
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.authSubject, subject));
  return row ?? null;
}

/**
 * Stamp Neon Auth `sub` onto an invited user. Idempotent for the same subject;
 * refuses a different subject (identity takeover).
 */
export async function linkUserAuthSubject(
  db: Database,
  input: { userId: string; authSubject: string }
): Promise<UserRow> {
  const subject = input.authSubject.trim();
  if (subject.length === 0) {
    throw new RbacRepoError("linkUserAuthSubject: authSubject is blank");
  }

  const existing = await getUserById(db, input.userId);
  if (existing === null) {
    throw new RbacRepoError(
      `linkUserAuthSubject: user ${input.userId} not found`
    );
  }
  if (existing.authSubject !== null) {
    if (existing.authSubject === subject) {
      return existing;
    }
    throw new RbacRepoError(
      `linkUserAuthSubject: user ${input.userId} already linked to a different subject`
    );
  }

  const [row] = await db
    .update(users)
    .set({ authSubject: subject })
    .where(and(eq(users.id, input.userId), isNull(users.authSubject)))
    .returning();
  if (row === undefined) {
    // Concurrent linker won the race — re-read and apply the same rules.
    const raced = await getUserById(db, input.userId);
    if (raced === null) {
      throw new RbacRepoError(
        `linkUserAuthSubject: user ${input.userId} disappeared`
      );
    }
    if (raced.authSubject === subject) {
      return raced;
    }
    throw new RbacRepoError(
      `linkUserAuthSubject: user ${input.userId} already linked to a different subject`
    );
  }
  return row;
}

export async function listUsers(db: Database): Promise<UserRow[]> {
  return await db.select().from(users).orderBy(asc(users.email));
}

export async function setUserStatus(
  db: Database,
  input: { userId: string; status: UserStatus }
): Promise<UserRow> {
  const [row] = await db
    .update(users)
    .set({ status: input.status })
    .where(eq(users.id, input.userId))
    .returning();
  if (row === undefined) {
    throw new RbacRepoError(`setUserStatus: user ${input.userId} not found`);
  }
  return row;
}

/** Partial profile edit — powers the admin datatable's inline-editable cells. */
export async function updateUserProfile(
  db: Database,
  input: { userId: string; email?: string; name?: string }
): Promise<UserRow> {
  const patch: { email?: string; name?: string } = {};
  if (input.email !== undefined) {
    patch.email = normalizeEmail(input.email);
  }
  if (input.name !== undefined) {
    patch.name = input.name.trim();
  }
  if (Object.keys(patch).length === 0) {
    const existing = await getUserById(db, input.userId);
    if (existing === null) {
      throw new RbacRepoError(
        `updateUserProfile: user ${input.userId} not found`
      );
    }
    return existing;
  }
  const [row] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, input.userId))
    .returning();
  if (row === undefined) {
    throw new RbacRepoError(
      `updateUserProfile: user ${input.userId} not found`
    );
  }
  return row;
}

/**
 * Batched role-assignment summaries for every user — one query, joined with
 * role metadata. Powers the admin datatable's "Roles" column and expandable
 * sub-rows without N+1 queries.
 */
export async function listAllUserRoleAssignments(db: Database): Promise<
  Array<{
    userId: string;
    roleCode: string;
    roleName: string;
    companyId: string | null;
  }>
> {
  const rows = await db
    .select({
      userId: userRoleAssignments.userId,
      roleCode: roles.code,
      roleName: roles.name,
      companyId: userRoleAssignments.companyId,
    })
    .from(userRoleAssignments)
    .innerJoin(roles, eq(userRoleAssignments.roleId, roles.id));
  return rows;
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function createRole(
  db: Database,
  input: {
    code: string;
    name: string;
    description?: string | null;
    scope: RoleScope;
  }
): Promise<RoleRow> {
  if (input.code === SYSTEM_ADMIN_ROLE_CODE) {
    throw new RbacRepoError(
      `createRole: code ${SYSTEM_ADMIN_ROLE_CODE} is reserved for the system role`
    );
  }
  const [row] = await db
    .insert(roles)
    .values({
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      scope: input.scope,
      isSystem: false,
    })
    .returning();
  if (row === undefined) {
    throw new RbacRepoError("createRole: insert returned no row");
  }
  return row;
}

export async function getRoleById(
  db: Database,
  roleId: string
): Promise<RoleRow | null> {
  const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
  return row ?? null;
}

export async function getRoleByCode(
  db: Database,
  code: string
): Promise<RoleRow | null> {
  const [row] = await db.select().from(roles).where(eq(roles.code, code));
  return row ?? null;
}

export async function listRoles(db: Database): Promise<RoleRow[]> {
  return await db.select().from(roles);
}

export async function deleteRole(db: Database, roleId: string): Promise<void> {
  const role = await getRoleById(db, roleId);
  if (role === null) {
    throw new RbacRepoError(`deleteRole: role ${roleId} not found`);
  }
  if (role.isSystem) {
    throw new RbacRepoError(
      `deleteRole: system role ${role.code} cannot be deleted`
    );
  }
  await db.delete(roles).where(eq(roles.id, roleId));
}

// ---------------------------------------------------------------------------
// Permission matrix cells
// ---------------------------------------------------------------------------

export async function getRolePermissions(
  db: Database,
  roleId: string
): Promise<RolePermissionRow[]> {
  return await db
    .select()
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));
}

/** Batched permission-cell lookup for many roles at once (avoids N+1 in the matrix UI). */
export async function listRolePermissionsForRoles(
  db: Database,
  roleIds: readonly string[]
): Promise<RolePermissionRow[]> {
  if (roleIds.length === 0) {
    return [];
  }
  return await db
    .select()
    .from(rolePermissions)
    .where(inArray(rolePermissions.roleId, [...roleIds]));
}

export async function grantPermission(
  db: Database,
  roleId: string,
  resource: PermissionResource,
  action: PermissionAction
): Promise<RolePermissionRow> {
  const role = await getRoleById(db, roleId);
  if (role === null) {
    throw new RbacRepoError(`grantPermission: role ${roleId} not found`);
  }
  if (role.isSystem) {
    throw new RbacRepoError(
      `grantPermission: system role ${role.code} does not store matrix rows`
    );
  }
  const [row] = await db
    .insert(rolePermissions)
    .values({ roleId, resource, action })
    .onConflictDoNothing()
    .returning();
  if (row !== undefined) {
    return row;
  }
  // Already granted — return the existing cell.
  const [existing] = await db
    .select()
    .from(rolePermissions)
    .where(
      and(
        eq(rolePermissions.roleId, roleId),
        eq(rolePermissions.resource, resource),
        eq(rolePermissions.action, action)
      )
    );
  if (existing === undefined) {
    throw new RbacRepoError("grantPermission: conflict but row missing");
  }
  return existing;
}

export async function revokePermission(
  db: Database,
  roleId: string,
  resource: PermissionResource,
  action: PermissionAction
): Promise<void> {
  const role = await getRoleById(db, roleId);
  if (role === null) {
    throw new RbacRepoError(`revokePermission: role ${roleId} not found`);
  }
  if (role.isSystem) {
    throw new RbacRepoError(
      `revokePermission: system role ${role.code} does not store matrix rows`
    );
  }
  await db
    .delete(rolePermissions)
    .where(
      and(
        eq(rolePermissions.roleId, roleId),
        eq(rolePermissions.resource, resource),
        eq(rolePermissions.action, action)
      )
    );
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export async function getUserRoleAssignments(
  db: Database,
  userId: string
): Promise<UserRoleAssignmentRow[]> {
  return await db
    .select()
    .from(userRoleAssignments)
    .where(eq(userRoleAssignments.userId, userId));
}

/**
 * Assign a role to a user.
 *
 * GLOBAL roles must have a null companyId; COMPANY roles require one. The
 * Postgres CHECK constraint cannot join tables, so the scope rule is enforced
 * here.
 */
export async function assignUserToRole(
  db: Database,
  input: { userId: string; roleId: string; companyId?: string | null }
): Promise<UserRoleAssignmentRow> {
  const role = await getRoleById(db, input.roleId);
  if (role === null) {
    throw new RbacRepoError(`assignUserToRole: role ${input.roleId} not found`);
  }
  const companyId = input.companyId ?? null;
  if (role.scope === "GLOBAL" && companyId !== null) {
    throw new RbacRepoError(
      `assignUserToRole: GLOBAL role ${role.code} cannot be scoped to a company`
    );
  }
  if (role.scope === "COMPANY" && companyId === null) {
    throw new RbacRepoError(
      `assignUserToRole: COMPANY role ${role.code} requires a companyId`
    );
  }

  const [row] = await db
    .insert(userRoleAssignments)
    .values({
      userId: input.userId,
      roleId: input.roleId,
      companyId,
    })
    .returning();
  if (row === undefined) {
    throw new RbacRepoError("assignUserToRole: insert returned no row");
  }
  return row;
}

export async function revokeUserRole(
  db: Database,
  input: { userId: string; roleId: string; companyId?: string | null }
): Promise<void> {
  const companyId = input.companyId ?? null;
  if (companyId === null) {
    await db
      .delete(userRoleAssignments)
      .where(
        and(
          eq(userRoleAssignments.userId, input.userId),
          eq(userRoleAssignments.roleId, input.roleId),
          isNull(userRoleAssignments.companyId)
        )
      );
    return;
  }
  await db
    .delete(userRoleAssignments)
    .where(
      and(
        eq(userRoleAssignments.userId, input.userId),
        eq(userRoleAssignments.roleId, input.roleId),
        eq(userRoleAssignments.companyId, companyId)
      )
    );
}

/**
 * Load every assignment for a user together with the role metadata and the
 * permission cells on those roles — the shape the authorization service needs.
 *
 * Batched (not N+1): one assignments query, one roles query, one permissions
 * query. Auth middleware hits this on every `/v1` request.
 */
export async function loadAuthRoleGrants(
  db: Database,
  userId: string
): Promise<
  Array<{
    roleCode: string;
    isSystem: boolean;
    scope: RoleScope;
    companyId: string | null;
    permissions: Array<{
      resource: PermissionResource;
      action: PermissionAction;
    }>;
  }>
> {
  const assignments = await getUserRoleAssignments(db, userId);
  if (assignments.length === 0) {
    return [];
  }

  const roleIds = [...new Set(assignments.map((a) => a.roleId))];
  const roleRows = await db
    .select()
    .from(roles)
    .where(inArray(roles.id, roleIds));
  const roleById = new Map(roleRows.map((role) => [role.id, role]));

  const matrixRoleIds = roleRows
    .filter((role) => !role.isSystem)
    .map((role) => role.id);

  const permissionRows =
    matrixRoleIds.length === 0
      ? []
      : await db
          .select()
          .from(rolePermissions)
          .where(inArray(rolePermissions.roleId, matrixRoleIds));

  const permissionsByRole = new Map<
    string,
    Array<{ resource: PermissionResource; action: PermissionAction }>
  >();
  for (const cell of permissionRows) {
    const existing = permissionsByRole.get(cell.roleId);
    const entry = { resource: cell.resource, action: cell.action };
    if (existing === undefined) {
      permissionsByRole.set(cell.roleId, [entry]);
    } else {
      existing.push(entry);
    }
  }

  const result: Array<{
    roleCode: string;
    isSystem: boolean;
    scope: RoleScope;
    companyId: string | null;
    permissions: Array<{
      resource: PermissionResource;
      action: PermissionAction;
    }>;
  }> = [];

  for (const assignment of assignments) {
    const role = roleById.get(assignment.roleId);
    if (role === undefined) {
      continue;
    }
    result.push({
      roleCode: role.code,
      isSystem: role.isSystem,
      scope: role.scope,
      companyId: assignment.companyId,
      permissions: role.isSystem ? [] : (permissionsByRole.get(role.id) ?? []),
    });
  }
  return result;
}
