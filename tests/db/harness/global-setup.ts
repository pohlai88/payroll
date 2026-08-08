/**
 * Runs once per test session: claims exclusive use of the test database, then
 * brings the schema up to date.
 *
 * Migrating here rather than per file means the plpgsql triggers are created
 * once and every test in the session runs against the same schema the
 * production migration set produces — not a schema built by a test helper that
 * could drift from it.
 *
 * The advisory lock exists because every `tests/db/**` file truncates and
 * reseeds the same hardcoded fixture rows (`RP-TEST`, fixed UUIDs, etc.). A
 * second, independent `vitest` invocation against the same Postgres — a
 * second terminal, a stray watch process, a concurrent agent — has no way to
 * know a run is already in progress: `maxWorkers`/`fileParallelism` only
 * serialize files *inside* one process. Without this guard, two processes
 * race each other's truncate/insert cycles and produce exactly the kind of
 * "the database rejected the operation, but not for the expected reason" or
 * missing-fixture failures that an uncontended run never reproduces — a real
 * incident, not a hypothetical. Failing fast here with a clear message beats
 * spending time debugging a "flaky" test that was never actually flaky.
 *
 * The lock is held on a dedicated `Client`, not a `Pool`. A pooled backend
 * with node-pg's default 10s idle timeout is closed while the suite is still
 * running, which silently drops the session lock and lets a second vitest
 * corrupt fixtures mid-run.
 */

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase, createPool } from "@/db/client";
import {
  openLockClient,
  releaseExclusiveLock,
  resolveTestDatabaseUrl,
  TEST_SESSION_LOCK_KEY,
  tryAcquireExclusiveLock,
} from "./database";

export default async function setup(): Promise<() => Promise<void>> {
  const url = resolveTestDatabaseUrl();
  const lockClient = await openLockClient(url);

  const acquired = await tryAcquireExclusiveLock(
    lockClient,
    TEST_SESSION_LOCK_KEY
  );
  if (!acquired) {
    await lockClient.end();
    throw new Error(
      "another `vitest` run already holds the test database (advisory lock " +
        `${TEST_SESSION_LOCK_KEY} is held). Wait for it to finish, or stop it, ` +
        "before starting a new one — running two test sessions against the " +
        "same Postgres at once corrupts each other's fixtures."
    );
  }

  const pool = createPool(url, { max: 1 });
  try {
    await migrate(createDatabase(pool), {
      migrationsFolder: "src/db/migrations",
    });
  } catch (cause) {
    await releaseExclusiveLock(lockClient, TEST_SESSION_LOCK_KEY);
    await lockClient.end();
    await pool.end();
    throw new Error(
      "could not migrate the test database. Is it running? `docker compose up -d`",
      { cause }
    );
  }

  // Migrate is done; the pool is no longer needed. Keep only the lock client
  // open for the rest of the session so an idleTimeout cannot drop the lock.
  await pool.end();

  let released = false;
  const release = async (): Promise<void> => {
    if (released) {
      return;
    }
    released = true;
    try {
      await releaseExclusiveLock(lockClient, TEST_SESSION_LOCK_KEY);
    } catch {
      // Backend may already be gone (crash, docker restart).
    }
    try {
      await lockClient.end();
    } catch {
      // already closed
    }
  };

  // Vitest teardown runs on a clean exit. Ctrl-C / SIGTERM otherwise leave
  // the session lock held until the backend drops the connection. Do NOT
  // hook `beforeExit`: the setup process idles between migrate and teardown
  // with only this Client open, and `beforeExit` would release the lock
  // mid-suite.
  const onSignal = (): void => {
    release()
      .catch(() => undefined)
      .finally(() => process.exit(1));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  return release;
}
