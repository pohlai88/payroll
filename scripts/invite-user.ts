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
import { loadEnvLocal } from "../src/server/load-env-local";
import { bootstrapInviteUser, takeFlagValue } from "./lib/bootstrap-invite";

loadEnvLocal();

interface Args {
  email: string;
  name: string;
  systemAdmin: boolean;
  roleCode: string | null;
  companyId: string | null;
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
      const taken = takeFlagValue(argv, i, arg);
      email = taken.value;
      i = taken.nextIndex;
    } else if (arg === "--name") {
      const taken = takeFlagValue(argv, i, arg);
      name = taken.value;
      i = taken.nextIndex;
    } else if (arg === "--system-admin") {
      systemAdmin = true;
      i += 1;
    } else if (arg === "--role") {
      const taken = takeFlagValue(argv, i, arg);
      roleCode = taken.value;
      i = taken.nextIndex;
    } else if (arg === "--company-id") {
      const taken = takeFlagValue(argv, i, arg);
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
    await bootstrapInviteUser(db, args);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
