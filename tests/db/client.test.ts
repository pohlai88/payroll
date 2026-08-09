/**
 * @feature pay-run
 * @layer test
 *
 * `createPool` must never leave the pool's `'error'` event unhandled.
 *
 * Node's `EventEmitter` throws when an `'error'` event fires with no
 * listener attached — that is how a dropped idle connection would otherwise
 * crash the whole process instead of just failing the query that needed it.
 * No real database connection is needed to prove the listener is attached;
 * emitting a synthetic error on the pool is enough.
 */

import { describe, expect, it, vi } from "vitest";
import { createPool } from "@/db/client";

describe("createPool", () => {
  it("attaches an 'error' listener, so an idle client error does not crash the process", () => {
    const pool = createPool("postgres://unused:unused@localhost:1/unused");
    expect(pool.listenerCount("error")).toBeGreaterThan(0);

    // Emitting directly, rather than actually dropping a connection, is what
    // keeps this a unit test: it proves the listener exists without needing
    // Postgres or the network to reproduce the failure mode.
    expect(() =>
      pool.emit("error", new Error("synthetic idle client error"))
    ).not.toThrow();
  });

  it("logs the error rather than swallowing it silently", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const pool = createPool("postgres://unused:unused@localhost:1/unused");
    const error = new Error("synthetic idle client error");

    pool.emit("error", error);

    expect(errorSpy).toHaveBeenCalledWith("pg pool: idle client error", error);
    errorSpy.mockRestore();
  });
});
