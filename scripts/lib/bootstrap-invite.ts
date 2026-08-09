/**
 * @feature admin-users
 * @layer spine
 *
 * Shared CLI bootstrap: create/invite an app `users` row and optional role.
 * Used by `invite-user.ts` and `setup-dev-user.ts` (no Neon Auth JWT needed).
 */

import type { Database } from "../../src/db/client";
import { normalizeEmail } from "../../src/domain/rbac/email";
import { SYSTEM_ADMIN_ROLE_CODE } from "../../src/domain/rbac/types";
import { isUniqueViolation } from "../../src/lib/pg-error";
import {
  assignUserToRole,
  createUser,
  getRoleByCode,
  getUserByEmail,
} from "../../src/repo/rbac";

export interface BootstrapInviteInput {
  readonly email: string;
  readonly name: string;
  readonly systemAdmin: boolean;
  readonly roleCode: string | null;
  readonly companyId: string | null;
}

export async function bootstrapInviteUser(
  db: Database,
  input: BootstrapInviteInput
): Promise<{ readonly userId: string; readonly email: string }> {
  const email = normalizeEmail(input.email);
  let user = await getUserByEmail(db, email);
  if (user === null) {
    user = await createUser(db, { email, name: input.name });
    console.log(`created user ${user.id} <${user.email}>`);
  } else {
    console.log(`user already exists ${user.id} <${user.email}>`);
  }

  const roleCode = input.systemAdmin ? SYSTEM_ADMIN_ROLE_CODE : input.roleCode;
  if (roleCode === null) {
    return { userId: user.id, email: user.email };
  }

  const role = await getRoleByCode(db, roleCode);
  if (role === null) {
    throw new Error(
      `role not found: ${roleCode} — run \`npm run db:seed\` first (see docs/developer-login.md)`
    );
  }
  if (role.scope === "COMPANY" && input.companyId === null) {
    throw new Error(`COMPANY role ${roleCode} requires --company-id`);
  }

  try {
    if (role.scope === "GLOBAL") {
      await assignUserToRole(db, {
        userId: user.id,
        roleId: role.id,
        companyId: null,
      });
    } else {
      await assignUserToRole(db, {
        userId: user.id,
        roleId: role.id,
        companyId: input.companyId,
      });
    }
    console.log(`assigned role ${roleCode}`);
  } catch (error) {
    if (isUniqueViolation(error)) {
      console.log(`role ${roleCode} already assigned`);
    } else {
      throw error;
    }
  }

  return { userId: user.id, email: user.email };
}

export function takeFlagValue(
  argv: string[],
  index: number,
  flag: string
): { value: string; nextIndex: number } {
  const value = argv[index + 1];
  if (value === undefined) {
    throw new Error(`Missing value for ${flag}`);
  }
  return { value, nextIndex: index + 2 };
}
