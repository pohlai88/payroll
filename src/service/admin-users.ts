/**
 * @feature admin-users
 * @layer service
 * @hub src/server/routes/admin-users.ts
 *
 * SYSTEM_ADMIN-only user invite and role management.
 */

import type { Database } from "@/db/client";
import type { UserRow } from "@/db/schema/rbac";
import { normalizeEmail } from "@/domain/rbac/email";
import { SYSTEM_ADMIN_ROLE_CODE } from "@/domain/rbac/types";
import { isUniqueViolation } from "@/lib/pg-error";
import {
  assignUserToRole,
  createUser,
  getRoleByCode,
  getUserByEmail,
  getUserById,
  listUsers as listUserRows,
  RbacRepoError,
  revokeUserRole,
  setUserStatus,
} from "@/repo/rbac";
import { requireSystemAdmin } from "./rbac";

export type AdminErrorCode =
  | "CONFLICT"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "SELF_LOCKOUT";

export class AdminUsersError extends Error {
  readonly code: AdminErrorCode;
  readonly status: number;

  constructor(
    code: AdminErrorCode,
    message: string,
    status: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "AdminUsersError";
    this.code = code;
    this.status = status;
  }
}

export async function inviteUser(
  db: Database,
  input: {
    readonly actorUserId: string;
    readonly email: string;
    readonly name: string;
    readonly roleCode?: string | null;
    readonly companyId?: string | null;
  }
): Promise<UserRow> {
  await requireSystemAdmin(db, input.actorUserId);

  const email = normalizeEmail(input.email);
  const existing = await getUserByEmail(db, email);
  if (existing !== null) {
    throw new AdminUsersError(
      "CONFLICT",
      `User already invited: ${email}`,
      409
    );
  }

  const name = input.name.trim();
  if (name.length === 0) {
    throw new AdminUsersError("VALIDATION_ERROR", "name is blank", 400);
  }

  let user: UserRow;
  try {
    user = await createUser(db, { email, name });
  } catch (error) {
    if (error instanceof RbacRepoError || isUniqueViolation(error)) {
      // biome-ignore lint/style/useErrorCause: ErrorOptions is the 4th constructor arg
      throw new AdminUsersError(
        "CONFLICT",
        `User already invited: ${email}`,
        409,
        { cause: error }
      );
    }
    throw error;
  }

  if (input.roleCode !== undefined && input.roleCode !== null) {
    await assignRoleByCode(db, {
      userId: user.id,
      roleCode: input.roleCode,
      companyId: input.companyId,
    });
  }

  return user;
}

export async function listUsers(
  db: Database,
  actorUserId: string
): Promise<UserRow[]> {
  await requireSystemAdmin(db, actorUserId);
  return await listUserRows(db);
}

export async function updateUserStatus(
  db: Database,
  input: {
    readonly actorUserId: string;
    readonly userId: string;
    readonly status: "ACTIVE" | "DISABLED";
  }
): Promise<UserRow> {
  await requireSystemAdmin(db, input.actorUserId);

  if (input.actorUserId === input.userId && input.status === "DISABLED") {
    throw new AdminUsersError(
      "SELF_LOCKOUT",
      "Cannot disable your own account",
      400
    );
  }

  const target = await getUserById(db, input.userId);
  if (target === null) {
    throw new AdminUsersError(
      "NOT_FOUND",
      `User ${input.userId} not found`,
      404
    );
  }

  return await setUserStatus(db, {
    userId: input.userId,
    status: input.status,
  });
}

export async function assignUserRole(
  db: Database,
  input: {
    readonly actorUserId: string;
    readonly userId: string;
    readonly roleCode: string;
    readonly companyId?: string | null;
  }
): Promise<void> {
  await requireSystemAdmin(db, input.actorUserId);
  const target = await getUserById(db, input.userId);
  if (target === null) {
    throw new AdminUsersError(
      "NOT_FOUND",
      `User ${input.userId} not found`,
      404
    );
  }
  await assignRoleByCode(db, {
    userId: input.userId,
    roleCode: input.roleCode,
    companyId: input.companyId,
  });
}

export async function revokeUserRoleAssignment(
  db: Database,
  input: {
    readonly actorUserId: string;
    readonly userId: string;
    readonly roleCode: string;
    readonly companyId?: string | null;
  }
): Promise<void> {
  await requireSystemAdmin(db, input.actorUserId);

  if (
    input.actorUserId === input.userId &&
    input.roleCode === SYSTEM_ADMIN_ROLE_CODE
  ) {
    throw new AdminUsersError(
      "SELF_LOCKOUT",
      "Cannot revoke your own SYSTEM_ADMIN role",
      400
    );
  }

  const role = await getRoleByCode(db, input.roleCode);
  if (role === null) {
    throw new AdminUsersError(
      "NOT_FOUND",
      `Role ${input.roleCode} not found`,
      404
    );
  }

  await revokeUserRole(db, {
    userId: input.userId,
    roleId: role.id,
    companyId: input.companyId,
  });
}

async function assignRoleByCode(
  db: Database,
  input: {
    userId: string;
    roleCode: string;
    companyId?: string | null;
  }
): Promise<void> {
  const role = await getRoleByCode(db, input.roleCode);
  if (role === null) {
    throw new AdminUsersError(
      "NOT_FOUND",
      `Role ${input.roleCode} not found`,
      404
    );
  }
  try {
    await assignUserToRole(db, {
      userId: input.userId,
      roleId: role.id,
      companyId: input.companyId,
    });
  } catch (error) {
    if (error instanceof RbacRepoError) {
      // biome-ignore lint/style/useErrorCause: ErrorOptions is the 4th constructor arg
      throw new AdminUsersError("VALIDATION_ERROR", error.message, 400, {
        cause: error,
      });
    }
    throw error;
  }
}
