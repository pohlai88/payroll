/**
 * Bootstrap / invite an app user (no Neon Auth JWT required).
 *
 * Usage:
 *   npx tsx scripts/invite-user.ts --email a@b.com --name "Ada" --system-admin
 *   npx tsx scripts/invite-user.ts --email a@b.com --name "Ada" --role PAYROLL_OPS --company-id <uuid>
 */

import {
  createDatabase,
  createPool,
  requireDatabaseUrl,
} from "../src/db/client";
import { normalizeEmail } from "../src/domain/rbac/email";
import { SYSTEM_ADMIN_ROLE_CODE } from "../src/domain/rbac/types";
import {
  assignUserToRole,
  createUser,
  getRoleByCode,
  getUserByEmail,
} from "../src/repo/rbac";
import { loadEnvLocal } from "../src/server/load-env-local";

loadEnvLocal();

interface Args {
  email: string;
  name: string;
  systemAdmin: boolean;
  roleCode: string | null;
  companyId: string | null;
}

function takeValue(
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

function parseArgs(argv: string[]): Args {
  let email: string | undefined;
  let name: string | undefined;
  let systemAdmin = false;
  let roleCode: string | null = null;
  let companyId: string | null = null;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === undefined) {
      break;
    }
    if (arg === "--email") {
      const taken = takeValue(argv, i, arg);
      email = taken.value;
      i = taken.nextIndex;
    } else if (arg === "--name") {
      const taken = takeValue(argv, i, arg);
      name = taken.value;
      i = taken.nextIndex;
    } else if (arg === "--system-admin") {
      systemAdmin = true;
      i += 1;
    } else if (arg === "--role") {
      const taken = takeValue(argv, i, arg);
      roleCode = taken.value;
      i = taken.nextIndex;
    } else if (arg === "--company-id") {
      const taken = takeValue(argv, i, arg);
      companyId = taken.value;
      i = taken.nextIndex;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (email === undefined || name === undefined) {
    throw new Error(
      "Usage: --email <email> --name <name> [--system-admin] [--role CODE] [--company-id UUID]"
    );
  }

  return { email, name, systemAdmin, roleCode, companyId };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pool = createPool(requireDatabaseUrl());
  const db = createDatabase(pool);

  try {
    const email = normalizeEmail(args.email);
    let user = await getUserByEmail(db, email);
    if (user === null) {
      user = await createUser(db, { email, name: args.name });
      console.log(`created user ${user.id} <${user.email}>`);
    } else {
      console.log(`user already exists ${user.id} <${user.email}>`);
    }

    const roleCode = args.systemAdmin ? SYSTEM_ADMIN_ROLE_CODE : args.roleCode;
    if (roleCode !== null) {
      const role = await getRoleByCode(db, roleCode);
      if (role === null) {
        throw new Error(`role not found: ${roleCode}`);
      }
      if (role.scope === "COMPANY" && args.companyId === null) {
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
            companyId: args.companyId,
          });
        }
        console.log(`assigned role ${roleCode}`);
      } catch (error) {
        const chain = error instanceof Error ? error.message : String(error);
        if (/unique|duplicate/i.test(chain)) {
          console.log(`role ${roleCode} already assigned`);
        } else {
          throw error;
        }
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
