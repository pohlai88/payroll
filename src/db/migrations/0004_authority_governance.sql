-- Governance for the statutory authority model.
--
-- Government instruments are the authority; approved rule packs are the
-- executable representation; payroll runs permanently record which
-- representation they used. These two triggers make the middle sentence true in
-- the database rather than in a code path someone might forget to call.

-- ---------------------------------------------------------------------------
-- 6. Only an approved rule pack may produce a payroll.
--
-- A DRAFT pack is a work in progress and a VERIFIED one is still waiting for
-- somebody to take responsibility for it. Neither may reach a payroll run. A
-- SUPERSEDED pack still may: runs calculated under it must remain reproducible,
-- and a historical run legitimately references the rules that were in force.
-- ---------------------------------------------------------------------------

CREATE FUNCTION enforce_run_uses_approved_rule_pack() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  pack_status rule_pack_status;
BEGIN
  SELECT rule_packs.status INTO pack_status
    FROM rule_packs WHERE rule_packs.id = NEW.rule_pack_id;

  IF pack_status IS NULL THEN
    RAISE EXCEPTION 'rule pack % does not exist', NEW.rule_pack_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF pack_status NOT IN ('APPROVED', 'EFFECTIVE', 'SUPERSEDED') THEN
    RAISE EXCEPTION
      'rule pack % is %: only an approved rule pack may produce a payroll',
      NEW.rule_pack_id, pack_status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER pay_runs_require_approved_rule_pack
  BEFORE INSERT OR UPDATE OF rule_pack_id ON pay_runs
  FOR EACH ROW EXECUTE FUNCTION enforce_run_uses_approved_rule_pack();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 7. An approved rule pack is immutable; a statutory change makes a successor.
--
-- Editing a pack that has produced a payroll rewrites history: the run would
-- still cite it, but it would no longer say what it said at the time. The only
-- permitted transitions on an approved pack are the ones that retire it —
-- closing its effective range, moving to EFFECTIVE or SUPERSEDED, and naming the
-- successor that replaced it.
-- ---------------------------------------------------------------------------

CREATE FUNCTION enforce_rule_pack_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('APPROVED', 'EFFECTIVE', 'SUPERSEDED') THEN
      RAISE EXCEPTION
        'rule pack % has been approved and cannot be deleted: supersede it instead',
        OLD.code
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status NOT IN ('APPROVED', 'EFFECTIVE', 'SUPERSEDED') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.layer IS DISTINCT FROM OLD.layer
     OR NEW.jurisdiction IS DISTINCT FROM OLD.jurisdiction
     OR NEW.authority IS DISTINCT FROM OLD.authority
     OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.published_at IS DISTINCT FROM OLD.published_at
     OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
     OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
  THEN
    RAISE EXCEPTION
      'rule pack % is approved and immutable: a statutory change creates a new version',
      OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Status may only move onward: EFFECTIVE, then SUPERSEDED. Never back.
  IF NEW.status <> OLD.status
     AND (OLD.status, NEW.status) NOT IN (
       ('APPROVED',  'EFFECTIVE'),
       ('APPROVED',  'SUPERSEDED'),
       ('EFFECTIVE', 'SUPERSEDED')
     )
  THEN
    RAISE EXCEPTION 'rule pack % cannot move from % to %', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER rule_packs_immutable_once_approved
  BEFORE UPDATE OR DELETE ON rule_packs
  FOR EACH ROW EXECUTE FUNCTION enforce_rule_pack_immutability();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 8. The content of an approved pack is frozen with it.
--
-- Immutability of the pack row means nothing if its band tables, settings,
-- sources or employment-law rules can still be edited underneath it.
-- ---------------------------------------------------------------------------

CREATE FUNCTION enforce_rule_pack_content_frozen() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  pack_id text;
  pack_status rule_pack_status;
BEGIN
  pack_id := COALESCE(NEW.rule_pack_id, OLD.rule_pack_id);

  SELECT rule_packs.status INTO pack_status
    FROM rule_packs WHERE rule_packs.id = pack_id;

  IF pack_status IN ('APPROVED', 'EFFECTIVE', 'SUPERSEDED') THEN
    RAISE EXCEPTION
      'rule pack % is approved: its % cannot be changed, create a new version',
      pack_id, TG_TABLE_NAME
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;--> statement-breakpoint

CREATE TRIGGER epf_bands_frozen_once_approved
  BEFORE INSERT OR UPDATE OR DELETE ON epf_bands
  FOR EACH ROW EXECUTE FUNCTION enforce_rule_pack_content_frozen();--> statement-breakpoint

CREATE TRIGGER socso_bands_frozen_once_approved
  BEFORE INSERT OR UPDATE OR DELETE ON socso_bands
  FOR EACH ROW EXECUTE FUNCTION enforce_rule_pack_content_frozen();--> statement-breakpoint

CREATE TRIGGER eis_bands_frozen_once_approved
  BEFORE INSERT OR UPDATE OR DELETE ON eis_bands
  FOR EACH ROW EXECUTE FUNCTION enforce_rule_pack_content_frozen();--> statement-breakpoint

CREATE TRIGGER rule_settings_frozen_once_approved
  BEFORE INSERT OR UPDATE OR DELETE ON rule_settings
  FOR EACH ROW EXECUTE FUNCTION enforce_rule_pack_content_frozen();--> statement-breakpoint

CREATE TRIGGER rule_sources_frozen_once_approved
  BEFORE INSERT OR UPDATE OR DELETE ON rule_sources
  FOR EACH ROW EXECUTE FUNCTION enforce_rule_pack_content_frozen();--> statement-breakpoint

CREATE TRIGGER employment_law_rules_frozen_once_approved
  BEFORE INSERT OR UPDATE OR DELETE ON employment_law_rules
  FOR EACH ROW EXECUTE FUNCTION enforce_rule_pack_content_frozen();
