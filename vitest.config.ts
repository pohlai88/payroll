import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
};

/**
 * Two projects, because they have different prerequisites.
 *
 * `domain` is the pure engine and its golden master: no database, no setup, and
 * it must stay runnable on its own — `vitest --project domain` is the fast loop
 * and the proof that the engine has no infrastructure dependency.
 *
 * `db` needs the Docker Postgres and migrates once per session. It fails loudly
 * when the database is absent rather than skipping, because a silently skipped
 * constraint test is indistinguishable from a passing one.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "domain",
          environment: "node",
          globals: true,
          include: ["tests/domain/**/*.test.ts", "tests/golden/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          environment: "node",
          globals: true,
          include: ["tests/db/**/*.test.ts"],
          globalSetup: ["tests/db/harness/global-setup.ts"],
          /**
           * Strictly one file at a time, in one worker.
           *
           * Every db test file truncates the tables it uses, so two running at
           * once delete each other's fixtures — and the failure surfaces as a
           * duplicate key or a missing row somewhere unrelated, which is the
           * worst kind of flake to chase. `fileParallelism` alone did not hold
           * inside a project, so the worker count is pinned as well.
           */
          fileParallelism: false,
          maxWorkers: 1,
          minWorkers: 1,
          sequence: { concurrent: false },
          poolOptions: { threads: { singleThread: true } },
        },
      },
    ],
  },
});
