-- MY-STAT — the overlap exclusion from 0005 grouped only by (layer, code),
-- but a rule pack's stated identity is (jurisdiction, authority, code,
-- version): a state-level variant sharing `code` with the national pack (e.g.
-- a Sabah/Sarawak overtime rule alongside the Peninsular one) does not
-- actually conflict with it, and must not be rejected — or, going the other
-- way, treated as ambiguous by resolveRule() — as if it did.
--
-- Same technique as 0005: drop and recreate with jurisdiction added to the
-- equality list.

ALTER TABLE rule_packs
  DROP CONSTRAINT rule_packs_no_overlapping_approved_ranges;--> statement-breakpoint

ALTER TABLE rule_packs
  ADD CONSTRAINT rule_packs_no_overlapping_approved_ranges
  EXCLUDE USING gist (
    jurisdiction WITH =,
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
