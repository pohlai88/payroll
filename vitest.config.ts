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
          // One connection pool per file against one server: parallel files
          // truncating shared tables would race each other.
          fileParallelism: false,
        },
      },
    ],
  },
});
