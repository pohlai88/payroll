/**
 * The one database client.
 *
 * `drizzle-orm/node-postgres` over a plain `pg` Pool, used identically against
 * the local Docker Postgres and against Neon's pooled endpoint — Neon speaks the
 * standard wire protocol, so there is no second driver, no edge-runtime variant
 * and no environment-conditional branch anywhere in this file. The connection
 * string is the only thing that differs between environments.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

/**
 * The local development and test database defined by `docker-compose.yml`.
 *
 * Exported so the test harness and the developer scripts name the same database
 * without copying a URL between files. It is never a fallback: a missing
 * `DATABASE_URL` is an error, because silently defaulting to localhost is how a
 * command meant for a real database quietly succeeds against an empty one.
 */
export const LOCAL_DEV_DATABASE_URL =
  "postgres://payroll:payroll@localhost:54329/payroll";

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === "") {
    throw new Error(
      "DATABASE_URL is not set. For local work start the database with `docker compose up -d` " +
        `and export DATABASE_URL=${LOCAL_DEV_DATABASE_URL}`
    );
  }
  return url;
}

export type Database = ReturnType<typeof createDatabase>;

/**
 * An idle client can be dropped by the backend at any time — a network blip,
 * a managed Postgres provider scaling to zero, a DBA restart — and `pg`
 * surfaces that as an `'error'` event on the pool, not as a rejected query.
 * With no listener, that event is unhandled and crashes the process; a
 * payroll run in progress should survive a transient connection loss on a
 * connection it was not even using.
 */
function logPoolError(error: Error): void {
  // No logger is wired into this layer yet; silence is the one option that is
  // never acceptable here, since it turns a recoverable event into a crash.
  console.error("pg pool: idle client error", error);
}

export function createPool(
  connectionString: string,
  config: Omit<PoolConfig, "connectionString"> = {}
): Pool {
  const pool = new Pool({ connectionString, ...config });
  pool.on("error", logPoolError);
  return pool;
}

/**
 * No `schema` option, and so no barrel file: the repository layer issues explicit
 * queries against the table modules it imports rather than going through the
 * relational query API, which is the only thing that needs the whole schema in
 * one object.
 */
export function createDatabase(pool: Pool) {
  return drizzle(pool, { casing: "snake_case" });
}
