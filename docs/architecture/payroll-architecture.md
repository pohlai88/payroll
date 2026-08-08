# Payroll architecture — schema, functions, features

A description of what exists in `src/` and `db/` today, and where the boundaries
are. Companion to [presentation-facade.md](./presentation-facade.md), which covers
the layers above and what the UI may rely on; this document covers what is beneath.
For Malaysia wage-statement legality vs the production payslip field list, see
[payslip-legal-requirements.md](./payslip-legal-requirements.md).

Anything not yet built is marked. Nothing here is aspirational.

---

## 1. Shape

```
  db/seed/         cited statutory data          ─┐
  src/domain/calc/ pure engine, DB-free           ├─ no dependency downward
  src/domain/derive/ explanation graph           ─┘
  src/db/          Postgres schema + triggers
  src/server/      Hono API — Neon Auth JWT + invite RBAC;
                   pay-run create/recompute under /v1/pay-runs*
```

The engine imports no database client and the graph carries no URLs or hashes.
That is what makes the golden master meaningful — it exercises the real path with
nothing mocked — and what lets a figure be re-explained years later against the
rule pack that produced it.

---

## 2. Schema

Phase 2 persistence plus later in-phase amendments (statutory authority,
RBAC, PCB tax/YTD profile, internal group transfer, employment profiles).
Migrations live in `src/db/migrations/` (`0000`–`0014` at time of writing):
generated Drizzle SQL plus hand-written trigger/governance files
(`0001_phase2_triggers.sql`, `0004_authority_governance.sql`, and others).
The five core calculation-lifecycle triggers from the persistence design
remain in `0001_phase2_triggers.sql`; authority/RBAC/transfer add their own.

### 2.1 Enums

Written out literally rather than generated from the TypeScript unions, because a
generated enum would silently follow a code change the database has no migration
for. `tests/db/enums.test.ts` asserts membership equality in both directions.

| Enum | Members |
|---|---|
| `pay_item_kind` | EARNING · DEDUCTION |
| `rate_basis` | FIXED_MONTHLY · PER_DAY · PER_HOUR · PER_UNIT · AMOUNT |
| `pay_basis` | MONTHLY · DAILY · HOURLY |
| `epf_part` | A · C · E · F · NONE |
| `socso_category` | FIRST · SECOND · NONE |
| `run_status` | DRAFT · REVIEWED · APPROVED · CLOSED |
| `run_type` | REGULAR · OFFCYCLE |
| `offcycle_reason` | CORRECTION · ARREARS · BONUS · MISSED_PAYMENT · FINAL_PAYMENT |
| `override_field` | the 10 statutory figures an approved override may replace |
| `termination_reason` | RESIGNATION · DISMISSAL · CONTRACT_END · INTERNAL_GROUP_TRANSFER · RETIREMENT · OTHER |
| `group_service_continuity` | CONTINUOUS · RESET |

`run_status` has no PAID member on purpose: payment is a line-level rollup, not a
run state.

### 2.2 Parties — `companies` · `persons` · `employments`

**One person, many employments**, present from the start rather than retrofitted.
Backfilling a person/employment split later means matching historical records by
IC, which is precisely the migration to avoid.

- `companies` — EPF/SOCSO/LHDN registrations, HRDF flag and levy percent.
- `persons` — the human being: name, IC, passport, DOB, `groupServiceDate`.
  IC is uniquely indexed *partially* (`WHERE ic IS NOT NULL`), because many
  persons legitimately have no IC on file and NULLs must not collide.
- `employments` — engagement by one legal employer: `employeeCode` (unique within
  company), `joinDate`, `payBasis`, `baseRateSen`, the four applicability flags,
  the classification overrides, and statutory/bank identifiers.

Two tri-state booleans are deliberate: `epfMemberBeforeAug1998` and
`eisPriorContribution` are nullable because **unknown is not false**. Unknown EIS
history at 57 produces a `REVIEW_REQUIRED` flag rather than a silent assumption.

`employments_company_period` indexes `(companyId, joinDate, terminationDate)`
because run membership is an overlap query — `joinDate ≤ periodEnd AND
(terminationDate IS NULL OR terminationDate ≥ periodStart)` — not an ACTIVE flag.
An employment ended mid-month must still appear in its own final run.

