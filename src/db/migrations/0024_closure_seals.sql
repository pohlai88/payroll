-- The closure chain: our own attestation, since no third party signs for us.
--
-- Each closed run gets one seal whose hash covers the manifest hash, the
-- revisions, who closed it and when, and the hash of the previous closure in
-- the same company. Editing any closed run's facts therefore requires
-- reissuing that seal and every seal after it — and the table below refuses
-- both UPDATE and DELETE outright, to every role the application has. The
-- chain is only evidence for as long as it cannot be rewritten in place.
CREATE TABLE "closure_seals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" text NOT NULL,
  "company_id" uuid NOT NULL,
  "sequence" integer NOT NULL,
  "manifest_sha256" text NOT NULL,
  "manifest_artifact_id" uuid NOT NULL,
  "calc_revision" text,
  "approved_revision" text,
  "closed_at" timestamp with time zone NOT NULL,
  "closed_by" text NOT NULL,
  "previous_seal_hash" text,
  "seal_hash" text NOT NULL,
  "seal_version" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "closure_seals_run_unique" UNIQUE("run_id"),
  CONSTRAINT "closure_seals_company_sequence_unique" UNIQUE("company_id","sequence"),
  CONSTRAINT "closure_seals_company_previous_unique" UNIQUE("company_id","previous_seal_hash"),
  CONSTRAINT "closure_seals_sequence_positive" CHECK ("closure_seals"."sequence" >= 1),
  CONSTRAINT "closure_seals_genesis_has_no_link" CHECK (("closure_seals"."sequence" = 1) = ("closure_seals"."previous_seal_hash" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "closure_seals" ADD CONSTRAINT "closure_seals_run_id_pay_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pay_runs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "closure_seals" ADD CONSTRAINT "closure_seals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "closure_seals_company_sequence" ON "closure_seals" USING btree ("company_id","sequence");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_seal_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'closure_seals is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER closure_seals_append_only
BEFORE UPDATE OR DELETE ON "closure_seals"
FOR EACH ROW EXECUTE FUNCTION enforce_seal_append_only();
