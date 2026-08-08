# Phase 2 — Persistence Layer (Postgres, Drizzle, pay-run slice)

**Date:** 2026-08-08 · **Status:** Approved · **Scope:** vertical slice to a computable run

Builds the database under the verified engine. The target of this phase is one
provable statement: **the July 2026 golden run can be loaded out of Postgres,
computed by the untouched engine, and still match to the sen.**

Downstream control tables from
[`payrun-workspace-design.md`](2026-08-08-payrun-workspace-design.md) §9 — findings,
gates, `line_payments`, `payment_attempts`, `release_batches`, `distributions`,
`artifacts`, `withdrawals`, `transfers`, `ytd_openings` — are deliberately **not**
in this phase. They arrive with their own triggers and services.

---

## 1. Architecture

```
src/domain/**          pure engine + derivation graph — untouched, zero DB imports stays zero
src/db/schema/*.ts     drizzle table definitions
src/db/migrations/     drizzle-kit SQL + hand-written trigger migrations
src/db/client.ts       one pg Pool (drizzle-orm/node-postgres + pg)
src/repo/*.ts          queries in, domain types out
src/service/payrun.ts  createRun / recomputeLine / recomputeRun (transactional)
scripts/{migrate,seed,reset}.ts
```

**One driver.** `drizzle-orm/node-postgres` + `pg` against both Docker and Neon's
pooled endpoint. No `@neondatabase/serverless`, no environment-conditional client
code. The connection string is the only thing that differs between environments.

**The repository boundary is the contract.** `src/repo/*` returns the engine's own
types — `StatutoryTables`, `RuleSettings`, `PayItemDef[]`, `EmployeeSnapshot`,
`LineInputs`, `OverrideInput[]`, `PcbInput`. Nothing else in the codebase assembles
engine input. This is what makes "the engine is pure" structural rather than
conventional, and it is what the parity test in §7 checks.

**Dev loop.** `docker compose` runs `postgres:17-alpine` with `PGDATA` on tmpfs and
`fsync=off` — a throwaway database that is nonetheless a real Postgres, so triggers
and constraints are genuinely exercised. Vitest `globalSetup` migrates once per
session; each test file truncates only the tables it touched.

**Seed data is content-addressed.** `seed.ts` hashes every `db/seed/*.json` file and
records the hash in `seed_files`. A test asserts the stored hashes against the files
on disk, so a silently edited band table fails loudly instead of quietly changing a
payroll.

---

## 2. Reconciliations against existing code

The handoff's item design was written against `payrun-workspace-design.md` §9. §9 is
the table-summary paragraph — it contains no item kind list and no line-item
structure. The authoritative sources are `db/seed/pay-item-matrix.json` and
`PayItemDef` / `LineItemInput` / `RateBasis` in `src/domain/calc/types.ts`, which
Phase 1 already landed. Reconciled as follows; the snapshot-at-compute and
fixed-kinds decisions are unchanged.

| Handoff | Becomes | Why |
|---|---|---|
| `payroll_item_kind` enum "lifted from §9" | `pay_item_kind`: **`EARNING \| DEDUCTION`** | The only two kinds `PayItemDef` defines and all 15 seed rows use. Closed enum; a third kind is a code change plus a migration. |
| `uom`: `FIXED\|UNIT\|HOUR\|DAY\|WEEK\|MONTH` | `rate_basis`: `FIXED_MONTHLY \| PER_DAY \| PER_HOUR \| PER_UNIT \| AMOUNT` | `RateBasis` already exists and is what the engine consumes. `WEEK`/`MONTH` have no engine support and no seed usage; adding them would mean touching `src/domain`. |
| `rate_factor numeric(12,6)` | dropped; catalog carries `default_rate_sen bigint` | The engine computes a quantity item as `qty × rateSen` and consumes no factor. A stored, snapshotted, never-read multiplier drifts out of truth. OT multipliers arrive later as a domain change and a migration in the same commit. |
| `statutory_flags jsonb {epf,socso,eis,pcb}` | typed columns `epf_wages`, `socso_wages`, `eis_wages`, plus `taxable` | The engine reads these as typed booleans; jsonb cannot be constrained or checked. `taxable` is retained as informational for the human PCB workflow and the payslip — PCB itself stays an external verified input. |
| `quantity IS NULL ⇔ uom = 'FIXED'` | `quantity IS NULL ⇔ basis_snap IN ('AMOUNT','FIXED_MONTHLY')` | `LineItemInput` has **two** non-quantity bases, not one. |
| `payroll_item`, `payrun_line` | `pay_items`, `pay_lines` | Consistent with §9's own `pay_runs`, `line_payments`, `ytd_openings` and with the `payItemCode` vocabulary throughout `src/domain`. |

