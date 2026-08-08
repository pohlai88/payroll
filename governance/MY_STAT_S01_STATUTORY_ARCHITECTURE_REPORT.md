# MY-STAT-S01 — Statutory Architecture

**Scope:** minimum statutory-governance foundation for Malaysia Payroll — official
source registry, versioned statutory rules, lifecycle, immutability, rule
resolution, rule packs, and the tests that prove all of it. No EPF, SOCSO, EIS,
PCB, CP38 or HRD calculation was touched.

## Status

**Foundation already existed; this work closes the one gap and hardens the
rest.** A prior phase (`docs/superpowers/specs/2026-08-08-statutory-authority-amendment.md`,
commits `bffa7f7`, `5ea9e61`, `c2f0624`) already built the source registry,
the versioned/immutable rule-pack model, the DRAFT→...→APPROVED→SUPERSEDED
lifecycle, and the database triggers enforcing immutability and
approval-gating. What MY-STAT-S01 asked for that did not yet exist was
**rule resolution** — a function that turns `(scheme, ruleCode, statutoryDate)`
into exactly one approved rule, failing loudly on none, many, or unapproved,
never falling back to "latest". This report documents what was already true,
what was added, and what remains genuinely open.

Delivered in this pass:

- `src/repo/rule-resolution.ts` — `resolveRule()`, the missing resolution
  function.
- `tests/db/rule-resolution.test.ts` — 14 tests proving every failure mode the
  spec requires (no rule, multiple rules, unapproved rule, historical
  resolution, malformed dates, cross-scheme isolation).
- Two tests added to `tests/db/seed-integrity.test.ts` proving the seed is
  idempotent and the rule-pack content hash is deterministic.
- A one-line fix to `vitest.config.ts` (see **Tests**) needed to get the full
  suite — old and new — running and green together, and a typecheck fix
  (an invalid `minWorkers` option) found in the same file.

No schema migration, no enum change, no calculation code touched.

## Schema/model changes

**None.** Every column MY-STAT-S01 asks for on a "versioned statutory rule"
already exists on `rule_packs` (`src/db/schema/rule-pack.ts`), because a rule
pack *is* the versioned statutory rule in this system:

| MY-STAT-S01 field | `rule_packs` column |
|---|---|
| scheme | `layer` (`STATUTORY_CALCULATION` \| `EMPLOYMENT_LAW` \| `COMPANY_POLICY`) |
| rule code | `code` (e.g. `MY-STATUTORY`, `MY-EMPLOYMENT-LAW`, `MY-PCB`) |
| version | `version` |
| effectiveFrom / effectiveTo | `effective_from` / `effective_to` |
| content | `epf_bands` / `socso_bands` / `eis_bands` / `rule_settings` / `employment_law_rules`, keyed by `rule_pack_id` |
| content hash | `content_hash` (hex SHA-256, checked by a `CHECK` constraint) |
| status | `status` |

The official source registry (`rule_sources`) already carries authority
(`issuer`), title, URL, `effective_date`, `sha256` for fixed documents, and a
verification record (`verification_method` / `verified_by` / `verified_at`) —
i.e. "verified status" per source. `resolveRule()` was added as a pure query
module against these existing tables; nothing was added to or changed in the
schema.

## Lifecycle

Implemented lifecycle (`rule_pack_status` enum, `src/db/schema/enums.ts`):

```
DRAFT → SOURCE_CAPTURED → VERIFIED → APPROVED → EFFECTIVE → SUPERSEDED
```

This is a superset of the requested `DRAFT → VERIFIED → APPROVED →
SUPERSEDED`, for two reasons already justified in the amendment spec and left
unchanged here:

- `SOURCE_CAPTURED` sits between `DRAFT` and `VERIFIED` so an instrument can be
  registered with its evidence before any value is transcribed from it (see
  `db/seed/employment-law-sources.json`, `db/seed/pcb-sources.json` — two packs
  that hold sources but no values, and cannot reach payroll).
- `EFFECTIVE` sits between `APPROVED` and `SUPERSEDED` to distinguish "approved
  and correct" from "approved and currently in force" — both still eligible to
  produce a payroll and both still eligible for `resolveRule()` (see below).

"Only APPROVED rules may be used in production payroll" is enforced as
`status IN ('APPROVED', 'EFFECTIVE', 'SUPERSEDED')` at two points: the
`pay_runs_require_approved_rule_pack` trigger (a run cannot cite anything
less), and `resolveRule()`'s own eligibility filter. `SUPERSEDED` is included
in both because a pack that has been approved and later superseded must
remain usable for the historical runs that cited it, and resolvable for
historical dates that fall inside its old effective range — see **Rule
resolution**.

