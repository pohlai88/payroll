/**
 * @feature pay-run
 * @layer test
 *
 * Proves the primitive the test-harness concurrency guard depends on:
 * `pg_try_advisory_lock` genuinely refuses a second holder and genuinely
 * releases — including across idle periods when held on a dedicated Client.
 *
 * See `harness/database.ts` (`TEST_SESSION_LOCK_KEY`) and
 * `harness/global-setup.ts` for where this is used to fail a second
 * concurrent `vitest` run fast instead of letting it race the first one.
 */

import type { Client, Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { createPool } from "@/db/client";
import {
  openLockClient,
  releaseExclusiveLock,
  resolveTestDatabaseUrl,
  tryAcquireExclusiveLock,
} from "./harness/database";

// Distinct from TEST_SESSION_LOCK_KEY: global-setup already holds that key
// for the entire run, so reusing it here would make every case here fail for
// the wrong reason.
const LOCK_KEY = 999_999_001;

describe("advisory lock primitive", () => {
  const pools: Pool[] = [];
  const clients: Client[] = [];

  function pool(options: { idleTimeoutMillis?: number } = {}): Pool {
    const p = createPool(resolveTestDatabaseUrl(), {
      max: 1,
      ...options,
    });
    pools.push(p);
    return p;
  }

  async function client(): Promise<Client> {
    const c = await openLockClient();
    clients.push(c);
    return c;
  }

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((p) => p.end()));
    await Promise.all(
      clients.splice(0).map(async (c) => {
        try {
          await releaseExclusiveLock(c, LOCK_KEY);
        } catch {
          // already unlocked or closed
        }
        await c.end().catch(() => undefined);
      })
    );
  });

  it("refuses a second acquire while the first holder still has it", async () => {
    const holder = pool();
    const challenger = pool();

    await expect(tryAcquireExclusiveLock(holder, LOCK_KEY)).resolves.toBe(true);
    await expect(tryAcquireExclusiveLock(challenger, LOCK_KEY)).resolves.toBe(
      false
    );

    await releaseExclusiveLock(holder, LOCK_KEY);
  });

  it("allows a new acquire once the holder releases", async () => {
    const holder = pool();
    const challenger = pool();

    await tryAcquireExclusiveLock(holder, LOCK_KEY);
    await releaseExclusiveLock(holder, LOCK_KEY);

    await expect(tryAcquireExclusiveLock(challenger, LOCK_KEY)).resolves.toBe(
      true
    );
    await releaseExclusiveLock(challenger, LOCK_KEY);
  });

  it("a Pool with a short idle timeout silently drops a session lock", async () => {
    // Documents the footgun global-setup must avoid: node-pg closes idle
    // pooled backends, which releases session advisory locks.
    const holder = pool({ idleTimeoutMillis: 200 });
    const challenger = pool();

    await expect(tryAcquireExclusiveLock(holder, LOCK_KEY)).resolves.toBe(true);
    await new Promise((r) => setTimeout(r, 500));

    await expect(tryAcquireExclusiveLock(challenger, LOCK_KEY)).resolves.toBe(
      true
    );
    await releaseExclusiveLock(challenger, LOCK_KEY);
  });

  it("a dedicated Client keeps the lock across idle periods", async () => {
    const holder = await client();
    const challenger = pool();

    await expect(tryAcquireExclusiveLock(holder, LOCK_KEY)).resolves.toBe(true);
    await new Promise((r) => setTimeout(r, 500));

    await expect(tryAcquireExclusiveLock(challenger, LOCK_KEY)).resolves.toBe(
      false
    );

    await releaseExclusiveLock(holder, LOCK_KEY);
  });
});
