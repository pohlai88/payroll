-- MY-STAT-S03 — approved rule packs for the same (layer, code) must not have
-- overlapping effective ranges.
--
-- resolveRule() already refuses ambiguous coverage at query time. That is a
-- caught-and-reported error. This constraint stops the conflict from being
-- approved in the first place.
--
-- btree_gist lets equality on text/enum participate in a GiST exclusion
-- constraint alongside a daterange overlap (&&). Open-ended packs use
-- 'infinity' as the upper bound. Adjacent ranges (…–2023-06-30][2023-07-01–…)
-- do not overlap. Packs with a NULL code are excluded from the constraint
-- (legacy/test rows that never participate in resolveRule).

CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

ALTER TABLE rule_packs
  ADD CONSTRAINT rule_packs_no_overlapping_approved_ranges
  EXCLUDE USING gist (
    layer WITH =,
    code WITH =,
    daterange(
      effective_from,
      COALESCE(effective_to, 'infinity'::date),
      '[]'
    ) WITH &&
  )
  WHERE (
    status IN ('APPROVED', 'EFFECTIVE', 'SUPERSEDED')
    AND code IS NOT NULL
  );
