-- Phase 6–7 lean control: gates, payments, release, distributions, closure cols.

CREATE TYPE "public"."line_payment_state" AS ENUM(
  'READY', 'HOLD', 'RELEASED', 'PAID', 'FAILED_RETURNED', 'RECONCILED', 'WITHDRAWN'
);--> statement-breakpoint

CREATE TYPE "public"."withdrawal_reason" AS ENUM(
  'MOVED_TO_OFFCYCLE',
  'DUPLICATE_LINE',
  'EMPLOYEE_NOT_PAYABLE',
  'PAYMENT_CANCELLED_BY_AUTHORITY',
  'OTHER_CONTROLLED_EXCEPTION'
);--> statement-breakpoint

CREATE TYPE "public"."release_method" AS ENUM('BANK', 'CASH');--> statement-breakpoint

CREATE TYPE "public"."release_batch_status" AS ENUM(
  'OPEN', 'SETTLED', 'PARTIALLY_SETTLED', 'SETTLED_WITH_FAILURES', 'CANCELLED'
);--> statement-breakpoint

CREATE TYPE "public"."payment_attempt_status" AS ENUM('PENDING', 'PAID', 'FAILED');--> statement-breakpoint

CREATE TYPE "public"."distribution_channel" AS ENUM(
  'GENERATED', 'SENT', 'DELIVERED', 'HANDED', 'PRINTED'
);--> statement-breakpoint

CREATE TYPE "public"."gate_kind" AS ENUM('REVIEW', 'APPROVAL', 'RELEASE', 'CLOSE');--> statement-breakpoint

ALTER TABLE "pay_runs" ADD COLUMN "closed_manifest_artifact_id" uuid;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD COLUMN "closed_by" text;--> statement-breakpoint

CREATE TABLE "gate_certifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" text NOT NULL,
  "gate" "gate_kind" NOT NULL,
  "calc_revision" text NOT NULL,
  "statutory_pack_id" text NOT NULL,
  "anomaly_pack_version" text NOT NULL,
  "actor" text NOT NULL,
  "at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "gate_certifications" ADD CONSTRAINT "gate_certifications_run_id_pay_runs_id_fk"
  FOREIGN KEY ("run_id") REFERENCES "public"."pay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_certifications" ADD CONSTRAINT "gate_certifications_run_gate_revision"
  UNIQUE ("run_id", "gate", "calc_revision");--> statement-breakpoint
CREATE INDEX "gate_certifications_run" ON "gate_certifications" USING btree ("run_id");--> statement-breakpoint

CREATE TABLE "line_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "line_id" uuid NOT NULL,
  "state" "line_payment_state" DEFAULT 'READY' NOT NULL,
  "hold_reason" text,
  "released_at" timestamp with time zone,
  "release_batch_id" text,
  "paid_at" timestamp with time zone,
  "payment_ref" text,
  "failed_reason" text,
  "reconciled_at" timestamp with time zone,
  "recon_evidence_artifact_id" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "line_payments_line_id_unique" UNIQUE ("line_id")
);--> statement-breakpoint

ALTER TABLE "line_payments" ADD CONSTRAINT "line_payments_line_id_pay_lines_id_fk"
  FOREIGN KEY ("line_id") REFERENCES "public"."pay_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_payments" ADD CONSTRAINT "line_payments_recon_evidence_artifact_id_artifacts_id_fk"
  FOREIGN KEY ("recon_evidence_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "line_payments_state" ON "line_payments" USING btree ("state");--> statement-breakpoint

CREATE TABLE "withdrawals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "line_id" uuid NOT NULL,
  "reason_code" "withdrawal_reason" NOT NULL,
  "note" text NOT NULL,
  "actor" text NOT NULL,
  "at" timestamp with time zone DEFAULT now() NOT NULL,
  "post_approval_approver" text,
  "replacement_run_id" text,
  CONSTRAINT "withdrawals_line_id_unique" UNIQUE ("line_id"),
  CONSTRAINT "withdrawals_note_not_blank" CHECK (length(btrim("note")) > 0)
);--> statement-breakpoint

ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_line_id_pay_lines_id_fk"
  FOREIGN KEY ("line_id") REFERENCES "public"."pay_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_replacement_run_id_pay_runs_id_fk"
  FOREIGN KEY ("replacement_run_id") REFERENCES "public"."pay_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "release_batches" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL,
  "method" "release_method" NOT NULL,
  "status" "release_batch_status" DEFAULT 'OPEN' NOT NULL,
  "total_sen" bigint NOT NULL,
  "line_count" integer NOT NULL,
  "register_artifact_id" uuid,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "release_batches_line_count_positive" CHECK ("line_count" > 0)
);--> statement-breakpoint

