CREATE TYPE "public"."artifact_entity_type" AS ENUM('TRANSFER', 'EMPLOYMENT_PRIOR_YTD', 'PAY_RUN', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."artifact_type" AS ENUM('EVIDENCE', 'PAYMENT_REGISTER', 'BANK_FILE', 'CASH_SHEET', 'PAYSLIP_PDF', 'MANIFEST', 'EXCEPTION_REPORT');--> statement-breakpoint
CREATE TYPE "public"."artifact_source" AS ENUM('ATTACHED', 'GENERATED');--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text,
	"entity_type" "artifact_entity_type" NOT NULL,
	"entity_id" text,
	"type" "artifact_type" DEFAULT 'EVIDENCE' NOT NULL,
	"relative_path" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"source" "artifact_source" DEFAULT 'ATTACHED' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_id_pay_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pay_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_run" ON "artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "artifacts_entity" ON "artifacts" USING btree ("entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "evidence_artifact_id" uuid;--> statement-breakpoint
ALTER TABLE "employment_prior_ytd" ADD COLUMN "evidence_artifact_id" uuid;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_evidence_artifact_id_artifacts_id_fk" FOREIGN KEY ("evidence_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_prior_ytd" ADD CONSTRAINT "employment_prior_ytd_evidence_artifact_id_artifacts_id_fk" FOREIGN KEY ("evidence_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;
