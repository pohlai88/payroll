# Phase 2 Persistence Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Phase 2 so the July 2026 golden run can be loaded from Postgres (Docker or Neon), computed by the untouched engine, and still match to the sen — with a safe `db:reset` loop, accurate architecture docs, and the employee CSV import finished via its sibling plan.

**Architecture:** One `pg` Pool (`drizzle-orm/node-postgres`) against both Docker and Neon’s pooled endpoint; connection string is the only environment difference. Schema + plpgsql triggers hold invariants; `src/repo/*` returns engine types; `src/service/payrun.ts` owns create/recompute transactions; `scripts/{migrate,seed,reset}.ts` own ops. Seed files are content-hashed into `seed_files`.

**Tech Stack:** TypeScript, Postgres 17, Drizzle ORM + drizzle-kit, Vitest, Docker Compose (`postgres:17-alpine` tmpfs), Neon pooled Postgres.

## Global Constraints

- **Money is `bigint` sen** — no `numeric`/`decimal`/float money columns; rounding stays only in `src/domain/money.ts`.
- **One driver** — `drizzle-orm/node-postgres` + `pg` only; no `@neondatabase/serverless`, no environment-conditional client branches.
- **Engine stays pure** — `src/domain/**` has zero DB imports; repositories assemble `StatutoryTables`, `RuleSettings`, `PayItemDef[]`, `EmployeeSnapshot`, `LineInputs`, `OverrideInput[]`, `PcbInput`.
- **Null is not zero** — `net_sen` / `deductions_total_sen` / `pcb_amount_sen` stay nullable when PCB is absent.
- **PCB is never calculated** — controlled external input with source/evidence only.
- **Approved/CLOSED runs are frozen** — immutability is a plpgsql trigger, not service discipline.
- **Approved rule packs are immutable** — content change requires a new pack version.
- **Destructive scripts refuse remote hosts** — same host allow-list pattern as `tests/db/harness/database.ts` (`localhost` / `127.0.0.1` / `::1` / `db`), override only via an explicit env flag.
- **Do not hand-write drizzle snapshots** — schema changes go Drizzle → `npm run db:generate` → review SQL.
- **Employee CSV import is not re-specified here** — finish Tasks 3–8 of `docs/superpowers/plans/2026-08-08-employee-master-import.md` (Tasks 1–2 already landed).

---

## File structure

### Already landed (do not recreate)

| Path | Responsibility |
|---|---|
| `docker-compose.yml` | Disposable `postgres:17-alpine` on port `54329`, tmpfs `PGDATA`, `fsync=off` |
| `drizzle.config.ts` | Schema glob `./src/db/schema/*.ts`, migrations out `./src/db/migrations` |
| `src/db/client.ts` | `LOCAL_DEV_DATABASE_URL`, `requireDatabaseUrl`, `createPool`, `createDatabase` |
| `src/db/schema/enums.ts` | Postgres enums mirroring domain unions (+ authority/RBAC/transfer/profile) |
| `src/db/schema/{rule-pack,catalog,parties,run,rbac,transfer,employee-profile}.ts` | Table modules |
| `src/db/migrations/0000_*.sql` … `0014_*.sql` | Generated + hand-written trigger/governance SQL |
| `src/db/migrations/0001_phase2_triggers.sql` | Five core triggers from the persistence design |
| `scripts/migrate.ts` | Applies `src/db/migrations` |
| `scripts/seed.ts` | Content-hashed seed (rule pack, bands, pay items, RBAC, custom fields, source-capture packs) |
| `src/repo/{pay-run,rule-pack,rule-pack-schema,rule-resolution,rbac}.ts` | Engine-typed reads |
| `src/service/{payrun,transfer,rbac}.ts` | Transactional write paths |
| `tests/db/harness/{global-setup,database}.ts` | Migrate-once + advisory lock + truncate helper |
| `tests/db/golden-parity.test.ts` | Design §7 gate: DB inputs deep-equal pure golden + sen totals |
| `tests/db/{constraints,enums,seed-integrity,…}.test.ts` | Trigger/constraint/seed coverage |