### 2.2a Internal group transfer — `transfers` · `employment_prior_ytd`

MVP of the cross-company transfer capability
([design](../superpowers/specs/2026-08-08-internal-group-transfer-design.md)),
narrower than §8 of the
[pay-run workspace spec](../superpowers/specs/2026-08-08-payrun-workspace-design.md):
evidence attaches via `evidenceArtifactId`; findings scan post-commit.
`src/service/transfer.ts`'s `commitTransfer` ends
Employment A, creates Employment B, and links them via `transfers` in one
transaction; `recordPriorEmploymentYtd` writes `employment_prior_ytd`
(TP3-style prior-employer figures for PCB continuity) independently. Three
business rules — no concurrent open employment without an explicit
`allowedOverlap` + reason, no retroactive close into an already
APPROVED/CLOSED regular run, and service dates staying ordered — are
enforced in the service, not as triggers, because each either has a
legitimate override or would need this codebase's trigger convention to
bend it (§2.7 reserves triggers for exception-less invariants).

### 2.3 Catalog — `pay_items` · `employment_pay_items`

Fixed kinds, free catalog: users create and edit items, but only within the closed
`pay_item_kind` enum, because a kind decides whether a figure is paid or deducted.

`pay_items` carries the statutory treatment flags — `epfWages`, `socsoWages`,
`eisWages`, `prorates` — which are what drive the wage bases, and what the UI's
per-line treatment tags render from.

There is **no multiplier column**. The engine computes `qty × rate` and consumes
no factor; a stored value nothing reads would drift out of truth.

`employment_pay_items` holds per-employment defaults that a line's `rateSen` is
seeded from before the operator edits it for the run.

### 2.4 Rule pack — 7 tables

`rule_packs` · `rule_sources` · `rule_settings` · `epf_bands` · `socso_bands` ·
`eis_bands` · `seed_files`.

Seeded, versioned data, not operational data. `rule_sources` carries issuer,
title, URL, retrieval date and hash for each of the 8 official documents. A run
records the pack it was calculated under, so any figure traces to the table row
and the gazetted document that produced it. A rate is never a literal in code.

### 2.5 Run — 6 tables

| Table | Holds |
|---|---|
| `pay_runs` | identity (`DLBB-2026-07`), period, `workingDays`, rule pack, status, and the reviewed/approved revision bindings |
| `pay_lines` | one per employment: the frozen `employeeSnapshot`, the inputs, all 19 sen figures, and the typed trace |
| `pay_line_items` | one entered earning or deduction, with the catalog definition frozen onto it |
| `pay_line_overrides` | approved replacement of a computed statutory figure |
| `pcb_entries` | PCB/MTD as a controlled external input |
| `audit_events` | append-only, with `bulkOperationId` grouping the children of one bulk edit |

**Three layers of snapshot**, so a run recomputed years later cannot be
reinterpreted by data that has since changed:

1. `pay_lines.employeeSnapshot` — the `EmployeeSnapshot` the engine consumed,
   parsed through Zod at the repository boundary.
2. `pay_line_items.*Snap` — code, kind, basis, both names, all three wage flags,
   prorates, sort. **Reads are served entirely from the snapshot columns;**
   `payItemId` is provenance only, kept so a later phase can raise "catalog
   changed since compute". Nothing computes from it.
3. `pay_runs.rulePackId` — which statute version applied.

`pay_runs_regular_period_unique` is a *partial* unique index on
`(companyId, year, month) WHERE runType = 'REGULAR'`, so off-cycle runs sit
alongside the regular run for a period rather than colliding with it.

### 2.6 Null is not zero

This is the schema's most consequential decision and the easiest to erode.

| Column | Null means |
|---|---|
| `pay_lines.pcbNetSen` | PCB has not been entered |
| `pay_lines.deductionsTotalSen` | PCB applicable but missing — the total is genuinely unknown |
| `pay_lines.netSen` | same; renders as an em dash, **never** as zero |
| `pcb_entries.pcbAmountSen` | not entered |
| `employments.epfMemberBeforeAug1998` | unknown, which is not false |