The snapshot design is already half-enforced by the engine:
[`resolve-items.ts:39`](../../../src/domain/calc/resolve-items.ts) throws when a
line's stored basis disagrees with the catalog definition, precisely so an item
switched from per-day to fixed next month cannot retroactively reinterpret this
month's stored quantity.

---

## 3. Money and identity conventions

- **All money is `bigint` sen.** No `numeric`, no `decimal`, no floats anywhere in
  the schema. Rounding stays in `src/domain/money.ts` alone.
- **Quantities are `numeric(10,4)`** (days, hours, units) — not money, and fractional
  by nature.
- Surrogate keys are `uuid` (`gen_random_uuid()`), except `pay_runs.id`, which is the
  human run identifier (`DLBB-2026-07`, `DLBB-2026-07-OC1`) because it appears on
  artifacts and payslips.
- Every table carries `created_at timestamptz not null default now()`.

---

## 4. Schema

### 4.1 Enums

`pay_item_kind` · `rate_basis` · `pay_basis` · `epf_part` · `socso_category` ·
`run_status` · `run_type` · `offcycle_reason` · `override_field`

Each mirrors an existing TypeScript union in `src/domain/calc/types.ts` verbatim. A
test asserts enum membership equality in both directions, so a union that gains a
member without a migration fails.

### 4.2 Rule pack (seeded, immutable once referenced by a run)

- `rule_packs` — `id text pk` (`MY-STATUTORY-2026-06`), name, `effective_from`,
  `effective_to`, notes.
- `rule_sources` — `pk (rule_pack_id, ref)`; issuer, title, url, `retrieved_at`,
  `sha256`. The eight official documents.
- `rule_settings` — `rule_pack_id pk`, `settings jsonb`, parsed through a Zod schema
  mirroring `RuleSettings` at the repository boundary. jsonb rather than 18 columns
  because the shape is versioned with the pack and read whole.

  The settings object carries a **`statutoryLimits`** block alongside the
  contribution parameters:

  ```
  statutoryLimits: {
    otMaxHoursMonth, maxWeeklyHours, minWageSen,
    otMultiplierFloors: { workday, restDay, publicHoliday },
    eaEntitlementWageCeilingSen
  }
  ```

  **Data only in this phase** — no trigger reads it, no engine change, no findings
  logic. It is versioned pack data that the findings engine consumes in a later
  phase. Each figure gets a `rule_sources` row naming the instrument it comes from,
  and **every value must be verified against the current gazetted source before the
  seed JSON is written** — the OT Regulations 1980 monthly cap, EA 1955 s.60A weekly
  hours as amended, the current Minimum Wages Order, the s.60A(3)/s.60(3)/s.60D
  multipliers, and the EA First Schedule wage ceiling. Remembered values are not
  acceptable. Coverage comes free: the block is inside the content-hashed seed file
  and inside the Zod parse test.
- `epf_bands` — `(rule_pack_id, part, from_sen, to_sen, er_sen, ee_sen)`, part ∈ A/C/E.
- `socso_bands` — `(rule_pack_id, from_sen, to_sen, cat1_er_sen, cat1_ee_core_sen,
  cat1_ee_skbbk_sen, cat2_er_sen, cat2_ee_skbbk_sen)`.