### This plan creates / modifies

| Path | Responsibility |
|---|---|
| `scripts/reset.ts` | Drop public schema → migrate → seed (local-only by default) |
| `tests/db/reset-script.test.ts` | Proves reset restores a seedable schema and re-seeds the rule pack |
| `docs/architecture/payroll-architecture.md` | Replace stale §2 counts and §5 “Current status” |
| `README.md` | Flip Phase 2 to `done` only after the gate in Task 5 |

---

## Already landed — verify before changing anything

These commands must be green (or failures must be fixed before closeout work). They are not optional.

```bash
docker compose up -d
# PowerShell:
$env:DATABASE_URL = "postgres://payroll:payroll@localhost:54329/payroll"
npm run db:migrate
npm run db:seed
npm run typecheck
npx vitest run --project domain
npx vitest run --project db
```

Expected:

- migrate: `migrations applied to postgres://payroll:***@localhost:54329/payroll`
- seed: `seeded rule pack MY-STATUTORY-2026-06` (or the current pack id in `db/seed/rule-pack-meta.json`)
- typecheck: exit 0
- domain project: all pass (includes golden master)
- db project: all pass (includes `golden-parity`, `constraints`, `seed-integrity`, `enums`)

If `npm run db:reset` is invoked before Task 1, expect `Cannot find module` / missing file — that is the gap this plan closes.

---

### Task 1: `scripts/reset.ts` (local-only destructive rebuild)

**Files:**
- Create: `scripts/reset.ts`
- Create: `tests/db/reset-script.test.ts`
- Modify: none (`package.json` already has `"db:reset": "tsx scripts/reset.ts"`)

**Interfaces:**
- Consumes: `createPool`, `createDatabase`, `requireDatabaseUrl`, `LOCAL_DEV_DATABASE_URL` from `src/db/client.ts`; `migrate` from `drizzle-orm/node-postgres/migrator`; `seed` from `scripts/seed.ts`.
- Produces: CLI that leaves `DATABASE_URL` with a freshly migrated + seeded schema; exported `resetDatabase(connectionString: string): Promise<string>` returning the seeded rule-pack id for tests.

- [ ] **Step 1: Write the failing test**

Create `tests/db/reset-script.test.ts`:

```ts
/**
 * `scripts/reset.ts` must rebuild schema + seed against a real Postgres.
 *
 * The production path is DROP SCHEMA public CASCADE, DROP SCHEMA drizzle
 * CASCADE (Drizzle 0.45 keeps `__drizzle_migrations` outside `public`), then
 * migrate → seed. This test exercises the exported helper against the Docker
 * database the harness already guards, and asserts the post-reset world has
 * the approved rule pack and at least one hashed seed file — the same
 * artefacts `db:seed` leaves.
 */

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { resetDatabase } from "../../scripts/reset";
import {
  connectTestDatabase,
  resolveTestDatabaseUrl,
} from "./harness/database";

const database = connectTestDatabase();

afterAll(async () => {
  await database.close();
});

describe("resetDatabase", () => {
  it("rebuilds schema and reseeds the statutory pack", async () => {
    const packId = await resetDatabase(resolveTestDatabaseUrl());
    expect(packId.length).toBeGreaterThan(0);

    const packs = await database.db.execute<{ id: string; status: string }>(
      sql`SELECT id, status FROM rule_packs WHERE id = ${packId}`
    );
    expect(packs.rows).toHaveLength(1);
    expect(packs.rows[0]?.status).toBe("APPROVED");

    const files = await database.db.execute<{ n: string }>(
      sql`SELECT count(*)::text AS n FROM seed_files`
    );
    expect(Number(files.rows[0]?.n)).toBeGreaterThan(0);
  });

  it("refuses a non-local connection string without the override flag", async () => {
    const previous = process.env.ALLOW_DESTRUCTIVE_RESET;
    delete process.env.ALLOW_DESTRUCTIVE_RESET;
    try {
      await expect(
        resetDatabase(
          "postgres://payroll:payroll@ep-example.neon.tech/neondb?sslmode=require"
        )
      ).rejects.toThrow(/refusing to reset/);
    } finally {
      if (previous === undefined) {
        delete process.env.ALLOW_DESTRUCTIVE_RESET;
      } else {
        process.env.ALLOW_DESTRUCTIVE_RESET = previous;
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
$env:DATABASE_URL = "postgres://payroll:payroll@localhost:54329/payroll"
npx vitest run --project db tests/db/reset-script.test.ts
```