A payroll that shows `0.00` for an unknown net has told the operator something
false. Every layer above must preserve the distinction — see the facade rules in
[presentation-facade.md §5](./presentation-facade.md#5-facade-rules).

### 2.7 Where an invariant lives

The rule that decides which mechanism holds a given constraint:

| Mechanism | For | Examples |
|---|---|---|
| **Type** | shapes expressible in TypeScript | `LineItemInput` discriminated union; `MessageKey` derived from the English dictionary |
| **CHECK** | single-row, no join | period ordering, month 1–12, `paidDays ≤ workingDays`, non-negative rates, non-blank override reason |
| **Trigger** | needs a join, or guards a lifecycle | the five below |
| **Zod** | untrusted input crossing a boundary | `employeeSnapshot` at the repository edge |
| **Test** | properties, not rows | golden master, `assertNoDeadEnds`, enum membership equality, citation-id snapshots |

The five trigger functions:

1. **`enforce_run_immutability`** — nothing calculation-relevant changes once a run
   is APPROVED or CLOSED. Fires on `pay_lines`, `pay_line_items`,
   `pay_line_overrides`, `pcb_entries`.
2. **`enforce_run_status_transition`** — status moves only DRAFT → REVIEWED →
   APPROVED → CLOSED, plus the REVIEWED → DRAFT demotion the atomic edit
   transaction performs. Everything else raises.
3. **`enforce_pay_item_identity`** — code and kind are immutable, deletion is
   always soft, system items cannot be deactivated. Changing a code reclassifies
   every historical line that cites it.
4. **`enforce_employment_item_compatibility`** — rate shape (a rate for quantity
   bases, an amount for the rest) and pay-basis fit (a DAILY employment cannot
   carry a FIXED_MONTHLY item). Both need a join, which is why they are not CHECKs.
5. **`enforce_audit_append_only`** — updates and deletes on `audit_events` raise.

These are in the database rather than a service layer because **discipline is
invisible when it lapses**: a missed call site silently writes to an approved
payroll and nothing says so. Each trigger has a provocation test asserting the
message it raises.

### 2.8 What is deliberately *not* constrained

`pay_lines.hoursWorked` is unbounded. Statutory-limit breaches — overtime past the
monthly cap, hours past the weekly maximum — are **recordable facts, not impossible
ones**. They happen, and a payroll system that refuses to record them cannot report
them. The findings engine flags them against `statutoryLimits` on the rule pack.
Do not turn this into a hard reject.

This is the general principle: *impossible data is rejected; unusual data is
preserved and challenged.*

---

## 3. Functions

### 3.1 Money — `src/domain/money.ts`

The single authority on Malaysian rounding. All amounts are integer sen; floats
appear only transiently inside explicit rounding helpers, and every public
function asserts `Number.isSafeInteger` so precision loss fails loudly.

| Function | Contract |
|---|---|
| `roundHalfUpSen(v)` | half **away from zero** (2.5→3, −2.5→−3) — a deduction's magnitude rounds like a payment's. Settles `-0` to `0` |
| `mulDivSen(amt, num, den)` | `amt × num ÷ den`, exact via BigInt when both are integers |
| `pctRoundUpToRinggitSen(amt, pct)` | the KWSP ceiling rule |
| `formatRM(sen)` / `parseRM(s)` | the only string boundary |

### 3.2 Identity and dates — `src/domain/ic.ts`, `date.ts`

`dobFromIc(ic, today)` → NRIC to ISO date of birth, or null.
`ageAt(dobIso, atDateIso)` → the age that drives EPF part and SOCSO category.
`isRealDate`, `isIsoDate`, `parseIsoDate` — calendar validation, not regex-only.

### 3.3 The statutory engine — `src/domain/calc/`

| Module | Entry point | Does |
|---|---|---|
| `classify.ts` | `classify()` | age → EPF part, SOCSO category, EIS eligibility, SKBBK window |
| `resolve-items.ts` | `resolveItems()` / `resolveItem()` | entered item → resolved sen, by rate basis |
| `proration.ts` | `regularPay()`, `quantityAmount()` | basis-aware regular pay; cites the Employment Act |
| `wage-base.ts` | `wageBases()` | earnings → EPF / SOCSO / EIS wage bases, per item flags |
| `epf.ts` | `epf()` | Third Schedule A/C/E band lookup |
| `socso.ts` | `socso()` | Act 4 + SKBBK, first/second category |
| `eis.ts` | `eis()` | Act 800 bands |
| `pcb.ts` | `pcbNet()` | **assembles a supplied figure. Never computes one** |
| `validate.ts` | `validateLineInputs()` | structured `ValidationIssue[]` with field paths — `DOB_REQUIRED`, `PAID_DAYS_INVALID`, `HOURS_WORKED_INVALID`, … |
| `compose.ts` | `computeLineChecked()`, `computeLine()` | the whole line |

**Call `computeLineChecked`, not `computeLine`.** Any caller taking input from a
user, an API request or an import gets `{ok: false, issues}` with field paths
rather than a `RangeError` thrown from the arithmetic primitives. `computeLine`
assumes its input already validated.

The composition order is fixed: earnings → gross → three wage bases →
EPF/SOCSO/EIS (with overrides applied) → PCB net → deductions → net → employer
cost.

### 3.4 The derivation layer — `src/domain/derive/`

| Module | Entry point | Does |
|---|---|---|
| `emit.ts` | `deriveLine(opts)` | emits the DAG **alongside** `computeLine`, not instead of it |
| `graph.ts` | `GraphBuilder`, `readSen`, `canonicalJson` | flat keyed graph, 19 named roots, deterministic emit order |
| `node.ts` | 11 node kinds | 4 may be terminal; each terminal kind answers "why" with provenance or a citation |
| `invariants.ts` | `assertNoDeadEnds` | turns "nothing is hidden" into a failing test |
| `mirror.ts` | `findDivergences` | proves graph and engine agree on all 19 roots |
| `diff.ts` | graph diff | ADDED / REMOVED / VALUE / STRUCTURE / **CITATION** |
| `citation.ts` | `RuleId`, `SourceRef` | two identifiers with different lifetimes |
| `label.ts`, `i18n/` | `renderLabel(label, lang)` | key + typed params → EN or MS at display time |

Four design decisions worth knowing before touching this layer:

- **`GraphBuilder.add()` enforces the DAG by construction** — an id may be emitted
  once, and every input must already exist when the node referencing it is added.
- **Ids are semantic paths** (`line.epf.ee`), never content hashes. That is what
  makes `diff.ts` a keyed map difference, and month-over-month variance an
  explanation rather than noise. Content-hashed ids would change every node every
  month.
- **Nodes store no prose.** A hardcoded sentence is how the words drift from the
  figures, and it is why the old engine's payslip could only ever be English.
- **Citations are `(ruleId, sourceRef)` only.** `ruleId` is stable forever;
  `sourceRef` changes when KWSP republishes at a new URL. Issuer/URL/hash resolve
  at render time. Both unions are a **wire format: additive only.** A member may
  never be renamed or removed — that orphans stored citations, and a rename
  passes typecheck silently. Reading an unknown id is a **strict reject** with a
  clear error, never a silently dropped citation.

---

## 4. Features

### Working today

- **Full Malaysian statutory calculation** — EPF (Third Schedule A/C/E), SOCSO
  (Act 4 + SKBBK supplement), EIS (Act 800), HRDF levy, proration on three pay
  bases, approved overrides on 10 statutory figures.
- **Age-derived classification** from NRIC, with manual override and an explicit
  unknown state.
- **The golden master** — `tests/golden/july-2026-afenda.test.ts` reproduces the
  verified July 2026 run, 37 employees, every figure to the sen. Gross RM176,930.00,
  net RM155,609.55, EPF EE RM19,210.00, SOCSO EE RM1,822.05, EIS EE RM288.40.
  **If it fails, the engine changed behaviour — do not ship, and never update the
  fixture to match.**
- **Recursive explanation** — every figure drills to a statutory table row with
  issuer, URL and SHA-256, or to a raw input with who entered it and when.
  Enforced, not asserted: `assertNoDeadEnds` fails the build otherwise.
- **Bilingual by construction** — one graph renders EN and MS; a missing
  translation is a compile error, because `ms.ts` is typed as a total map.
- **Run-to-run diff** — variance explained with no separate variance engine,
  including when the *statute itself* moved (`CITATION` diffs).
- **Persistence with self-enforcing invariants** — 18 tables, immutability past
  approval, forward-only lifecycle, append-only audit.
- **`explain` CLI** — `scripts/explain.ts` walks a line's derivation as a tree.
- **Internal group transfer** — `commitTransfer`/`recordPriorEmploymentYtd` in
  `src/service/transfer.ts` (§2.2a), with `evidenceArtifactId` on transfers /
  prior YTD, post-commit §8.6 transfer findings scan, and run-scoped §8.6
  detectors wired into `scanRunFindings`. Wizard UI / DRAFT transfer state
  remain deferred — see "Specified, not built."
- **S06 pay-item treatments + PCB class** — `pay_item_treatments` (EPF/SOCSO/EIS/HRD)
  and `pay_item_pcb_classes` (NORMAL/ADDITIONAL/EXCLUDED); HRDF uses `hrdWagesSen`.

### Auth platform (Phase 3, built)

`src/server/` hosts a Hono Node API (`npm run dev:api`) that verifies Neon Auth
Bearer JWTs, invite-only links `users.auth_subject`, and exposes `/health`,
`/v1/me*`, SYSTEM_ADMIN `/v1/admin/users*`, employee import, and pay-run
control routes (`/v1/pay-runs*`). Design:
[hono-neon-auth-design](../superpowers/specs/2026-08-08-hono-neon-auth-design.md).

**Phase 6–7 control backend (built):** findings catalog + scan stamp, pure
`evaluateGate`, revision-bound REVIEW/APPROVE + READY `line_payments`,
release/settle/reconcile/distribute/close, R2 artifacts —
[phase6-findings-gates-approval-design](../superpowers/specs/2026-08-08-phase6-findings-gates-approval-design.md),
[phase6-7-control-backend-design](../superpowers/specs/2026-08-08-phase6-7-control-backend-design.md).

### Specified, not built

The teaching payslip; Phase 5 payroll UI + derivation drawer; SPA wiring for
control HTTP. For internal group transfer specifically: the wizard UI and
a persisted DRAFT transfer state — see the
[transfer design](../superpowers/specs/2026-08-08-internal-group-transfer-design.md)
and
[transfer/statutory follow-ups](../superpowers/specs/2026-08-08-transfer-statutory-followups-design.md).
Same-company department/designation change (§8.2) remains unbuilt and unscoped.

---

## 5. Verification

| Gate | Command | Covers |
|---|---|---|
| Types | `npm run typecheck` | the whole tree |
| Domain | `npx vitest run --project domain` | 468 tests: engine, golden master, derivation integrity |
| Database | `npx vitest run --project db` | triggers, constraints, enum parity — needs Docker Postgres |
| Lint | `npm run check` | Ultracite/Biome |

The `db` project **fails loudly when the database is absent rather than skipping**,
because a silently skipped constraint test is indistinguishable from a passing one.

**Current status:** Phase 2 persistence is on the `phase2-persistence` branch.
Gate commands: `npm run typecheck`, `npx vitest run --project domain`,
`npx vitest run --project db` (Docker Postgres required for `db`). The
`db` suite includes trigger provocations (`constraints.test.ts`), enum
parity, content-addressed seed integrity, and July 2026 golden parity
through the repository/service layers. Local rebuild: `npm run db:reset`.

---

## 6. Cross-cutting rules

1. Money is integer sen everywhere. Rounding lives in one file.
2. Null means unknown. Never default it to zero.
3. PCB is supplied and evidenced, never computed. No code path may compute it.
4. Snapshot on write — snapshots serve reads; live references are provenance only.
5. Citation ids and rule ids are additive-only wire formats.
6. Impossible data is rejected; unusual data is preserved and challenged.
7. The engine imports nothing from the database, and must not start.
