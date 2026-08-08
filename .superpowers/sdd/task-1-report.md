# Task 1 Report: `scripts/reset.ts` (local-only destructive rebuild)

## Status

DONE_WITH_CONCERNS

## What was implemented

### `scripts/reset.ts`

- **`assertResetAllowed(connectionString)`** — refuses non-local hosts unless `ALLOW_DESTRUCTIVE_RESET=1`, mirroring the test harness guard pattern (`LOCAL_HOSTS`, override flag, helpful error message naming `LOCAL_DEV_DATABASE_URL`).
- **`resetDatabase(connectionString)`** — drops schemas, re-runs Drizzle migrations, seeds via exported `seed()`, returns the rule-pack id.
- **CLI entry** — guarded by `process.argv[1]?.endsWith("reset.ts")`; uses `requireDatabaseUrl()`, prints redacted URL and seeded pack id.
- **`npm run db:reset`** — already wired in `package.json`; smoke-tested successfully.

### `tests/db/reset-script.test.ts`

Two tests per the brief:

1. Full rebuild against Docker Postgres: asserts non-empty pack id, `APPROVED` status, and `seed_files` row count > 0.
2. Guard test: Neon-style URL rejected with `/refusing to reset/` when override flag is unset.

## TDD evidence

### RED (Step 2)

```
Error: Cannot find module '../../scripts/reset' imported from .../tests/db/reset-script.test.ts
```

Module missing — expected failure before implementation.

### RED (post-implementation, pre-fix)

After adding verbatim brief code, first integration test failed:

```
relation "rule_packs" does not exist
```

Root cause: Drizzle 0.45 stores its migration journal in the **`drizzle`** schema (`drizzle.__drizzle_migrations`), not `public`. Dropping only `public` left the journal intact, so `migrate()` believed all migrations were already applied and skipped DDL — then `seed()` failed on missing tables.

Debug confirmed: after `DROP SCHEMA public CASCADE`, `pg_tables` in `public` was empty while `drizzle.__drizzle_migrations` still held rows.

### Fix applied (deviation from brief)

Added one line to `resetDatabase`:

```sql
DROP SCHEMA IF EXISTS drizzle CASCADE
```

(between the `public` drop and `CREATE SCHEMA public`).

### GREEN (Step 4)

```
Test Files  1 passed (1)
     Tests  2 passed (2)
```

### CLI smoke (Step 5)

```
reset complete on postgres://payroll:***@localhost:54329/payroll; seeded rule pack MY-STATUTORY-2026-06
```

## Files changed

| File | Action |
|------|--------|
| `scripts/reset.ts` | Created |
| `tests/db/reset-script.test.ts` | Created |

No other files modified in the commit.

## Commit

```
13046db feat: add local-only db:reset that migrates and reseeds
```

## Self-review

**Strengths**

- Matches existing script patterns (`migrate.ts` redact helper, `seed.ts` export, harness local-host guard).
- Exports `resetDatabase` and `assertResetAllowed` for testability.
- Password redaction on CLI output.
- Pool uses `{ max: 1 }` for sequential drop → migrate → seed on one backend.
- Override flag name (`ALLOW_DESTRUCTIVE_RESET`) is distinct from test harness (`ALLOW_DESTRUCTIVE_TEST_DB`) — avoids accidental cross-override.

**The drizzle-schema fix**

Required for correctness; the brief's verbatim SQL is insufficient with Drizzle 0.45's default migration schema. Without dropping `drizzle`, reset is a no-op on DDL while still appearing to succeed through migrate.

**Test interaction**

The reset test DROP SCHEMA's the shared Docker DB mid-session. The brief notes this is acceptable — later db test files truncate/reseed as needed. Running this file in isolation first when debugging is the recommended workflow.

**No issues found in**

- Lint (clean on both files).
- Guard test (passes without touching real Neon).
- Idempotency of `seed()` after fresh migrate.

## Concerns

1. **Brief drift** — Task brief SQL should include `DROP SCHEMA IF EXISTS drizzle CASCADE` (or document that Drizzle's journal lives outside `public`). Recommend updating the plan/brief so future tasks don't reintroduce the bug.
2. **Concurrent test sessions** — `resetDatabase` does not acquire the advisory lock used by `global-setup`. If another vitest session holds the lock while this test runs, behaviour is undefined (unlikely in CI; possible locally with two terminals).
3. **Open pool during reset test** — `connectTestDatabase()` opens the shared pool before `resetDatabase` runs. DROP SCHEMA succeeds but the harness pool may hold stale catalog state until queries retry. Current test passes because assertions run after reset completes on the same pool; worth watching if flaky catalog errors appear.

## Recommendation

Update `.superpowers/sdd/task-1-brief.md` (or the parent plan) to include the `drizzle` schema drop so the documented implementation matches Drizzle 0.45 behaviour.

---

## Review fix (Task 1 re-review)

**Findings addressed**

1. **Important** — `assertResetAllowed` error text now says it drops schemas `public` and `drizzle` (was `public` only).
2. **Minor** — `resetDatabase` JSDoc updated to mention both schemas.
3. **Minor** — `tests/db/reset-script.test.ts` header comment updated to mention `drizzle` drop.

Harness pool architecture unchanged (reviewer marked optional).

**Tests (2026-08-08)**

```
DATABASE_URL=postgres://payroll:payroll@localhost:54329/payroll
npx vitest run --project db tests/db/reset-script.test.ts

Test Files  1 passed (1)
     Tests  2 passed (2)
   Duration  4.10s
```

**Commit:** `fix: align reset script docs with public+drizzle drop` (review-fix commit on `phase2-persistence`)