Expected: FAIL with cannot find module `../../scripts/reset` (or equivalent).

- [ ] **Step 3: Write minimal implementation**

Create `scripts/reset.ts`:

```ts
/**
 * Drops and rebuilds the database named by DATABASE_URL, then seeds it.
 *
 * Intended for the disposable Docker database (`docker compose`). Neon and any
 * other remote host are refused unless ALLOW_DESTRUCTIVE_RESET=1 is set — the
 * same class of guard as the test harness, because a mistaken reset against a
 * managed branch would erase a real payroll.
 */

import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  createDatabase,
  createPool,
  LOCAL_DEV_DATABASE_URL,
  requireDatabaseUrl,
} from "../src/db/client";
import { seed } from "./seed";

const MIGRATIONS_FOLDER = "src/db/migrations";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db"]);
const OVERRIDE_FLAG = "ALLOW_DESTRUCTIVE_RESET";

export function assertResetAllowed(connectionString: string): void {
  if (process.env[OVERRIDE_FLAG] === "1") {
    return;
  }

  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch (cause) {
    throw new Error(
      `DATABASE_URL is not a valid URL: ${JSON.stringify(connectionString)}`,
      { cause }
    );
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `refusing to reset host ${host}: this drops schemas public and drizzle. ` +
        `Point DATABASE_URL at the local docker database (${LOCAL_DEV_DATABASE_URL}), ` +
        `or set ${OVERRIDE_FLAG}=1 if you genuinely mean this one.`
    );
  }
}

/** Never print a password, even to a developer's own terminal. */
function redact(url: string): string {
  return url.replace(/\/\/([^:]+):[^@]*@/, "//$1:***@");
}

/**
 * Drops `public`, re-runs migrations, seeds. Returns the seeded rule-pack id.
 */
export async function resetDatabase(connectionString: string): Promise<string> {
  assertResetAllowed(connectionString);

  const pool = createPool(connectionString, { max: 1 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    // Drizzle 0.45 stores `__drizzle_migrations` in schema `drizzle`, not
    // `public`. Without this drop, migrate() no-ops and seed fails on missing tables.
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO PUBLIC");

    const db = createDatabase(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const packId = await seed(db);
    return packId;
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const url = requireDatabaseUrl();
  const packId = await resetDatabase(url);
  process.stdout.write(
    `reset complete on ${redact(url)}; seeded rule pack ${packId}\n`
  );
}

if (process.argv[1]?.endsWith("reset.ts")) {
  await main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
$env:DATABASE_URL = "postgres://payroll:payroll@localhost:54329/payroll"
npx vitest run --project db tests/db/reset-script.test.ts
```

Expected: PASS (2 tests).

Note: this test DROP SCHEMA’s the shared Docker DB. `global-setup` migrates at session start; after this file runs, later db files still work because they truncate/reseed as needed — but run this file alone first when debugging.

- [ ] **Step 5: CLI smoke**

Run:

```bash
$env:DATABASE_URL = "postgres://payroll:payroll@localhost:54329/payroll"
npm run db:reset
```

Expected stdout containing: `reset complete on postgres://payroll:***@localhost:54329/payroll; seeded rule pack`

- [ ] **Step 6: Commit**

```bash
git add scripts/reset.ts tests/db/reset-script.test.ts
git commit -m "$(cat <<'EOF'
feat: add local-only db:reset that migrates and reseeds

EOF
)"
```

On Windows PowerShell without bash HEREDOC, use:

```powershell
git add scripts/reset.ts tests/db/reset-script.test.ts
git commit -m "feat: add local-only db:reset that migrates and reseeds"
```

---

### Task 2: Sync architecture doc to the landed Phase 2 surface

