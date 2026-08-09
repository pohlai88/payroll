/**
 * @feature shell
 * @layer spine
 *
 * Applies pending migrations to the database named by DATABASE_URL.
 *
 * The same script runs against the local Docker Postgres and against Neon; the
 * connection string is the only difference.
 */

import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  createDatabase,
  createPool,
  requireDatabaseUrl,
} from "../src/db/client";
import { loadEnvLocal } from "../src/server/load-env-local";

loadEnvLocal();

const MIGRATIONS_FOLDER = "src/db/migrations";

async function main(): Promise<void> {
  const url = requireDatabaseUrl();
  const pool = createPool(url);
  try {
    await migrate(createDatabase(pool), {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    process.stdout.write(`migrations applied to ${redact(url)}\n`);
  } finally {
    await pool.end();
  }
}

/** Never print a password, even to a developer's own terminal. */
function redact(url: string): string {
  return url.replace(/\/\/([^:]+):[^@]*@/, "//$1:***@");
}

await main();