## Immutability

Enforced in the database (`src/db/migrations/0003_statutory_authority.sql`,
`0004_authority_governance.sql`), proved in `tests/db/authority.test.ts`
(pre-existing, unchanged):

- An `APPROVED`/`EFFECTIVE`/`SUPERSEDED` pack rejects any `UPDATE` that
  changes identity, dates, content hash, or approval attribution; only the
  forward transitions `APPROVED→EFFECTIVE`, `APPROVED→SUPERSEDED`,
  `EFFECTIVE→SUPERSEDED` are allowed, and never backward.
- It rejects deletion outright ("supersede it instead").
- Its content tables (`epf_bands`, `socso_bands`, `eis_bands`, `rule_settings`,
  `rule_sources`, `employment_law_rules`) each reject `INSERT`/`UPDATE`/`DELETE`
  once the owning pack is approved — content is frozen with the pack, not just
  the pack row.
- Approval itself cannot happen without attribution: a `CHECK` constraint
  refuses `APPROVED`/`EFFECTIVE`/`SUPERSEDED` status without `approved_by`,
  `approved_at`, and `content_hash` all set.

"Changes require a new version" and "historical versions remain available"
follow directly: `scripts/seed.ts` treats a content-hash mismatch against an
already-approved pack as an error naming both hashes, instructing the caller
to version and supersede rather than overwrite (see the "an approved pack's
content is frozen with it" and "rule pack ... is already approved with
content hash ..." cases).

## Rule resolution

**New in this pass** — `src/repo/rule-resolution.ts`, `resolveRule(db, {
scheme, ruleCode, statutoryDate })`:

- Queries `rule_packs` by `layer = scheme AND code = ruleCode` with
  `effective_from <= statutoryDate <= effective_to` (or `effective_to IS
  NULL`).
- **No rule** → throws `RuleResolutionError` naming the scheme/ruleCode/date.
- **Multiple rules** → if more than one candidate has ever been approved
  (`APPROVED`/`EFFECTIVE`/`SUPERSEDED`) and its effective range covers the
  date, throws, naming every conflicting pack id — this is the "overlapping
  approved rules cannot resolve silently" guarantee. It is enforced in the
  resolver, not the schema (there is no `EXCLUDE` constraint on effective
  ranges); see **Open blockers**.
- **Unapproved rule** → if candidates exist for the window but none has ever
  been approved (only `DRAFT`/`SOURCE_CAPTURED`/`VERIFIED`), throws, naming the
  statuses found.
- **Historical resolution** → `SUPERSEDED` is eligible, so a date inside a
  since-superseded pack's own effective range still resolves to that pack, not
  to whatever replaced it (or to nothing).
- **Never "latest"** — there is no `ORDER BY ... LIMIT 1` anywhere in the
  query path; ambiguity is always a thrown error, never a pick.
- Validates `statutoryDate` is a real ISO `yyyy-mm-dd` date (reusing
  `src/domain/date.ts#isIsoDate`) before touching the database.

This is additive and read-only: nothing in `src/service/payrun.ts` or the calc
engine calls it yet. `pay_runs.rule_pack_id` continues to be supplied
explicitly at run creation, as before. Wiring `resolveRule()` into run
creation (so a new run resolves its pack by date instead of being told which
one to use) is a natural next step but is deliberately **not** done here — it
would touch the payroll-creation path this task is scoped to leave alone.

## Rule-pack/hash

Unchanged, already correct, now with an explicit test of the two properties
MY-STAT-S01 names:

- **Deterministic SHA-256**: `contentHash` in `scripts/seed.ts` is computed as
  the SHA-256 of `"<filename>:<sha256-of-file>"` for every seed file, joined in
  a fixed order, then hashed again — a pure function of the bytes on disk.
- **Approved pack is immutable**: see **Immutability** above.
- **Historical payroll references the exact pack used**: `pay_runs.rule_pack_id`
  is a foreign key to `rule_packs.id`, and the pack a run cites can never
  change underneath it (immutability) or disappear (deletion is refused once
  approved).

New test (`tests/db/seed-integrity.test.ts`, "the rule pack is idempotent and
its hash is deterministic"): re-running `seed()` against a database that
already carries the approved pack is a no-op — same `content_hash`, same
single row, no duplicate `seed_files`/`epf_bands` rows — proving both
"rule-pack hash is deterministic" and "seed remains idempotent" from the
outside, against the real seed files rather than a synthetic fixture.

## Tests

573 tests pass (557 pre-existing + 16 new), run against a real Postgres
(`docker-compose.yml`) with migrations applied fresh:

```
npx vitest run
 Test Files  17 passed (17)
      Tests  573 passed (573)
npx tsc --noEmit    # clean
```

New:

- `tests/db/rule-resolution.test.ts` (14 tests) — happy path (APPROVED and
  EFFECTIVE both resolve), malformed/unreal dates rejected before the query
  runs, no-rule (missing window, wrong scheme, unknown rule code), unapproved
  rule (DRAFT-only, VERIFIED-only, and an explicit "never falls back to DRAFT"
  case), overlapping approved rules (ambiguous, and an explicit "never prefers
  the newer row" case), historical resolution (a date inside a `SUPERSEDED`
  pack's own range resolves to it; a date in the gap between two non-adjacent
  packs resolves to nothing).
- `tests/db/seed-integrity.test.ts` (+2 tests) — idempotent re-seed, no
  duplicate rows on re-seed.

Already covered, unchanged, re-verified green: `tests/db/authority.test.ts`
(lifecycle, immutability, evidence register, employment-law rule registry),
`tests/db/enums.test.ts` (DB/TypeScript enum alignment in both directions),
`tests/db/constraints.test.ts`, `tests/db/golden-parity.test.ts` and
`tests/golden/*` (July 2026 37-employee sen-level parity, untouched).

**Infrastructure fix required to get there** (`vitest.config.ts`): the `db`
test project's most recent commit had set `isolate: false` to "batch" all
db-backed test files onto a single worker for speed. In practice this broke
correctness rather than only improving speed — `beforeAll`/`afterAll` across
files stopped being reliably sequenced, so one file's connection pool or rows
were still live when the next file's `beforeEach` truncated and reseeded,
producing intermittent duplicate-key violations and Postgres deadlocks when
the whole suite ran together (reproduced and confirmed by toggling `--isolate`
on the CLI: failures disappeared immediately). Removed the override — `db`
tests now run with Vitest's default per-file isolation, `fileParallelism:
false`, and `maxWorkers: 1`, actually serializing files as intended. Also
removed an invalid `minWorkers` project option that failed `tsc --noEmit`
(not a valid `ProjectConfig` field in the installed Vitest version). Neither
change touches test content, calculation code, or fixtures.

## Open blockers

- ~~**Overlap prevention is application-level, not a database constraint.**~~
  **Closed by MY-STAT-S03** — see
  [`MY_STAT_S03_OVERLAP_EXCLUSION_REPORT.md`](MY_STAT_S03_OVERLAP_EXCLUSION_REPORT.md).
  `rule_packs_no_overlapping_approved_ranges` now refuses the second overlapping
  approval; `resolveRule()` keeps defence-in-depth ambiguity checks.
- **`resolveRule()` is not wired into any caller.** It exists and is tested,
  but nothing in `src/service/payrun.ts` uses it yet — run creation still
  takes an explicit `rulePackId`. Wiring it in is the natural next step and
  was deliberately left out to avoid touching the payroll-creation path in a
  task scoped to governance only.
- **The `EMPLOYMENT_LAW` and PCB packs remain `SOURCE_CAPTURED`, not
  approved** (`MY-EMPLOYMENT-LAW-2026`, `MY-PCB-2026`) — by design.
  Proposed employment-law values are now recorded in
  [`MY_STAT_S04_EMPLOYMENT_LAW_INTAKE.md`](MY_STAT_S04_EMPLOYMENT_LAW_INTAKE.md)
  awaiting named human sign-off before `employment_law_rules` can be loaded.
  PCB pack: `P-SPEC-2026` SHA-256 recorded; Decision A keeps PCB as controlled
  external input (see [`MY_STAT_S07_PCB_SPEC_INTAKE.md`](MY_STAT_S07_PCB_SPEC_INTAKE.md)).
  `resolveRule()` correctly refuses both schemes until approved.
- **PCB/MTD remains a controlled external input, not a computed rule** —
  reaffirmed by S07 Decision A. Computerised vertical + `LHDN_VERIFIED` gate
  remain a dedicated future slice.

**Governance note on the above:** all four items are deferred statutory
hardening, not defects. They are **non-blocking until a consuming calculation
vertical requires them** — e.g. the exclusion constraint matters once packs
are approved by more than one operator; wiring `resolveRule()` matters once a
vertical needs date-based resolution instead of an explicit pack id. **No
deferred item listed here may be silently implemented as a side effect of an
unrelated slice.** Each requires its own task, its own tests, and its own
report section before it lands.

## Closed

MY-STAT-S01 is closed as of this report. The four items above are carried
forward as tracked, non-blocking backlog — not reopened scope.