- `eis_bands` — `(rule_pack_id, from_sen, to_sen, er_sen, ee_sen)`.
- `seed_files` — `file_name pk`, `sha256`, `byte_size`, `loaded_at`.

Band tables carry `check (to_sen >= from_sen)` and a unique index on
`(rule_pack_id, part?, from_sen)`. Contiguity and non-overlap are asserted by test
rather than by an exclusion constraint — the bands are seeded data, and a failing
test names the offending row far better than a constraint violation does.

### 4.3 Catalog

**`pay_items`** — `id uuid pk`, `code text unique`, `name_en`, `name_ms`,
`kind pay_item_kind`, `rate_basis rate_basis`, `default_rate_sen bigint null`,
`epf_wages bool`, `socso_wages bool`, `eis_wages bool`, `prorates bool`,
`taxable bool not null default true`, `is_system bool not null default false`,
`sort int`, `active bool not null default true`, `updated_at`, `updated_by`.

- `code` and `kind` are **immutable after creation** (trigger). Changing kind
  reclassifies history; the path is deactivate and create new.
- **No hard delete** (trigger). Soft delete via `active = false`.
- `is_system` rows (`BASIC`, `OT`) cannot be deactivated.

**`employment_pay_items`** — `pk (employment_id, pay_item_id)`, `rate_sen bigint null`,
`amount_sen bigint null`, `active bool`. The per-employee defaults that
`LineItemInput`'s "defaulted from the employee's pay item record, editable for this
run" refers to. A trigger enforces that quantity-basis items carry `rate_sen` and
non-quantity-basis items carry `amount_sen`, by looking up `pay_items.rate_basis`.

### 4.4 Parties

- `companies` — code, name, EPF/SOCSO/LHDN registration numbers, `hrdf_enabled`,
  `hrdf_levy_pct`.
- `persons` — name, `ic`, `passport`, `dob`, `nationality`, `group_service_date`.
  Partial unique index on `ic` where not null. Present now (not deferred) because
  `EmployeeSnapshot.dob` comes from the person, and retrofitting the split later is
  the migration §8.1 of the spec warns about.
- `employments` — `person_id`, `company_id`, `employee_code`, `join_date`,
  `termination_date`, `termination_reason`, `pay_basis`, `base_rate_sen`,
  `epf_applicable`, `socso_applicable`, `eis_applicable`, `pcb_applicable`,
  `is_malaysian`, `is_permanent_resident`, `epf_member_before_aug_1998 bool null`,
  `eis_prior_contribution bool null`, `epf_part_override`,
  `socso_category_override`, bank details, `epf_no`, `socso_no`, `tin`.
  `unique (company_id, employee_code)`; `check (termination_date is null or
  termination_date >= join_date)`.

### 4.5 Run

**`pay_runs`** — `id text pk`, `company_id`, `run_type`, `offcycle_reason null`,
`linked_run_id null`, `year`, `month`, `period_start`, `period_end`, `working_days`,
`rule_pack_id`, `status run_status not null default 'DRAFT'`, `calc_revision text null`,
`reviewed_at/by/revision`, `approved_at/by/revision`, `created_at/by`.

- Partial unique index `(company_id, year, month) where run_type = 'REGULAR'` — the
  spec's §1.4 rule that off-cycle runs coexist with the regular run.
- `check ((run_type = 'OFFCYCLE') = (offcycle_reason is not null))`.
- `check (period_end >= period_start)`, `check (working_days between 1 and 31)`.

**`pay_lines`** — `id uuid pk`, `run_id`, `employment_id`, `unique (run_id, employment_id)`,
`employee_snapshot jsonb` (a Zod-validated `EmployeeSnapshot` frozen at line
creation), the `LineInputs` scalars (`working_days`, `paid_days`, `hours_worked`,
`period_end`), every `LineResult` money field as `bigint` (`gross_sen` …
`net_sen`, nullable exactly where the type is nullable), `trace jsonb`,
`computed_at`.

