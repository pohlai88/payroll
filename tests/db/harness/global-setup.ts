/**
 * Runs once per test session: brings the schema up to date.
 *
 * Migrating here rather than per file means the plpgsql triggers are created
 * once and every test in the session runs against the same schema the
 * production migration set produces — not a schema built by a test helper that
 * could drift from it.
 */

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase, createPool } from "@/db/client";
import { resolveTestDatabaseUrl } from "./database";

export default async function setup(): Promise<void> {
  const pool = createPool(resolveTestDatabaseUrl(), { max: 1 });
  try {
    await migrate(createDatabase(pool), {
      migrationsFolder: "src/db/migrations",
    });
  } catch (cause) {
    throw new Error(
      "could not migrate the test database. Is it running? `docker compose up -d`",
      { cause }
    );
  } finally {
    await pool.end();
  }
}
