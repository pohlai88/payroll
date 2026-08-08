CREATE TYPE "public"."group_service_continuity" AS ENUM('CONTINUOUS', 'RESET');--> statement-breakpoint
CREATE TYPE "public"."termination_reason" AS ENUM('RESIGNATION', 'DISMISSAL', 'CONTRACT_END', 'INTERNAL_GROUP_TRANSFER', 'RETIREMENT', 'OTHER');--> statement-breakpoint
CREATE TABLE "employment_prior_ytd" (
	"employment_id" uuid NOT NULL,
	"calendar_year" integer NOT NULL,
	"gross_sen" bigint DEFAULT 0 NOT NULL,
	"epf_ee_sen" bigint DEFAULT 0 NOT NULL,
	"epf_er_sen" bigint DEFAULT 0 NOT NULL,
	"socso_ee_sen" bigint DEFAULT 0 NOT NULL,
	"socso_er_sen" bigint DEFAULT 0 NOT NULL,
	"eis_ee_sen" bigint DEFAULT 0 NOT NULL,
	"eis_er_sen" bigint DEFAULT 0 NOT NULL,
	"pcb_sen" bigint DEFAULT 0 NOT NULL,
	"zakat_sen" bigint DEFAULT 0 NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"source" text,
	"evidence_ref" text,
	"entered_by" text,
	"entered_at" timestamp with time zone,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	CONSTRAINT "employment_prior_ytd_employment_id_calendar_year_pk" PRIMARY KEY("employment_id","calendar_year"),
	CONSTRAINT "employment_prior_ytd_year_plausible" CHECK ("employment_prior_ytd"."calendar_year" >= 2000),
	CONSTRAINT "employment_prior_ytd_amounts_non_negative" CHECK ("employment_prior_ytd"."gross_sen" >= 0 AND "employment_prior_ytd"."epf_ee_sen" >= 0 AND "employment_prior_ytd"."epf_er_sen" >= 0
          AND "employment_prior_ytd"."socso_ee_sen" >= 0 AND "employment_prior_ytd"."socso_er_sen" >= 0
          AND "employment_prior_ytd"."eis_ee_sen" >= 0 AND "employment_prior_ytd"."eis_er_sen" >= 0
          AND "employment_prior_ytd"."pcb_sen" >= 0 AND "employment_prior_ytd"."zakat_sen" >= 0),
	CONSTRAINT "employment_prior_ytd_verified_needs_source" CHECK (NOT "employment_prior_ytd"."verified" OR "employment_prior_ytd"."source" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"from_employment_id" uuid NOT NULL,
	"to_employment_id" uuid NOT NULL,
	"effective_date" date NOT NULL,
	"group_service_continuity" "group_service_continuity" NOT NULL,
	"continuity_reason" text,
	"leave_benefit_treatment_note" text,
	"allowed_overlap" boolean DEFAULT false NOT NULL,
	"overlap_reason" text,
	"evidence_ref" text,
	"final_pay_run_id" text,
	"commencement_run_id" text,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfers_to_employment_id_unique" UNIQUE("to_employment_id"),
	CONSTRAINT "transfers_continuity_reason_required_on_reset" CHECK (("transfers"."group_service_continuity" != 'RESET') OR (length(btrim("transfers"."continuity_reason")) > 0)),
	CONSTRAINT "transfers_overlap_reason_required_when_allowed" CHECK ((NOT "transfers"."allowed_overlap") OR (length(btrim("transfers"."overlap_reason")) > 0))
);
--> statement-breakpoint
ALTER TABLE "employments" ALTER COLUMN "termination_reason" SET DATA TYPE "public"."termination_reason" USING "termination_reason"::"public"."termination_reason";--> statement-breakpoint
ALTER TABLE "employments" ADD COLUMN "prior_employment_id" uuid;--> statement-breakpoint
ALTER TABLE "employment_prior_ytd" ADD CONSTRAINT "employment_prior_ytd_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_employment_id_employments_id_fk" FOREIGN KEY ("from_employment_id") REFERENCES "public"."employments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_employment_id_employments_id_fk" FOREIGN KEY ("to_employment_id") REFERENCES "public"."employments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_final_pay_run_id_pay_runs_id_fk" FOREIGN KEY ("final_pay_run_id") REFERENCES "public"."pay_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_commencement_run_id_pay_runs_id_fk" FOREIGN KEY ("commencement_run_id") REFERENCES "public"."pay_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfers_person" ON "transfers" USING btree ("person_id");--> statement-breakpoint
ALTER TABLE "employments" ADD CONSTRAINT "employments_prior_employment_id_employments_id_fk" FOREIGN KEY ("prior_employment_id") REFERENCES "public"."employments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employments" ADD CONSTRAINT "employments_termination_reason_matches_date" CHECK (("employments"."termination_date" IS NULL) = ("employments"."termination_reason" IS NULL));