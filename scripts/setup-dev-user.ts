/**
 * Set up a developer user for quick login during development.
 *
 * This script creates an app user in the database that can be used with
 * the Developer Login button. You must first create the user in Neon Auth
 * manually or via the Neon Auth API.
 *
 * Usage:
 *   npx tsx scripts/setup-dev-user.ts --email dev@example.com --name "Dev User" --system-admin
 *
 * Then set in .env.local:
 *   VITE_DEV_EMAIL=dev@example.com
 *   VITE_DEV_PASSWORD=<your-password>
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
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (email === undefined || name === undefined) {
    throw new Error(
      "Usage: --email <email> --name <name> [--system-admin]"
    );
  }

  return { email, name, systemAdmin };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pool = createPool(requireDatabaseUrl());
  const db = createDatabase(pool);

  try {
    const email = normalizeEmail(args.email);
    
    console.log("\n=== Setting up Developer User ===\n");
    console.log("Step 1: Create user in Neon Auth");
    console.log(`  1. Go to your Neon Console → Auth`);
    console.log(`  2. Create a new user with email: ${email}`);
    console.log(`  3. Set a password (you'll use this with the Developer Login button)\n`);
    console.log("Step 2: Creating app user in database...");

    let user = await getUserByEmail(db, email);
    if (user === null) {
      user = await createUser(db, { email, name: args.name });
      console.log(`✓ Created user ${user.id} <${user.email}>`);
    } else {
      console.log(`✓ User already exists ${user.id} <${user.email}>`);
    }

    if (args.systemAdmin) {
      const role = await getRoleByCode(db, SYSTEM_ADMIN_ROLE_CODE);
      if (role === null) {
        throw new Error(`Role not found: ${SYSTEM_ADMIN_ROLE_CODE}`);
      }
      try {
        await assignUserToRole(db, {
          userId: user.id,
          roleId: role.id,
          companyId: null,
        });
        console.log(`✓ Assigned role ${SYSTEM_ADMIN_ROLE_CODE}`);
      } catch (error) {
        const chain = error instanceof Error ? error.message : String(error);
        if (/unique|duplicate/i.test(chain)) {
          console.log(`✓ Role ${SYSTEM_ADMIN_ROLE_CODE} already assigned`);
        } else {
          throw error;
        }
      }
    }

    console.log("\nStep 3: Add to .env.local:");
    console.log(`  VITE_DEV_EMAIL=${email}`);
    console.log(`  VITE_DEV_PASSWORD=<your-neon-auth-password>`);
    console.log("\n✓ Developer user setup complete!");
    console.log("\nYou can now use the 'Developer Login' button on the sign-in page.\n");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