- `check (paid_days is null or paid_days <= working_days)` — §3.3's domain-impossible
  class, rejected at the database.
- `net_sen` and `deductions_total_sen` are **nullable**: PCB absent means net is
  unknown, never zero.
- **`hours_worked` carries no upper-bound check, deliberately.** Statutory-limit
  breaches — overtime past the monthly cap, hours past the weekly maximum — are
  *recordable facts*, not impossible ones: they happen, and a payroll system that
  refuses to record them cannot report them. The findings engine flags them in a
  later phase by reading `statutoryLimits` off the rule pack. This gets a schema
  comment in the Drizzle module so a future reader does not "fix" it into a hard
  reject.

**`pay_line_items`** — `id uuid pk`, `line_id`, `pay_item_id` (nullable FK, for
provenance only), and the frozen snapshot: `item_code_snap`, `kind_snap`,
`basis_snap`, `name_en_snap`, `name_ms_snap`, `epf_wages_snap`, `socso_wages_snap`,
`eis_wages_snap`, `prorates_snap`, `sort_snap`, plus `quantity numeric(10,4) null`,
`rate_sen bigint null`, `amount_sen bigint null`, `resolved_amount_sen bigint`.

- `check ((quantity is null and rate_sen is null and amount_sen is not null) =
  (basis_snap in ('AMOUNT','FIXED_MONTHLY')))`.
- Reads are served entirely from the `_snap` columns. `pay_item_id` exists so
  "catalog changed since compute" and "line references inactive item" findings can
  be raised in a later phase; nothing computes from it.

**`pay_line_overrides`** — `pk (line_id, field)`, `override_sen bigint`,
`reason text not null`, `actor`, `approved_by`, `at`. Maps to `OverrideInput`.

**`pcb_entries`** — `line_id pk`, `pcb_amount_sen bigint null`, `cp38_sen default 0`,
`zakat_offset_sen default 0`, `verified bool default false`, `source`,
`evidence_ref`, `entered_by/at`, `verified_by/at`.
`check (not verified or (pcb_amount_sen is not null and source is not null))` — PCB
is never calculated, and it is never verified without a source.

**`audit_events`** — `id bigserial`, `at`, `actor`, `run_id null`, `entity`,
`entity_id`, `action`, `before jsonb`, `after jsonb`, `bulk_operation_id uuid null`.

---

## 5. Invariants enforced in the database

Declarative constraints as above, plus five plpgsql triggers:

1. **`enforce_run_immutability`** on `pay_lines`, `pay_line_items`,
   `pay_line_overrides`, `pcb_entries` — rejects INSERT/UPDATE/DELETE when the
   parent run's status is `APPROVED` or `CLOSED`. This is the guard rail the handoff
   asks for, and the gap §4.3 of the v1 handoff warned about when it existed only in
   the service layer.
2. **`enforce_run_status_transition`** on `pay_runs` — permits only
   `DRAFT → REVIEWED → APPROVED → CLOSED` plus the `REVIEWED → DRAFT` demotion the
   spec's §1.2 atomic edit requires. Every other transition raises.
3. **`enforce_pay_item_identity`** on `pay_items` — rejects any change to `code` or
   `kind`, rejects DELETE outright, and rejects deactivating an `is_system` row.
4. **`enforce_employment_item_compatibility`** on `employment_pay_items` — two checks,
   both needing a join, which is why this is a trigger and not a CHECK:
   - **Rate shape.** Looks up `pay_items.rate_basis`; requires `rate_sen` for
     quantity bases and `amount_sen` for `AMOUNT`/`FIXED_MONTHLY`.
   - **Pay-basis compatibility.** Joins `employments.pay_basis` and **rejects** an
     item whose `rate_basis` is `FIXED_MONTHLY` on a `DAILY` employment. Every other
     combination passes — `MONTHLY` employments carry any basis. An allowance that
     exists in both worlds gets two catalog rows (`ALW_MEAL` / `ALW_MEAL_D`), not a
     weakened trigger.
5. **`audit_events_append_only`** — rejects UPDATE and DELETE on `audit_events`.

