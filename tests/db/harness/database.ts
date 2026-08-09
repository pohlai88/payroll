/**
 * @feature shell
 * @layer test
 *
 * The test database harness.
 *
 * Tests run against a real Postgres — the one `docker-compose.yml` defines —
 * because the triggers and constraints being tested are plpgsql and only a real
 * server can prove they fire. The container keeps its data on tmpfs, so this is
 * fast without being a simulation.
 */

import { sql } from "drizzle-orm";
import { Client, type Pool } from "pg";
import {
  createDatabase,
  createPool,
  type Database,
  LOCAL_DEV_DATABASE_URL,
  LOCAL_TEST_DATABASE_URL,
} from "@/db/client";

/** Anything that can run a parameterized query — `Client` or `Pool`. */
export type LockConnection = Pick<Client, "query">;

/**
 * Hosts this harness is willing to truncate.
 *
 * The harness deletes every row in the tables a test touched. Pointed at a real
 * database that would destroy a payroll, so the target must be local unless
 * someone deliberately says otherwise. A developer with TEST_DATABASE_URL still
 * set to a staging server from an earlier task should get an error, not an empty
 * database.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db"]);
const OVERRIDE_FLAG = "ALLOW_DESTRUCTIVE_TEST_DB";

/** `postgres://user:pw@host:port/NAME` → `NAME` (no leading slash). */
function databaseNameOf(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

/**
 * Last line of defence: never truncate the database the developer works in.
 *
 * The host check below only proves the server is local — and dev and test live
 * in the *same* local server, so it cannot tell them apart. This did real
 * damage: a watch-mode runner repeatedly emptied `users` and `roles` out from
 * under a running session, which reads as an auth bug, not a test artefact.
 *
 * Checked by name rather than by whole-URL equality so a differing password,
 * pool flag or query string cannot smuggle the dev database through.
 */
function assertNotTheDevDatabase(url: string): void {
  if (databaseNameOf(url) !== databaseNameOf(LOCAL_DEV_DATABASE_URL)) {
    return;
  }
  throw new Error(
    "refusing to run destructive tests against the development database " +
      `("${databaseNameOf(LOCAL_DEV_DATABASE_URL)}"): this harness truncates every table it touches, ` +
      "which would delete your own users, roles and seeded rows. " +
      `Use ${LOCAL_TEST_DATABASE_URL} (the default), or set ${OVERRIDE_FLAG}=1 if you genuinely mean this one.`
  );
}

/**
 * The test database, which is deliberately **not** `DATABASE_URL`.
 *
 * This harness truncates every table it touches. Reading `DATABASE_URL` meant a
 * developer with the dev database exported — the normal state while running the
 * app — had their own users, roles and seeded rows deleted by any background
 * test run. Tests now address `payroll_test` unless `TEST_DATABASE_URL` says
 * otherwise; `DATABASE_URL` is ignored so the two can never converge by accident.
 */
export function resolveTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? LOCAL_TEST_DATABASE_URL;
  if (process.env[OVERRIDE_FLAG] === "1") {
    return url;
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch (cause) {
    throw new Error(
      `TEST_DATABASE_URL is not a valid URL: ${JSON.stringify(url)}`,
      {
        cause,
      }
    );
  }

  assertNotTheDevDatabase(url);

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `refusing to run destructive tests against host ${host}: the harness truncates every table it touches. ` +
        `Point TEST_DATABASE_URL at the local docker test database (${LOCAL_TEST_DATABASE_URL}), ` +
        `or set ${OVERRIDE_FLAG}=1 if you genuinely mean this one.`
    );
  }
  return url;
}

/**
 * Advisory-lock key claimed by `global-setup.ts` for the whole test session.
 *
 * A second, independent `vitest` invocation (another terminal, a stray
 * process, a concurrent agent) against the same Postgres has no way to know
 * the first one is mid-run: `maxWorkers`/`fileParallelism` only serialize
 * files *inside* one process. Both processes' `beforeEach` would then
 * truncate and reseed the same hardcoded fixture rows out of turn, producing
 * exactly the kind of "wrong trigger fired" / "fixture missing" failures an
 * un-contended run never reproduces. Held for one session key, checked once,
 * so the second process fails fast with a clear message instead of racing.
 *
 * The lock MUST be held on a dedicated `Client`, not a `Pool`. node-pg's
 * default `idleTimeoutMillis` (10s) closes idle pooled backends, which
 * silently releases a session advisory lock mid-suite and lets a second
 * vitest in — the exact race this guard exists to prevent.
 */