**Files:**
- Modify: `docs/architecture/payroll-architecture.md` (opening of §2, and §5 “Current status”)

**Interfaces:**
- Consumes: current migration list (`0000`–`0014`) and green `tests/db/**` suite from Task 1 baseline.
- Produces: architecture doc that no longer claims “2 migrations / constraints untested”.

- [ ] **Step 1: Replace the stale §2 opening paragraph**

In `docs/architecture/payroll-architecture.md`, replace:

```markdown
## 2. Schema

18 tables, 9 enums, 5 trigger functions across 8 triggers. Two migrations:
`0000_phase2_core.sql` (generated) and `0001_phase2_triggers.sql` (hand-written).
```

with:

```markdown
## 2. Schema

Phase 2 persistence plus later in-phase amendments (statutory authority,
RBAC, PCB tax/YTD profile, internal group transfer, employment profiles).
Migrations live in `src/db/migrations/` (`0000`–`0014` at time of writing):
generated Drizzle SQL plus hand-written trigger/governance files
(`0001_phase2_triggers.sql`, `0004_authority_governance.sql`, and others).
The five core calculation-lifecycle triggers from the persistence design
remain in `0001_phase2_triggers.sql`; authority/RBAC/transfer add their own.
```

- [ ] **Step 2: Replace the stale §5 status block**

Replace:

```markdown
**Current status:** domain green (468/468). `tests/db/constraints.test.ts` does not
typecheck — the L3 invariants are enforced by triggers but not yet asserted by
tests. Uncommitted for that reason.
```

with:

```markdown
**Current status:** Phase 2 persistence is on the `phase2-persistence` branch.
Gate commands: `npm run typecheck`, `npx vitest run --project domain`,
`npx vitest run --project db` (Docker Postgres required for `db`). The
`db` suite includes trigger provocations (`constraints.test.ts`), enum
parity, content-addressed seed integrity, and July 2026 golden parity
through the repository/service layers. Local rebuild: `npm run db:reset`.
```

- [ ] **Step 3: Commit**

```powershell
git add docs/architecture/payroll-architecture.md
git commit -m "docs: sync architecture Phase 2 status with landed migrations"
```

---

### Task 3: Docker + Neon operator smoke (no code change)

**Files:**
- None (ops verification only)

**Interfaces:**
- Consumes: `scripts/migrate.ts`, `scripts/seed.ts`, `docker-compose.yml`, env `DATABASE_URL` (never commit secrets).
- Produces: proof both environments accept the same migration/seed path.

- [ ] **Step 1: Docker path**

```powershell
docker compose up -d
$env:DATABASE_URL = "postgres://payroll:payroll@localhost:54329/payroll"
npm run db:reset
npx vitest run --project db tests/db/golden-parity.test.ts
```

Expected: reset completes; golden-parity PASS.

- [ ] **Step 2: Neon path (migrate + seed only — not reset)**

Use the project’s Neon *pooled* `DATABASE_URL` from the local env file the developer already uses (do not paste credentials into commits or chat logs).

```powershell
# After loading DATABASE_URL for the Neon pooler endpoint:
npm run db:migrate
npm run db:seed
```

Expected:

- migrate applies any pending journals (or no-ops if already current)
- seed prints the pack id; on a second run against an already-APPROVED pack with unchanged hashes, seed is idempotent (no throw)

Do **not** run `npm run db:reset` against Neon unless the human explicitly sets `ALLOW_DESTRUCTIVE_RESET=1` and confirms the branch is disposable.

- [ ] **Step 3: No commit** unless Step 1–2 forced a code fix. If a fix was required, commit that fix with a message that names the environment (`docker` or `neon`) and the failure.

---

### Task 4: Finish employee master CSV import (sibling plan)

**Files:**
- As specified in `docs/superpowers/plans/2026-08-08-employee-master-import.md` Tasks 3–8

**Interfaces:**
- Consumes: Task 1 schema (`employment_profiles`, `employee_custom_field_defs`) and Task 2 seed loader already on the branch.
- Produces: `src/domain/import/employee-row.ts`, `src/repo/employee-profile.ts`, `src/service/employee-import.ts`, `scripts/employee-template.ts`, `scripts/employee-import.ts`, and their tests.

