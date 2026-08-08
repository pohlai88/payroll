/**
 * The test database harness.
 *
 * Tests run against a real Postgres — the one `docker-compose.yml` defines —
 * because the triggers and constraints being tested are plpgsql and only a real
 * server can prove they fire. The container keeps its data on tmpfs, so this is
 * fast without being a simulation.
 */

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import {
  createDatabase,
  createPool,
  type Database,
  LOCAL_DEV_DATABASE_URL,
} from "@/db/client";

/**
 * Hosts this harness is willing to truncate.
 *
 * The harness deletes every row in the tables a test touched. Pointed at a real
 * database that would destroy a payroll, so the target must be local unless
 * someone deliberately says otherwise. A developer with DATABASE_URL still set
 * to a staging server from an earlier task should get an error, not an empty
 * database.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db"]);
const OVERRIDE_FLAG = "ALLOW_DESTRUCTIVE_TEST_DB";

export function resolveTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? LOCAL_DEV_DATABASE_URL;
  if (process.env[OVERRIDE_FLAG] === "1") {
    return url;
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch (cause) {
    throw new Error(`DATABASE_URL is not a valid URL: ${JSON.stringify(url)}`, {
      cause,
    });
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `refusing to run destructive tests against host ${host}: the harness truncates every table it touches. ` +
        `Point DATABASE_URL at the local docker database (${LOCAL_DEV_DATABASE_URL}), ` +
        `or set ${OVERRIDE_FLAG}=1 if you genuinely mean this one.`
    );
  }
  return url;
}

export interface TestDatabase {
  readonly db: Database;
  readonly pool: Pool;
  /** Empties the named tables and everything referencing them. */
  readonly truncate: (...tables: string[]) => Promise<void>;
  readonly close: () => Promise<void>;
}

export function connectTestDatabase(): TestDatabase {
  const pool = createPool(resolveTestDatabaseUrl(), { max: 4 });
  const db = createDatabase(pool);

  return {
    db,
    pool,
    async truncate(...tables: string[]): Promise<void> {
      if (tables.length === 0) {
        return;
      }
      /**
       * `CASCADE` rather than a hand-maintained dependency order: adding a table
       * would otherwise silently leave rows behind in whatever the new table
       * references, and a test that starts from a dirty database fails in a way
       * that points nowhere near the cause.
       *
       * `RESTART IDENTITY` resets audit_events' identity column so id ordering
       * is meaningful within each test.
       */
      const list = tables
        .map((t) => `"${assertPlainIdentifier(t)}"`)
        .join(", ");
      await db.execute(
        sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
      );
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

/**
 * Table names reach `sql.raw` here, so they must not be able to carry SQL. They
 * are always literals written in a test file, never user input — this asserts
 * that stays true.
 */
function assertPlainIdentifier(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`not a plain table identifier: ${JSON.stringify(name)}`);
  }
  return name;
}

/**
 * Asserts that the database refused an operation, and why.
 *
 * Drizzle wraps driver errors in a `Failed query: ...` Error and hangs the
 * original off `cause`, so a plain `rejects.toThrow(/message/)` matches the
 * wrapper and never sees the constraint name or the RAISE text. This walks the
 * chain and matches against all of it, which is the part worth asserting: a
 * trigger that fires with the wrong message is a trigger nobody will understand
 * at three in the morning.
 */
export async function expectRejected(
  operation: Promise<unknown>,
  pattern: RegExp
): Promise<void> {
  let raised: unknown;
  try {
    await operation;
  } catch (error) {
    raised = error;
  }

  if (raised === undefined) {
    throw new Error(
      `expected the database to reject this operation (${pattern}), but it succeeded`
    );
  }

  const chain = collectMessages(raised);
  if (!pattern.test(chain)) {
    throw new Error(
      "the database rejected the operation, but not for the expected reason.\n" +
        `  expected to match: ${pattern}\n  actual: ${chain}`
    );
  }
}

function collectMessages(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    parts.push(current.message);
    // Postgres puts the constraint name in a field of its own, not the message.
    const detail = (current as { constraint?: unknown }).constraint;
    if (typeof detail === "string") {
      parts.push(detail);
    }
    current = current.cause;
  }
  return parts.join(" | ");
}

/** Every table in the slice, in no particular order — TRUNCATE ... CASCADE handles the graph. */
export const ALL_TABLES = [
  "audit_events",
  "pcb_entries",
  "pay_line_overrides",
  "pay_line_items",
  "pay_lines",
  "pay_runs",
  "employment_pay_items",
  "employments",
  "persons",
  "companies",
  "pay_items",
  "epf_bands",
  "socso_bands",
  "eis_bands",
  "rule_settings",
  "rule_sources",
  "rule_packs",
  "seed_files",
] as const;