Triggers live in hand-written migration files alongside the drizzle-kit generated
SQL, and each has a test that provokes it and asserts the raised message.

---

## 6. Service layer

`src/service/payrun.ts`, three functions, each one transaction:

- **`createRun`** — membership by employment-period overlap, per the spec's amended
  rule: `join_date ≤ period_end AND (termination_date IS NULL OR termination_date ≥
  period_start)`. Never the raw active flag. Snapshots each employment into
  `pay_lines.employee_snapshot` and materializes default line items from
  `employment_pay_items`.
- **`recomputeLine`** — load through the repo → `computeLineChecked` → persist result
  and trace → write the audit event. Validation failures return structured issues and
  persist nothing.
- **`recomputeRun`** — the same across every line of a run, in one transaction.

`calcRevision` computation is **not** in this phase; the column exists and stays null.
It belongs with the findings and gate engine that consume it.

---

## 7. Verification

- **Golden master stays a pure-engine test, untouched.** Any diff in engine inputs is
  stop-the-line.
- **`tests/db/golden-parity.test.ts`** — the phase's reason to exist. Seeds the rule
  pack, inserts one company and the 37 employments from
  `tests/golden/july-2026.json`, creates the run, loads everything back through
  `src/repo/*`, and asserts two things: the engine inputs are **deep-equal** to what
  the pure golden test constructs in memory, and the computed totals match the
  fixture to the sen (gross RM 176,930.00, net RM 155,609.55, EPF EE RM 19,210.00,
  SOCSO EE RM 1,822.05, EIS EE RM 288.40).
- **`tests/db/seed-integrity.test.ts`** — every `db/seed/*.json` hashes to the value
  stored in `seed_files`; band tables are contiguous and non-overlapping.
- **`tests/db/enums.test.ts`** — Postgres enum members equal the TypeScript unions,
  both directions.
- **`tests/db/constraints.test.ts`** — each constraint and each trigger provoked and
  asserted: `paid_days > working_days` rejected; a second REGULAR run for the same
  company-period rejected; an APPROVED run's line rejected on update; an illegal
  status transition rejected; `pay_items.code` change rejected; `audit_events` update
  rejected; the quantity/basis check rejected in both directions; a `FIXED_MONTHLY`
  item on a `DAILY` employment raises with the expected message, the same item on a
  `MONTHLY` employment succeeds, and a `PER_DAY` item on a `DAILY` employment
  succeeds.

### 7.1 What the golden fixture does and does not prove

Checked against `tests/golden/july-2026.json` before writing this:

- **No employment in the fixture is `DAILY`.** `payBasis` is absent from all 37
  rows, so every one is `MONTHLY` via the test helper's default. Amendment 1's
  fallback — add a daily catalog variant and reassign — **does not arise**. The
  pay-basis trigger is proved by `constraints.test.ts` alone, on rows built for it.
- **The fixture contains no overtime whatsoever.** Every employee passes
  `otHours: 0`, no employee carries an OT field, and no OT line item is constructed.
  So the OT-multiplier assumption cannot be confirmed from the fixture — there is
  nothing there to confirm, and parity is entirely unaffected by OT semantics.
  `golden-parity.test.ts` records this explicitly rather than documenting an
  assumption the fixture never exercises: **the only quantity item the golden run
  uses is `MEAL`, as `mealDays × mealRateSen` (`PER_DAY`), 27 of 37 employees.**
  When the OT-multiplier domain change lands, it supersedes nothing that this test
  covers, and the golden master cannot detect a regression in it.

---

## 8. Order of work

1. Dependencies, `docker-compose.yml`, `drizzle.config.ts`, `src/db/client.ts`
2. Schema modules + generated migrations
3. Hand-written trigger migrations
4. Vitest DB harness (globalSetup, truncation helper)
5. `scripts/{migrate,seed,reset}.ts` with content hashing
6. Repository layer
7. Service layer
8. Golden-parity equivalence test

The golden master runs at every step.
