-- Hand-written migration: the invariants that need more than a CHECK.
--
-- Each of these guards something a service layer could enforce by discipline
-- alone. It is here instead because discipline is invisible when it lapses: a
-- missed call site silently writes to an approved payroll and nothing says so.
-- Every trigger below has a provocation test asserting the message it raises.

-- ---------------------------------------------------------------------------
-- 1. Nothing calculation-relevant changes once a run is APPROVED or CLOSED.
-- ---------------------------------------------------------------------------

CREATE FUNCTION enforce_run_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_line_id uuid;
  run_id_of_line text;
  current_status run_status;
BEGIN
  -- The row carries either a run id (pay_lines) or a line id (everything else).
  IF TG_TABLE_NAME = 'pay_lines' THEN
    run_id_of_line := COALESCE(NEW.run_id, OLD.run_id);
  ELSE
    target_line_id := COALESCE(NEW.line_id, OLD.line_id);
    SELECT pay_lines.run_id INTO run_id_of_line
      FROM pay_lines WHERE pay_lines.id = target_line_id;
  END IF;

  IF run_id_of_line IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT pay_runs.status INTO current_status
    FROM pay_runs WHERE pay_runs.id = run_id_of_line;

  IF current_status IN ('APPROVED', 'CLOSED') THEN
    RAISE EXCEPTION
      'run % is %: its calculation is frozen and % on % is not allowed',
      run_id_of_line, current_status, TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

--> statement-breakpoint
CREATE TRIGGER pay_lines_immutable_past_approval
  BEFORE INSERT OR UPDATE OR DELETE ON pay_lines
  FOR EACH ROW EXECUTE FUNCTION enforce_run_immutability();

--> statement-breakpoint
CREATE TRIGGER pay_line_items_immutable_past_approval
  BEFORE INSERT OR UPDATE OR DELETE ON pay_line_items
  FOR EACH ROW EXECUTE FUNCTION enforce_run_immutability();

--> statement-breakpoint
CREATE TRIGGER pay_line_overrides_immutable_past_approval
  BEFORE INSERT OR UPDATE OR DELETE ON pay_line_overrides
  FOR EACH ROW EXECUTE FUNCTION enforce_run_immutability();

--> statement-breakpoint
CREATE TRIGGER pcb_entries_immutable_past_approval
  BEFORE INSERT OR UPDATE OR DELETE ON pcb_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_run_immutability();

-- ---------------------------------------------------------------------------
-- 2. Run status moves only along the lifecycle.
--
-- DRAFT -> REVIEWED -> APPROVED -> CLOSED, plus the REVIEWED -> DRAFT demotion
-- that the spec's atomic edit transaction performs when a calculation-affecting
-- change lands on a reviewed run. Everything else raises.
-- ---------------------------------------------------------------------------

--> statement-breakpoint
CREATE FUNCTION enforce_run_status_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status, NEW.status) IN (
    ('DRAFT',    'REVIEWED'),
    ('REVIEWED', 'APPROVED'),
    ('APPROVED', 'CLOSED'),
    ('REVIEWED', 'DRAFT')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'run % cannot move from % to %', OLD.id, OLD.status, NEW.status
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

--> statement-breakpoint
CREATE TRIGGER pay_runs_status_forward_only
  BEFORE UPDATE OF status ON pay_runs
  FOR EACH ROW EXECUTE FUNCTION enforce_run_status_transition();

-- ---------------------------------------------------------------------------
-- 3. A pay item's identity is fixed; deletion is always soft.
--
-- Changing a code or a kind reclassifies every historical line that references
-- it. The path is to deactivate the item and create a new one.
-- ---------------------------------------------------------------------------

--> statement-breakpoint
CREATE FUNCTION enforce_pay_item_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'pay item % cannot be deleted: deactivate it instead (active = false)', OLD.code
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION
      'pay item code is immutable (% -> %): historical lines cite it', OLD.code, NEW.code
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.kind IS DISTINCT FROM OLD.kind THEN
    RAISE EXCEPTION
      'pay item % kind is immutable (% -> %): changing it reclassifies history',
      OLD.code, OLD.kind, NEW.kind
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD.is_system AND NOT NEW.active THEN
    RAISE EXCEPTION 'pay item % is a system item and cannot be deactivated', OLD.code
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE TRIGGER pay_items_identity_immutable
  BEFORE UPDATE OR DELETE ON pay_items
  FOR EACH ROW EXECUTE FUNCTION enforce_pay_item_identity();

-- ---------------------------------------------------------------------------
-- 4. An employment's items must fit both the item and the employment.
--
-- Two checks, both needing a join, which is why this is not a CHECK constraint:
--   rate shape          -- a rate for quantity bases, an amount for the rest
--   pay-basis fit       -- a daily-rated employment cannot carry a monthly item
-- ---------------------------------------------------------------------------

--> statement-breakpoint
CREATE FUNCTION enforce_employment_item_compatibility() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  item_basis rate_basis;
  item_code text;
  employment_basis pay_basis;
BEGIN
  SELECT pay_items.rate_basis, pay_items.code INTO item_basis, item_code
    FROM pay_items WHERE pay_items.id = NEW.pay_item_id;

  SELECT employments.pay_basis INTO employment_basis
    FROM employments WHERE employments.id = NEW.employment_id;

  -- A monthly figure cannot describe what a daily-rated employment earns: there
  -- is no month to pay it against. The fix is a daily variant of the item, not a
  -- looser rule here.
  IF employment_basis = 'DAILY' AND item_basis = 'FIXED_MONTHLY' THEN
    RAISE EXCEPTION
      'pay item % is FIXED_MONTHLY and cannot be assigned to a DAILY employment: use a per-day item',
      item_code
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF item_basis IN ('PER_DAY', 'PER_HOUR', 'PER_UNIT') THEN
    IF NEW.rate_sen IS NULL OR NEW.amount_sen IS NOT NULL THEN
      RAISE EXCEPTION
        'pay item % is %: it needs rate_sen and no amount_sen', item_code, item_basis
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  ELSIF NEW.amount_sen IS NULL OR NEW.rate_sen IS NOT NULL THEN
    RAISE EXCEPTION
      'pay item % is %: it needs amount_sen and no rate_sen', item_code, item_basis
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE TRIGGER employment_pay_items_compatible
  BEFORE INSERT OR UPDATE ON employment_pay_items
  FOR EACH ROW EXECUTE FUNCTION enforce_employment_item_compatibility();

-- ---------------------------------------------------------------------------
-- 5. The audit log only ever grows.
-- ---------------------------------------------------------------------------

--> statement-breakpoint
CREATE FUNCTION enforce_audit_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION enforce_audit_append_only();
