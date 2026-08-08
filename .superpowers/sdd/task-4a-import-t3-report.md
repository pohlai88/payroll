# Task 3 Report: Pure row mapping/validation — `domain/import/employee-row.ts`

**Branch:** phase2-persistence  
**Date:** 2026-08-08  
**Outcome:** DONE

## Status

DONE — TDD complete, 8/8 domain tests pass, committed.

## What was implemented

Per `task-4a-import-t3-brief.md`:

1. **`tests/domain/employee-row.test.ts`** — 8 tests covering valid row parse, multi-field required validation, invalid pay basis, unparseable base rate, unrecognized column, custom field mapping, required custom field blank, and `FIXED_HEADERS` uniqueness.
2. **`src/domain/import/employee-row.ts`** — Pure module exporting `FIXED_HEADERS`, `ParsedEmployeeRow`, `CustomFieldDef`, `RowError`, and `parseEmployeeRow`. Base Rate RM flows through `parseRM` → `baseRateSen`; no monetary fields on profile.

## TDD evidence

| Step | Command | Result |
|------|---------|--------|
| Red | `npx vitest run --project domain tests/domain/employee-row.test.ts` | FAIL — `Cannot find package '@/domain/import/employee-row'` |
| Green | Same after implementation | PASS — 8 tests |

## Commit

```
b9b07e2 feat: add pure employee-row parsing/validation
```

Files: `src/domain/import/employee-row.ts` (333 lines), `tests/domain/employee-row.test.ts` (137 lines).

## Self-review

**Strengths**

- Matches brief verbatim except biome auto-fix: inverted `Pay Basis` if/else (`noNegationElse`) and formatter pass — behavior unchanged.
- `parseEmployeeRow` never throws; collects all errors in one pass (required fields, pay basis, dates, base rate, booleans, custom fields, unrecognized columns).
- Money boundary respected: only `baseRateSen` via `parseRM`; profile/`extraAttributes` hold no RM amounts.
- `FIXED_HEADERS` (40 columns) is the single source of truth for template column order and validation flags — ready for Task 4 repo and Task 5 service consumption.

**No issues in**

- Type exports align with planned `createEmployeeFromImport` field access in Task 4.
- Custom field parsing keyed by `fieldKey` in `extraAttributes`, matched by column `label`.
- Boolean defaults match brief (`Is Malaysian` etc. default true when blank; `Is Permanent Resident` defaults false).

## Concerns

1. **Biome complexity warning** — `parseEmployeeRow` scores 35 vs max 20 (`noExcessiveCognitiveComplexity`). Warning only (lint exit 0 on file); acceptable for a validation aggregator; refactor deferred unless lint policy tightens.
2. **Co-authored-by trailer** — Commit hook added `Co-authored-by: Cursor`; not in brief but harmless.
3. **Repo-wide lint** — `npm run lint` still fails on unrelated pre-existing files under `src/server/`; not introduced by this task.

## Recommendation

Task 3 acceptance criteria met. Proceed to Task 4 (`repo/employee-profile.ts`) which consumes `ParsedEmployeeRow`.

## Follow-up: noUncheckedIndexedAccess fix (2026-08-08)

**Issue:** `booleans[header]` indexed access under `noUncheckedIndexedAccess` yielded `boolean | undefined` at lines 295–300 when building the success `row`.

**Fix:** After the error early-return, read six boolean fields into local consts with explicit `??` defaults matching `BOOLEAN_FIELDS` fallbacks (`true` for Malaysian/EPF/SOCSO/EIS/PCB; `false` for Permanent Resident).

**Verification:**

| Step | Command | Result |
|------|---------|--------|
| Typecheck | `npx tsc --noEmit` | PASS — `employee-row.ts` clean |
| Tests | `npx vitest run --project domain tests/domain/employee-row.test.ts` | PASS — 8/8 |

**Commit:** `fix: narrow boolean fields in parseEmployeeRow for noUncheckedIndexedAccess`

## Follow-up: I-1 negative Base Rate RM (2026-08-08)

**Issue (final branch review I-1):** `parseRM` could return a negative sen value; parse did not reject it before building `ParsedEmployeeRow`.

**Fix:** After `parseRM` for Base Rate RM, if `baseRateSen !== null && baseRateSen < 0`, push `{ field: "Base Rate RM", reason: "base rate must be non-negative" }`.

**Verification:**

| Step | Command | Result |
|------|---------|--------|
| Tests | `npx vitest run --project domain tests/domain/employee-row.test.ts` | PASS — 9/9 |
| Typecheck | `npx tsc --noEmit` | PASS |

**Commit:** `fix: reject negative Base Rate RM at employee-row parse`
