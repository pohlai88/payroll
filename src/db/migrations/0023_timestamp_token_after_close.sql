-- One write a CLOSED run accepts: an RFC 3161 token.
--
-- A token attests to bytes that are already frozen — it cannot move a figure,
-- and its whole value is that it is signed by someone other than us. It has to
-- be insertable after closure for two reasons the close transaction cannot
-- cover: the authority may have been unreachable at the time, and long-term
-- archival wants a fresh token years later, before the old one's algorithms
-- age out. Updating or deleting an artifact of a closed run stays forbidden,
-- as does inserting an artifact of any other type.
CREATE OR REPLACE FUNCTION enforce_control_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_run_id text;
  current_status run_status;
BEGIN
  IF TG_TABLE_NAME = 'artifacts' THEN
    IF TG_OP = 'INSERT' AND NEW.type::text = 'TIMESTAMP_TOKEN' THEN
      RETURN NEW;
    END IF;
    target_run_id := COALESCE(NEW.run_id, OLD.run_id);
  ELSIF TG_TABLE_NAME = 'release_batches' THEN
    target_run_id := COALESCE(NEW.run_id, OLD.run_id);
  ELSIF TG_TABLE_NAME = 'gate_certifications' THEN
    target_run_id := COALESCE(NEW.run_id, OLD.run_id);
  ELSIF TG_TABLE_NAME IN ('line_payments', 'withdrawals', 'distributions') THEN
    SELECT pay_lines.run_id INTO target_run_id
      FROM pay_lines
     WHERE pay_lines.id = COALESCE(NEW.line_id, OLD.line_id);
  ELSIF TG_TABLE_NAME = 'payment_attempts' THEN
    SELECT release_batches.run_id INTO target_run_id
      FROM release_batches
     WHERE release_batches.id = COALESCE(NEW.batch_id, OLD.batch_id);
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF target_run_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT pay_runs.status INTO current_status
    FROM pay_runs WHERE pay_runs.id = target_run_id;

  IF current_status = 'CLOSED' THEN
    RAISE EXCEPTION
      'run % is CLOSED: % on % is not allowed',
      target_run_id, TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