export const TEST_SESSION_LOCK_KEY = 875_321_001;

/** Attempts to take a Postgres session-level advisory lock; never blocks. */
export async function tryAcquireExclusiveLock(
  connection: LockConnection,
  key: number
): Promise<boolean> {
  const result = await connection.query<{ locked: boolean }>(
    "select pg_try_advisory_lock($1) as locked",
    [key]
  );
  return result.rows[0]?.locked === true;
}

/** Releases a lock taken by {@link tryAcquireExclusiveLock} on the same connection. */
export async function releaseExclusiveLock(
  connection: LockConnection,
  key: number
): Promise<void> {
  await connection.query("select pg_advisory_unlock($1)", [key]);
}

/**
 * Opens a dedicated client for holding the session advisory lock.
 *
 * Prefer this over a `Pool` for any lock that must survive idle periods —
 * see {@link TEST_SESSION_LOCK_KEY}.
 *
 * Attaches an `'error'` listener so a backend restart during a long suite
 * cannot crash the Vitest process via an unhandled Client `'error'` event
 * (the same footgun `createPool` already covers for pooled clients).
 */
export async function openLockClient(
  connectionString: string = resolveTestDatabaseUrl()
): Promise<Client> {
  const client = new Client({ connectionString });
  client.on("error", (error) => {
    console.error("pg lock client: connection error", error);
  });
  await client.connect();
  return client;
}

export interface TestDatabase {
  readonly db: Database;
  readonly pool: Pool;
  /** Empties the named tables and everything referencing them. */
  readonly truncate: (...tables: string[]) => Promise<void>;
  readonly close: () => Promise<void>;
}

/**
 * Process-wide pool for the db project.
 *
 * With `isolate: false`, every test file loads in one worker. A pool per file
 * meant several Postgres backends at once; one file's `TRUNCATE` then deadlocked
 * against another's `INSERT`. A single `max: 1` pool queues those operations on
 * one backend instead. `close()` is refcounted so the first file's `afterAll`
 * does not end the pool under files that still have to run.
 */
let shared: TestDatabase | undefined;
let sharedRefs = 0;

export function connectTestDatabase(): TestDatabase {
  sharedRefs += 1;
  if (shared !== undefined) {
    return shared;
  }

  const pool = createPool(resolveTestDatabaseUrl(), { max: 1 });
  const db = createDatabase(pool);

  shared = {
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
      sharedRefs -= 1;
      if (sharedRefs > 0 || shared === undefined) {
        return;
      }
      const ending = shared;
      shared = undefined;
      sharedRefs = 0;
      await ending.pool.end();
    },
  };
  return shared;
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
  "closure_seals",
  "audit_events",
  "finding_events",
  "anomaly_findings",
  "gate_certifications",
  "distributions",
  "payment_attempts",
  "release_batches",
  "withdrawals",
  "line_payments",
  "pcb_entries",
  "pay_line_overrides",
  "pay_line_items",
  "pay_lines",
  "pay_runs",
  "employment_pay_items",
  "employment_pcb_ytd",
  "employment_prior_ytd",
  "employment_tax_profiles",
  "employment_profiles",
  "employee_custom_field_defs",
  "transfers",
  "artifacts",
  "employments",
  "persons",
  "user_role_assignments",
  "role_permissions",
  "roles",
  "users",
  "companies",
  "pay_item_treatments",
  "pay_item_pcb_classes",
  "pay_items",
  "epf_bands",
  "socso_bands",
  "eis_bands",
  "employment_law_rules",
  "rule_settings",
  "rule_sources",
  "rule_packs",
  "seed_files",
] as const;
