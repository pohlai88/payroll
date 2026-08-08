# MY-STAT-S02 — Money Arithmetic, Sen Precision, Rounding Doctrine, Effective Dating

**Scope:** freeze the monetary and dating foundation every statutory calculation
depends on. No EPF, SOCSO, EIS, PCB, CP38, HRD, overtime or proration *rule*
was changed — only the arithmetic primitives and the discipline that keeps them
canonical.

## Status

**Closed.** The money module and effective-dating resolution already existed;
this slice documents the doctrine, routes remaining call sites through it, and
adds architectural tests so the foundation cannot silently regress.

**Scope decision (locked):** S02 is a governance + enforcement pass. Wiring
`resolveRule()` into [`src/service/payrun.ts`](../src/service/payrun.ts) remains
an S01 deferred item and is **not** implemented here (see S01 governance note:
deferred hardening must not land as a side effect of an unrelated slice).

Delivered:

- Canonical primitives in [`src/domain/money.ts`](../src/domain/money.ts)
  (pre-existing, hardened): `roundHalfUpSen`, `mulDivSen`,
  `pctRoundUpToRinggitSen`, `pctHalfUpSen`, `quantityAmountSen`, `formatRM`,
  `parseRM`.
- Remaining bypasses closed: HRDF levy in `compose.ts` now uses
  `pctHalfUpSen`; quantity × rate in `payrun.ts` now uses `quantityAmountSen`
  (was bare `Math.round`).
- [`tests/domain/money-module-boundary.test.ts`](../tests/domain/money-module-boundary.test.ts)
  — architectural test that no `src/` module outside `money.ts` settles money
  with raw `Math.round` / `toFixed` on sen-bearing expressions.
- [`tests/domain/s02-monetary-correctness.test.ts`](../tests/domain/s02-monetary-correctness.test.ts)
  — float-drift, one-sen boundary, and negative-control proofs.
- [`tests/db/s02-effective-dating.test.ts`](../tests/db/s02-effective-dating.test.ts)
  — historical dates resolve historical packs; never `"latest"` / today.
- This report.

Existing July 2026 golden parity remains the behavioural baseline; no fixture
amounts were retargeted.

## Rounding doctrine

All stored and returned amounts are **integer sen** (1/100 ringgit). Floats
appear only transiently inside explicit helpers in `money.ts`, then are settled
to a safe integer before leaving the module.

| Helper | Rule | Used for |
|---|---|---|
| `roundHalfUpSen` | Half **away from zero** (2.5 → 3, −2.5 → −3); normalises −0 | Final settlement of a fractional sen |
| `mulDivSen` | `amount × num ÷ den`, BigInt-exact when both ints; half away from zero | EA s.18A monthly proration |
| `quantityAmountSen` | `qty × rateSen`, half away from zero | Hours/days/units × rate |
| `pctHalfUpSen` | `%` of sen amount, half away from zero, result stays in sen | HRDF levy and similar |
| `pctRoundUpToRinggitSen` | `%` then **ceil to next whole ringgit** (KWSP above-ceiling / Part F) | EPF percentage contributions |
| `parseRM` / `formatRM` | String ↔ sen; max 2 decimals; no `Number()` float path | User/display boundary |

There is **no** universal “round everything to 2dp” rule. Each calculation names
its helper. Intermediate values must not be rounded before the defined stage;
already-rounded values must not be rounded again.

## Sen precision

- Contract: every sen value in/out of `money.ts` is a finite safe integer;
  `NaN` / `Infinity` / fractional sen throw `RangeError`.
- RM has no sub-sen legal tender; `parseRM` rejects a third decimal rather than
  silently truncating (user-input boundary).
- Band tables (`epf_bands`, `socso_bands`, `eis_bands`) store `bigint` sen;
  lookups return exact integers with no further rounding.

## Effective dating

Rule packs carry `effective_from` / `effective_to`. Resolution is
`(scheme, ruleCode, statutoryDate) → exactly one ever-approved pack` via
[`resolveRule()`](../src/repo/rule-resolution.ts) (built in S01).

S02 proves, without wiring into pay-run creation:

- A historical statutory date resolves the pack whose range covers that date,
  including `SUPERSEDED` packs — never “today’s” pack.
- Missing coverage fails; it does not fall back to `"latest"`.
- Malformed / non-calendar dates are rejected before any query.

`pay_runs.rule_pack_id` remains an explicit caller-supplied id until a later
slice that needs date-based resolution (tracked under S01 deferred items).

## Tests

- `tests/domain/money.test.ts` — per-helper contracts (pre-existing + S02
  coverage for `quantityAmountSen` / `pctHalfUpSen`).
- `tests/domain/s02-monetary-correctness.test.ts` — drift prevention,
  reconciliation, one-sen / KWSP ceiling boundaries, negative controls.
- `tests/domain/money-module-boundary.test.ts` — no raw settle outside
  `money.ts`.
- `tests/db/s02-effective-dating.test.ts` — historical / boundary / no-fallback
  dating.
- Golden suite untouched and still green.

## Open blockers

None blocking S02.

- **S03** — closed in the same roadmap pass; see
  [`MY_STAT_S03_OVERLAP_EXCLUSION_REPORT.md`](MY_STAT_S03_OVERLAP_EXCLUSION_REPORT.md).
- **S01 deferred** — wire `resolveRule()` into `payrun.ts` only when a consuming
  vertical needs it; not as a side effect of another slice.
- **S04–S07** — employment-law values, elections, pay-item treatment, PCB
  vertical (see intake docs under `governance/`).

## Closed

MY-STAT-S02 is closed as of this report. Rounding doctrine and sen precision are
frozen; later calculation slices must use `money.ts` helpers and must not
reintroduce raw float settlement.
