# MY-STAT-S03 — Overlap-Prevention Exclusion Constraint

**Scope:** stop two approved (or later) rule packs for the same
`(layer, code)` from having overlapping `effective_from`–`effective_to`
ranges. Closes the S01 open blocker “overlap prevention is application-level
only.”

## Status

**Closed.** Migration
[`0005_rule_pack_overlap_exclusion.sql`](../src/db/migrations/0005_rule_pack_overlap_exclusion.sql)
installs `btree_gist` and adds
`rule_packs_no_overlapping_approved_ranges`. Proved by
[`tests/db/rule-pack-overlap.test.ts`](../tests/db/rule-pack-overlap.test.ts).

## What changed

- `CREATE EXTENSION IF NOT EXISTS btree_gist`
- Partial `EXCLUDE USING gist` on
  `(layer =, code =, daterange(effective_from, coalesce(effective_to, infinity), '[]') &&)`
  where `status IN ('APPROVED','EFFECTIVE','SUPERSEDED') AND code IS NOT NULL`
- Adjacent ranges (day N / day N+1) remain legal
- `DRAFT` / `SOURCE_CAPTURED` / `VERIFIED` packs may still overlap — conflict
  is an approval-time problem
- Packs with `code IS NULL` are out of scope (legacy/test rows that
  `resolveRule` never matches)

## Supersession discipline

To approve a successor for the same code while an open-ended pack is still
approved, close the old pack’s `effective_to` (and mark it `SUPERSEDED`)
**before** inserting/approving the new pack. `effective_to` remains mutable on
an approved pack; identity and `effective_from` do not.

## Relationship to resolveRule()

`resolveRule()` still throws on ambiguous approved coverage (defence in depth).
After this migration the ambiguous state cannot be created through normal
inserts. Application-level overlap tests were updated accordingly.

## Tests

- `tests/db/rule-pack-overlap.test.ts` — second overlapping APPROVED refused;
  adjacent OK; different codes OK; DRAFT overlap OK; supersession-after-close OK
- Updated `tests/db/rule-resolution.test.ts` and
  `tests/db/s02-effective-dating.test.ts` overlap cases

## Open blockers

None for S03. Wiring `resolveRule()` into pay-run creation remains an S01
deferred item.

## Closed

MY-STAT-S03 is closed as of this report.
