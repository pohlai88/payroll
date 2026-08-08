-- `enforce_employment_item_compatibility` (0001, trigger 4) only checks a
-- FIXED_MONTHLY/DAILY conflict when an employment_pay_items row is
-- inserted or updated — it never re-fires if the *employment* is later
-- reclassified from MONTHLY to DAILY. An existing FIXED_MONTHLY assignment
-- would then silently become invalid per the same rule and keep defaulting
-- onto every future run's line items.
--
-- Same policy as trigger 4: the fix is a daily variant of the item, not a
-- looser rule here, so this refuses the pay_basis change rather than
-- silently deactivating the offending assignment.

CREATE FUNCTION enforce_employment_pay_basis_change_compatibility() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  offending_codes text;
BEGIN
  IF NEW.pay_basis = 'DAILY' AND NEW.pay_basis IS DISTINCT FROM OLD.pay_basis THEN
    SELECT string_agg(pay_items.code, ', ' ORDER BY pay_items.code)
      INTO offending_codes
      FROM employment_pay_items
      JOIN pay_items ON pay_items.id = employment_pay_items.pay_item_id
     WHERE employment_pay_items.employment_id = NEW.id
       AND employment_pay_items.active
       AND pay_items.rate_basis = 'FIXED_MONTHLY';

    IF offending_codes IS NOT NULL THEN
      RAISE EXCEPTION
        'employment % cannot become DAILY while assigned FIXED_MONTHLY item(s) (%): remove or replace them with a per-day variant first',
        NEW.employee_code, offending_codes
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER employments_pay_basis_change_compatible
  BEFORE UPDATE OF pay_basis ON employments
  FOR EACH ROW EXECUTE FUNCTION enforce_employment_pay_basis_change_compatibility();
