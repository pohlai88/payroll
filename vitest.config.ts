import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
};

/**
 * @feature shell
 * @layer spine
 *
 * Three projects, because they have different prerequisites.
 *
 * `domain` is the pure engine and its golden master: no database, no setup, and
 * it must stay runnable on its own — `vitest --project domain` is the fast loop
 * and the proof that the engine has no infrastructure dependency.
 *
 * `web` renders React components (jsdom) — payslip document token and render
 * assertions. No database, no server; component tree must render without errors.
 *
 * `marketing` holds the landing page's content gates: reconciliation to the sen,
 * provenance of every cited figure, and the rule that nothing may be advertised
 * unless it exists in `src/`.
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
          exclude: ["tests/domain/payslip-tokens.test.ts"],
          /**
           * Pure modules with no shared mutable process state. Isolating each
           * file into a fresh fork re-paid Vite transform/import on every file
           * and dominated wall time (cold ~19s → warm ~3s with cache; most of
           * that was worker startup, not assertions).
           */
          isolate: false,
          // Must match the `db` project's worker count: Vitest 4 refuses to run
          // two projects with different `maxWorkers` under the same (default)
          // `sequence.groupOrder`.
          maxWorkers: 1,
        },
      },
      {
        resolve: { alias },
        plugins: [react()],
        test: {
          name: "web",
          environment: "jsdom",
          globals: true,
          include: ["tests/domain/payslip-tokens.test.tsx"],
          isolate: false,
          maxWorkers: 1,
        },
      },
      {
        resolve: { alias },
        plugins: [react()],
        test: {
          /**
           * The marketing surface. jsdom because two of the three files render
           * the page; the third reads `src/` from disk to assert that nothing is
           * advertised which the app does not implement.
           */
          name: "marketing",
          environment: "jsdom",
          globals: true,
          include: [
            "tests/marketing/**/*.test.ts",
            "tests/marketing/**/*.test.tsx",
          ],
          isolate: false,
          maxWorkers: 1,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          environment: "node",
          globals: true,
          include: ["tests/db/**/*.test.ts", "tests/findings/**/*.test.ts"],
          globalSetup: ["tests/db/harness/global-setup.ts"],
          /**
           * One worker, one file at a time.
           *
           * Every db file truncates shared tables. Parallel files deadlock on
           * TRUNCATE vs INSERT; Vitest 4 also dropped `poolOptions`, so
           * serialization is expressed with `maxWorkers` / `fileParallelism`
           * only. `isolate` is deliberately left at its default (`true`):
           * batching files into one un-isolated worker was tried and made
           * things worse, not better — each file's `connectTestDatabase()`
           * pool and its `beforeAll`/`afterAll` lifecycle stopped being
           * reliably sequenced relative to the next file's, so one file's rows
           * were still present (or its pool still open) when the next file's
           * `beforeEach` truncated and re-seeded, producing exactly the
           * duplicate-key and deadlock races this config exists to prevent.
           * A real process boundary per file is what actually serializes them.
           */
          fileParallelism: false,
          maxWorkers: 1,
          sequence: { concurrent: false },
        },
      },
    ],
  },
});