- [ ] **Step 1: Open the sibling plan and resume at Task 3**

Read `docs/superpowers/plans/2026-08-08-employee-master-import.md` from “## Task 3” onward. Progress ledger: `.superpowers/sdd/progress.md` (Task 1 complete; Task 2 seed file + loader already present in `db/seed/employee-custom-fields.json` and `scripts/seed.ts` — confirm Task 2 checkboxes/tests before starting Task 3).

- [ ] **Step 2: Execute Tasks 3–8 exactly as written in that plan**

Use subagent-driven-development or executing-plans on **that** file. Do not reimplement Tasks 1–2.

- [ ] **Step 3: Confirm import CLIs**

```powershell
npx tsx scripts/employee-template.ts --help
# and a dry create-only import against Docker after seeding companies as the sibling plan describes
```

Expected: template writes; import creates persons/employments/profiles for new keys and skips existing `(employee_code, company_code)` pairs.

---

### Task 5: Phase 2 gate + README status

**Files:**
- Modify: `README.md` (Status table + “Phase 2 so far” paragraph)

**Interfaces:**
- Consumes: green full suite after Tasks 1–4.
- Produces: README Phase 2 row set to `done`.

- [ ] **Step 1: Full gate**

```powershell
docker compose up -d
$env:DATABASE_URL = "postgres://payroll:payroll@localhost:54329/payroll"
npm run typecheck
npm run check
npx vitest run --project domain
npx vitest run --project db
```

Expected: all exit 0.

- [ ] **Step 2: Update README status**

In `README.md`, change the Phase 2 table row from:

```markdown
| 2 · Neon Postgres schema, plpgsql triggers, seed, Docker | in progress |
```

to:

```markdown
| 2 · Neon Postgres schema, plpgsql triggers, seed, Docker | done |
```

Replace the paragraph:

```markdown
Phase 2 so far: schema, triggers, repository/service layers, RBAC, statutory
authority (instruments/representations/what-a-run-used), internal group
transfer, and employee master import (employment profiles + custom field
defs landed; CSV import flow still to come). See `.superpowers/sdd/progress.md`
for the active task ledger.
```

with:

```markdown
Phase 2 closed: Docker/Neon Postgres via one `pg` driver, Drizzle schema and
plpgsql triggers, content-hashed seed, repository/service layers, golden
parity, statutory authority governance, RBAC, internal group transfer, and
create-only employee master import. See
`docs/superpowers/specs/2026-08-08-phase2-persistence-design.md` and
`docs/superpowers/plans/2026-08-08-phase2-persistence.md`.
```

- [ ] **Step 3: Commit**

```powershell
git add README.md
git commit -m "docs: mark Phase 2 persistence complete"
```

---

## Self-review (plan author)

**1. Spec coverage (`phase2-persistence-design.md` §8):**

| Design step | Coverage |
|---|---|
| 1 Dependencies, compose, drizzle, client | Already landed — baseline verify |
| 2 Schema + generated migrations | Already landed — baseline verify |
| 3 Hand-written triggers | Already landed (`0001` + later governance) — baseline verify |
| 4 Vitest DB harness | Already landed — baseline verify |
| 5 `migrate` / `seed` / `reset` | migrate+seed landed; **Task 1 adds `reset`** |
| 6 Repository layer | Already landed — baseline verify |
| 7 Service layer | Already landed — baseline verify |
| 8 Golden-parity test | Already landed — Task 3 re-runs it after reset |

Amendments (authority, RBAC, transfer, profiles) already landed; CSV import → Task 4 sibling plan. Downstream control tables from payrun-workspace §9 remain out of Phase 2 per design.

**2. Placeholder scan:** No TBD/TODO steps; reset and doc edits include full code/text.

**3. Type consistency:** `resetDatabase(connectionString: string): Promise<string>` is what the test and CLI both use; `seed(db): Promise<string>` return type matches.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-08-phase2-persistence.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
