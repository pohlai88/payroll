/**
 * @feature shell
 * @layer spine
 *
 * Drops and rebuilds the database named by DATABASE_URL, then seeds it.
 *
 * Intended for the disposable Docker database (`docker compose`). Neon and any
 * other remote host are refused unless ALLOW_DESTRUCTIVE_RESET=1 is set — the
 * same class of guard as the test harness, because a mistaken reset against a
 * managed branch would erase a real payroll.
 */

import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  createDatabase,
  createPool,
  LOCAL_DEV_DATABASE_URL,
  requireDatabaseUrl,
} from "../src/db/client";
import { seed } from "./seed";

const MIGRATIONS_FOLDER = "src/db/migrations";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db"]);
const OVERRIDE_FLAG = "ALLOW_DESTRUCTIVE_RESET";

export function assertResetAllowed(connectionString: string): void {
  if (process.env[OVERRIDE_FLAG] === "1") {
    return;
  }

  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch (cause) {
    throw new Error(
      `DATABASE_URL is not a valid URL: ${JSON.stringify(connectionString)}`,
      { cause }
    );
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `refusing to reset host ${host}: this drops schemas public and drizzle. ` +
        `Point DATABASE_URL at the local docker database (${LOCAL_DEV_DATABASE_URL}), ` +
        `or set ${OVERRIDE_FLAG}=1 if you genuinely mean this one.`
    );
  }
}

/** Never print a password, even to a developer's own terminal. */
function redact(url: string): string {
  return url.replace(/\/\/([^:]+):[^@]*@/, "//$1:***@");
}

/**
 * Drops `public` and `drizzle`, re-runs migrations, seeds. Returns the seeded rule-pack id.
 */
export async function resetDatabase(connectionString: string): Promise<string> {
  assertResetAllowed(connectionString);

  const pool = createPool(connectionString, { max: 1 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO PUBLIC");

    const db = createDatabase(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const packId = await seed(db);
    return packId;
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const url = requireDatabaseUrl();
  const packId = await resetDatabase(url);
  process.stdout.write(
    `reset complete on ${redact(url)}; seeded rule pack ${packId}\n`
  );
}

if (process.argv[1]?.endsWith("reset.ts")) {
  await main();
}
