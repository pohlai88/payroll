# Employee Master Import / Template — Design

**Date:** 2026-08-08 · **Status:** Draft (v2) · **Slice:** (unassigned)

## Frozen sentence

> **A single template/import pair bulk-creates brand-new persons, employments
> and HR profiles from the "Employee Master" spreadsheet — it never updates an
> existing row, so an on-screen edit can never be clobbered by a re-upload,
> and no monetary figure ever lands outside `money.ts`'s sen-integer path.**

## Source

`DLBB Group – Final Employee Master` (Google Sheet, tab `FINAL_MASTER`), ~220
rows, 82 columns spanning: identity/status, org (job title, dept, superior),
personal (DOB, gender, race, religion, marital status, IC/passport), contact,
address, pay basics (basic/daily/current/rate), fixed allowances (7+ named +
one "mix" description), banking, statutory numbers (EPF/SOCSO/TIN),
applicability flags (EPF/SOCSO/EIS/PCB), and a large block of migration
bookkeeping (review status, source coverage, ID collisions, name-spelling
conflicts, three different company-code columns).

## Key decisions (v2 changes from v1)

| Decision | Why |
|---|---|
| **Widened scope**: one template/import creates `persons` + `employments` + `employment_profiles` together, not profiles-only | Nothing is pre-seeded from this sheet; a profile-only import would have no employment to attach to |
| **Create-only, never update**: if `(employee_code, company_code)` already matches an existing employment, that row (and its profile) is left completely untouched | On-screen edits must never be superseded by a re-upload; this also means no upsert/conflict logic is needed at all |
| **No monetary fields in the profile, ever**: allowance amounts, rates, etc. are not captured by this slice in any form (not even "read-only reference") | Architectural fence (`tests/domain/money-module-boundary.test.ts`) — money is settled only via `money.ts`/sen-bigint columns; a loose profile column would be a second, unguarded money path |
| **One company-code column is authoritative**: `Payroll Company Code` is matched against `companies.code`; `Final Company Code` / `Master Primary Company Code` are captured as informational text only (see below) | The sheet has three company-code columns that sometimes disagree; the import needs one deterministic match key, not a reconciliation engine |
| **Custom fields ship as a seed file, not a CRUD tool**: `employee_custom_field_defs` rows come from `db/seed/employee-custom-fields.json`, loaded by `scripts/seed.ts` like rule packs/pay items already are | Matches the repo's existing config-as-seed-file convention instead of inventing a bespoke admin CRUD layer; "customizable" = edit the JSON, re-run seed |

## Scope

| In | Out |
|---|---|
| `employment_profiles` (1:1 `employments`) for HR/admin fields | Updating any existing `persons`/`employments`/`employment_profiles` row — ever, by this tool |
| `employee_custom_field_defs` table, populated from a seed JSON file | A CRUD UI/API for custom field defs (seed-file only, this slice) |
| Downloadable CSV/XLSX template covering identity + calc-relevant employment fields + HR profile fields + active custom fields | Reconciling the sheet's own REVIEW / PARTIAL PROFILE / ID COLLISION rows — those need human resolution before a row can import cleanly |
| Import script: create person (or match by IC) + employment + profile, for genuinely new `(employee_code, company_code)` pairs only | Any monetary/allowance figure, in any column, in any table this slice touches |
| Per-row validation report; a row with any error is skipped, not partially created | Auto-registering unknown headers by default (explicit `--auto-register` flag only) |

## Data model

### `employment_profiles` (new)

1:1 with `employments`, same pattern as `employment_tax_profiles`. No
monetary columns — see Key Decisions.

| Column | Notes |
|---|---|
| `employment_id` (PK, FK → employments, cascade) | |
| `job_title`, `department`, `superior_name` | text |
| `gender`, `race`, `religion`, `marital_status` | text — HR metadata, not a calc input, so kept as free text and validated at import time rather than promoted to a Postgres enum (which would widen the calc-relevant enum surface `parties.ts` deliberately keeps narrow) |
| `email`, `mobile_no`, `phone_no` | text |
| `address_line`, `city`, `state`, `postal_code`, `country` | text |
| `payment_method` | text (`Bank Transfer` / `Cash`) |
| `final_company_code`, `master_primary_company_code` | text — the two non-authoritative company codes from the sheet, kept verbatim for audit/reference; never used for matching |
| `payroll_notes` | text |
| `import_source_notes` | text — the sheet's own review/collision/coverage commentary for this row, frozen at import time; **not** re-synced on any later import (there is no later import for this row — create-only) |
| `extra_attributes` | `jsonb not null default '{}'` — catch-all for custom fields only, never money |
| `created_at` | timestamptz |

