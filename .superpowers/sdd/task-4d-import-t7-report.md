# Task 7 Report: Import CLI script

**Branch:** phase2-persistence  
**Date:** 2026-08-08  
**Outcome:** DONE

## Status

DONE — import CLI script, `csv-parse` dependency, npm script, e2e verified, committed.

## What was implemented

Per `task-4d-import-t7-brief.md`:

**`scripts/employee-import.ts`** — CLI that:

| Feature | Detail |
|---------|--------|
| Input | CSV (via `csv-parse/sync`) or JSON array of row objects |
| Service | Calls `importEmployeeRows` from `src/service/employee-import.ts` |
| Output | Summary line + per-row failure details; exit code 1 if any failed |
| Semantics | Create-only (existing employee+company pairs skipped) |

**`package.json`** — added `csv-parse` dependency and `"employee:import": "tsx scripts/employee-import.ts"`.

## Deviations from brief

1. **Biome lint fixes** — Used `Record<...>[]` instead of `Array<Record<...>>` and `const [, , filePath] = process.argv` destructuring (same behaviour).
2. **E2E CSV column count** — Brief sample row has 41 fields vs 42 headers (missing trailing `Uniform Size` empty field). Verified with template-generated header + corrected data row.

## Verification

| Step | Command | Result |
|------|---------|--------|
| E2E first run | `npm run employee:import -- one-row.csv` | `created 1, skipped-existing 0, failed 0` |
| E2E idempotent | Same command again | `created 0, skipped-existing 1, failed 0` |
| Unit/integration | `npx vitest run --project db tests/db/employee-import.test.ts` | **5 passed** |

Prerequisite: `TESTCO` company inserted via `psql ON CONFLICT DO NOTHING`; DB seeded with `npm run db:seed`.

## Commit

```
feat: add employee import CLI (CSV/JSON, create-only)
```

Files: `scripts/employee-import.ts`, `package.json`, `package-lock.json`.

## Concerns

1. **Brief sample CSV typo** — Same 41-vs-42 column issue noted in Task 6; operators should use `npm run employee:template` for valid headers.
2. **No dedicated CLI test** — E2E exercised manually; service layer covered by existing 5 Vitest tests.
3. **Strict CSV parsing** — `csv-parse` rejects ragged rows (by design); malformed files fail fast rather than partial import.

## Recommendation

Task 7 acceptance criteria met. Proceed to Task 8 if defined in plan.

---

## 2026-08-08 Update: Header Validation Fix

**Status:** DONE  
**Commit:** `fix: fail whole import on unrecognized headers unless --auto-register` (8c10f7d)

### What was fixed

Enforced global constraint: unrecognized headers must abort entire import unless `--auto-register` flag is passed.

**Before:** `parseEmployeeRow` rejected unrecognized columns per-row → partial batch could still be created (constraint violation).

**Now:**
1. `validateImportHeaders` preflight in `src/service/employee-import.ts` checks all headers before processing any rows
2. Known headers = `FIXED_HEADERS` + active custom field labels from DB
3. Unrecognized headers → abort with clear error message, exit code 1, zero rows created
4. With `--auto-register`:
   - Slugify each unrecognized header → `fieldKey`
   - Append TEXT custom field def to `db/seed/employee-custom-fields.json`
   - Insert into `employee_custom_field_defs` table
   - Proceed with import using updated defs
5. CLI updated: `tsx scripts/employee-import.ts [--auto-register] <file>`

### Tests added

`tests/db/employee-import.test.ts` now covers:
- Import with unrecognized column + no flag → fails, creates 0 employments and 0 persons
- Import with unrecognized column + `autoRegister: true` → succeeds, creates custom field as TEXT type

### Verification

```
npm test -- tests/db/employee-import.test.ts
```
Result: **7 passed** (5 original + 2 new)

### Concerns

None. Auto-registered fields always use `dataType: "TEXT"` as specified (no monetary types).

### Files changed

- `scripts/employee-import.ts` — CLI arg parsing for `--auto-register`
- `src/service/employee-import.ts` — `validateImportHeaders`, `autoRegisterUnrecognizedHeaders`, updated `importEmployeeRows` signature
- `src/repo/employee-profile.ts` — added `insertCustomFieldDef`
- `tests/db/employee-import.test.ts` — 2 new test cases

---

## 2026-08-08 Update: Isolate auto-register seed writes

**Status:** DONE  
**Commit:** `fix: isolate auto-register seed writes from repo seed file`

### What was fixed

Auto-register tests were appending duplicate `bonus_amount` entries to the real `db/seed/employee-custom-fields.json`. Restored seed to Task 2 baseline (`uniform_size` only) and injected `customFieldsSeedPath` into import options (defaults to repo path for CLI/prod).

### Changes

1. Restored `db/seed/employee-custom-fields.json` — single `uniform_size` field only
2. `ImportOptions.customFieldsSeedPath` + `DEFAULT_CUSTOM_FIELDS_SEED_PATH` in `src/service/employee-import.ts`
3. Auto-register test writes to `os.tmpdir()` temp file; asserts DB + temp seed content; cleans up in `finally`
4. `afterAll` asserts repo seed bytes unchanged vs snapshot at module load

### Verification

```
npx vitest run --project db tests/db/employee-import.test.ts
```
Result: **7 passed** — repo seed pristine after suite

### Concerns

None.
