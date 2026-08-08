-- The EPF/SOCSO/EIS band tables had no protection against overlapping ranges,
-- unlike rule_packs (0005). Their primary key blocks an exact duplicate
-- from_sen but not e.g. (0, 5000) and (3000, 8000) coexisting for the same
-- pack (and part, for EPF). `lookupBand`'s binary search assumes sorted,
-- non-overlapping, contiguous bands; an overlap would make it silently return
-- *some* matching band with no signal that the data was wrong — a wrong
-- statutory contribution with nothing pointing at the cause.
--
-- btree_gist is already installed by 0005.

ALTER TABLE epf_bands
  ADD CONSTRAINT epf_bands_no_overlapping_ranges
  EXCLUDE USING gist (
    rule_pack_id WITH =,
    part WITH =,
    int8range(from_sen, to_sen, '[]') WITH &&
  );--> statement-breakpoint

ALTER TABLE socso_bands
  ADD CONSTRAINT socso_bands_no_overlapping_ranges
  EXCLUDE USING gist (
    rule_pack_id WITH =,
    int8range(from_sen, to_sen, '[]') WITH &&
  );--> statement-breakpoint

ALTER TABLE eis_bands
  ADD CONSTRAINT eis_bands_no_overlapping_ranges
  EXCLUDE USING gist (
    rule_pack_id WITH =,
    int8range(from_sen, to_sen, '[]') WITH &&
  );