### `employee_custom_field_defs` (new)

| Column | Notes |
|---|---|
| `id` (PK) | uuid |
| `field_key` | text, unique — JSON key under `extra_attributes` |
| `label` | text — template column header |
| `data_type` | enum: `TEXT`, `NUMBER`, `DATE`, `BOOLEAN` — **never a monetary type**; enforced by code review, not a DB constraint, since Postgres can't express "not money" |
| `required` | boolean, default false |
| `sort_order` | integer |
| `active` | boolean, default true |
| `created_at` | timestamptz |

Sourced from `db/seed/employee-custom-fields.json`, hashed into `seed_files`
exactly like `pay-item-matrix.json` etc. — adding a field is a seed-file edit
plus re-running `scripts/seed.ts`, not a runtime admin action.

## Template generation

`scripts/employee-template.ts` (mirrors `scripts/seed.ts`'s read/hash
conventions) emits a CSV with, in order:

1. Identity/match columns: `Employee Code`, `Payroll Company Code`.
2. Calc-relevant employment columns needed to create a valid `employments`
   row: join date, pay basis, base rate (RM, converted to sen on import —
   this is the one place a monetary value is allowed, because it flows
   straight into `employments.base_rate_sen` through `money.ts`, not through
   the profile), Malaysian/PR flags, EPF/SOCSO/EIS/PCB applicability, EPF/
   SOCSO/TIN numbers, bank name/account.
3. `employment_profiles` columns, in declared order.
4. One column per active `employee_custom_field_defs` row, ordered by
   `sort_order`.

## Import flow

`scripts/employee-import.ts`:

1. Parse the uploaded CSV/XLSX.
2. Match each header to a known column, a custom-field label, or
   "unrecognized" — unrecognized headers fail the whole import unless
   `--auto-register` is passed (which instead appends the field to the seed
   JSON for a human to commit, and continues).
3. For each row, resolve `(employee_code, payroll_company_code)`:
   - **Already exists** → skip entirely, report as `SKIPPED_EXISTING`. No
     field on that row is touched, including ones that look "fixable."
   - **New** → validate required fields, calc-relevant field shapes (dates,
     enums, sen conversion via `money.ts`), and any custom-field
     `data_type`/`required` rule.
4. A row with any validation error is not created (whole row, not partial);
   reported with row number, employee code, field, reason.
5. On success: find-or-create `persons` (match by IC if present via the
   existing `persons_ic_unique` index; else always create new), create
   `employments`, create `employment_profiles`.
6. Emits a summary: created / skipped-existing / failed, with per-row detail
   for the latter two.

## Out of scope for this slice (explicitly deferred)

- Any update path for existing records — this tool only ever creates.
- Reconciling the sheet's own `REVIEW` / `PARTIAL PROFILE` / `EMPLOYEE ID
  COLLISION` rows — fix in the source sheet before import.
- Mapping fixed allowance columns to `pay_items`/pay lines — needs the S06
  pay-item taxonomy slice first, and is a money-settling change, not a
  profile-import change.
- A UI for managing `employee_custom_field_defs` — seed-file-driven for now.

## Testing

- `tests/db/constraints.test.ts`-style: FK cascade, unique `field_key`,
  `persons_ic_unique` respected by find-or-create.
- Import script, table-driven: unrecognized header, missing required custom
  field, malformed date/enum → row fails, nothing written.
- **Re-import idempotency**: importing the same file twice creates nothing
  on the second run (every row reports `SKIPPED_EXISTING`) — this is the
  test that actually proves the create-only guarantee.
- **No-clobber regression**: create a row via import, mutate one profile
  field directly in the DB (simulating an on-screen edit), re-import the
  same source row, assert the mutated field is unchanged.
- Money-boundary: assert `employment_profiles` and `employee_custom_field_defs`
  have no column/data_type that could hold a monetary value (grep-based test
  alongside the existing `money-module-boundary.test.ts` fence).