ALTER TABLE "release_batches" ADD CONSTRAINT "release_batches_run_id_pay_runs_id_fk"
  FOREIGN KEY ("run_id") REFERENCES "public"."pay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_batches" ADD CONSTRAINT "release_batches_register_artifact_id_artifacts_id_fk"
  FOREIGN KEY ("register_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "release_batches_run" ON "release_batches" USING btree ("run_id");--> statement-breakpoint

CREATE TABLE "payment_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "batch_id" text NOT NULL,
  "line_id" uuid NOT NULL,
  "amount_sen" bigint NOT NULL,
  "bank_snapshot" jsonb NOT NULL,
  "status" "payment_attempt_status" DEFAULT 'PENDING' NOT NULL,
  "failed_reason" text,
  "settled_at" timestamp with time zone,
  "payment_ref" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_batch_id_release_batches_id_fk"
  FOREIGN KEY ("batch_id") REFERENCES "public"."release_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_line_id_pay_lines_id_fk"
  FOREIGN KEY ("line_id") REFERENCES "public"."pay_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_attempts_batch" ON "payment_attempts" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_line" ON "payment_attempts" USING btree ("line_id");--> statement-breakpoint

CREATE TABLE "distributions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "line_id" uuid NOT NULL,
  "channel" "distribution_channel" NOT NULL,
  "artifact_id" uuid,
  "actor" text NOT NULL,
  "at" timestamp with time zone DEFAULT now() NOT NULL,
  "note" text
);--> statement-breakpoint

ALTER TABLE "distributions" ADD CONSTRAINT "distributions_line_id_pay_lines_id_fk"
  FOREIGN KEY ("line_id") REFERENCES "public"."pay_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_artifact_id_artifacts_id_fk"
  FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "distributions_line" ON "distributions" USING btree ("line_id");--> statement-breakpoint

ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_closed_manifest_artifact_id_artifacts_id_fk"
  FOREIGN KEY ("closed_manifest_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Freeze payment / distribution / artifact rows once the run is CLOSED.
CREATE FUNCTION enforce_control_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_run_id text;
  current_status run_status;
BEGIN
  IF TG_TABLE_NAME = 'artifacts' THEN
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
$$;--> statement-breakpoint

CREATE TRIGGER line_payments_immutable_when_closed
  BEFORE INSERT OR UPDATE OR DELETE ON line_payments
  FOR EACH ROW EXECUTE FUNCTION enforce_control_immutability();--> statement-breakpoint

CREATE TRIGGER withdrawals_immutable_when_closed
  BEFORE INSERT OR UPDATE OR DELETE ON withdrawals
  FOR EACH ROW EXECUTE FUNCTION enforce_control_immutability();--> statement-breakpoint

CREATE TRIGGER release_batches_immutable_when_closed
  BEFORE INSERT OR UPDATE OR DELETE ON release_batches
  FOR EACH ROW EXECUTE FUNCTION enforce_control_immutability();--> statement-breakpoint

CREATE TRIGGER payment_attempts_immutable_when_closed
  BEFORE INSERT OR UPDATE OR DELETE ON payment_attempts
  FOR EACH ROW EXECUTE FUNCTION enforce_control_immutability();--> statement-breakpoint

CREATE TRIGGER distributions_immutable_when_closed
  BEFORE INSERT OR UPDATE OR DELETE ON distributions
  FOR EACH ROW EXECUTE FUNCTION enforce_control_immutability();--> statement-breakpoint

CREATE TRIGGER artifacts_immutable_when_closed
  BEFORE INSERT OR UPDATE OR DELETE ON artifacts
  FOR EACH ROW EXECUTE FUNCTION enforce_control_immutability();--> statement-breakpoint

CREATE TRIGGER gate_certifications_immutable_when_closed
  BEFORE INSERT OR UPDATE OR DELETE ON gate_certifications
  FOR EACH ROW EXECUTE FUNCTION enforce_control_immutability();
