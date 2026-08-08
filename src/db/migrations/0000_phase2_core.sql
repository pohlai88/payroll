CREATE TYPE "public"."epf_part" AS ENUM('A', 'C', 'E', 'F', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."offcycle_reason" AS ENUM('CORRECTION', 'ARREARS', 'BONUS', 'MISSED_PAYMENT', 'FINAL_PAYMENT');--> statement-breakpoint
CREATE TYPE "public"."override_field" AS ENUM('EPF_EE', 'EPF_ER', 'SOCSO_EE_CORE', 'SOCSO_EE_SKBBK', 'SOCSO_ER', 'EIS_EE', 'EIS_ER', 'EPF_WAGES', 'SOCSO_WAGES', 'EIS_WAGES');--> statement-breakpoint
CREATE TYPE "public"."pay_basis" AS ENUM('MONTHLY', 'DAILY', 'HOURLY');--> statement-breakpoint
CREATE TYPE "public"."pay_item_kind" AS ENUM('EARNING', 'DEDUCTION');--> statement-breakpoint
CREATE TYPE "public"."rate_basis" AS ENUM('FIXED_MONTHLY', 'PER_DAY', 'PER_HOUR', 'PER_UNIT', 'AMOUNT');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('DRAFT', 'REVIEWED', 'APPROVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."run_type" AS ENUM('REGULAR', 'OFFCYCLE');--> statement-breakpoint
CREATE TYPE "public"."socso_category" AS ENUM('FIRST', 'SECOND', 'NONE');--> statement-breakpoint
CREATE TABLE "employment_pay_items" (
	"employment_id" uuid NOT NULL,
	"pay_item_id" uuid NOT NULL,
	"rate_sen" bigint,
	"amount_sen" bigint,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "employment_pay_items_employment_id_pay_item_id_pk" PRIMARY KEY("employment_id","pay_item_id"),
	CONSTRAINT "employment_pay_items_rate_non_negative" CHECK ("employment_pay_items"."rate_sen" IS NULL OR "employment_pay_items"."rate_sen" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pay_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ms" text NOT NULL,
	"kind" "pay_item_kind" NOT NULL,
	"rate_basis" "rate_basis" NOT NULL,
	"default_rate_sen" bigint,
	"epf_wages" boolean NOT NULL,
	"socso_wages" boolean NOT NULL,
	"eis_wages" boolean NOT NULL,
	"prorates" boolean DEFAULT false NOT NULL,
	"taxable" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "pay_items_code_unique" UNIQUE("code"),
	CONSTRAINT "pay_items_code_not_blank" CHECK (length(btrim("pay_items"."code")) > 0),
	CONSTRAINT "pay_items_default_rate_non_negative" CHECK ("pay_items"."default_rate_sen" IS NULL OR "pay_items"."default_rate_sen" >= 0)
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"epf_no" text,
	"socso_no" text,
	"lhdn_no" text,
	"hrdf_enabled" boolean DEFAULT false NOT NULL,
	"hrdf_levy_pct" numeric(6, 4) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_code_unique" UNIQUE("code"),
	CONSTRAINT "companies_code_not_blank" CHECK (length(btrim("companies"."code")) > 0),
	CONSTRAINT "companies_hrdf_levy_pct_sane" CHECK ("companies"."hrdf_levy_pct" >= 0 AND "companies"."hrdf_levy_pct" <= 100)
);
--> statement-breakpoint
CREATE TABLE "employments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_code" text NOT NULL,
	"join_date" date NOT NULL,
	"termination_date" date,
	"termination_reason" text,
	"pay_basis" "pay_basis" NOT NULL,
	"base_rate_sen" bigint NOT NULL,
	"is_malaysian" boolean DEFAULT true NOT NULL,
	"is_permanent_resident" boolean DEFAULT false NOT NULL,
	"epf_applicable" boolean DEFAULT true NOT NULL,
	"socso_applicable" boolean DEFAULT true NOT NULL,
	"eis_applicable" boolean DEFAULT true NOT NULL,
	"pcb_applicable" boolean DEFAULT true NOT NULL,
	"epf_member_before_aug_1998" boolean,
	"eis_prior_contribution" boolean,
	"epf_part_override" "epf_part",
	"socso_category_override" "socso_category",
	"epf_no" text,
	"socso_no" text,
	"tin" text,
	"bank_name" text,
	"bank_account_no" text,
	"bank_account_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employments_company_code_unique" UNIQUE("company_id","employee_code"),
	CONSTRAINT "employments_employee_code_not_blank" CHECK (length(btrim("employments"."employee_code")) > 0),
	CONSTRAINT "employments_termination_after_join" CHECK ("employments"."termination_date" IS NULL OR "employments"."termination_date" >= "employments"."join_date"),
	CONSTRAINT "employments_base_rate_non_negative" CHECK ("employments"."base_rate_sen" >= 0)
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ic" text,
	"passport" text,
	"dob" date,
	"nationality" text,
	"group_service_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "persons_name_not_blank" CHECK (length(btrim("persons"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "eis_bands" (
	"rule_pack_id" text NOT NULL,
	"from_sen" bigint NOT NULL,
	"to_sen" bigint NOT NULL,
	"er_sen" bigint NOT NULL,
	"ee_sen" bigint NOT NULL,
	CONSTRAINT "eis_bands_rule_pack_id_from_sen_pk" PRIMARY KEY("rule_pack_id","from_sen"),
	CONSTRAINT "eis_bands_range_ordered" CHECK ("eis_bands"."to_sen" >= "eis_bands"."from_sen"),
	CONSTRAINT "eis_bands_amounts_non_negative" CHECK ("eis_bands"."from_sen" >= 0 AND "eis_bands"."er_sen" >= 0 AND "eis_bands"."ee_sen" >= 0)
);
--> statement-breakpoint
CREATE TABLE "epf_bands" (
	"rule_pack_id" text NOT NULL,
	"part" "epf_part" NOT NULL,
	"from_sen" bigint NOT NULL,
	"to_sen" bigint NOT NULL,
	"er_sen" bigint NOT NULL,
	"ee_sen" bigint NOT NULL,
	CONSTRAINT "epf_bands_rule_pack_id_part_from_sen_pk" PRIMARY KEY("rule_pack_id","part","from_sen"),
	CONSTRAINT "epf_bands_range_ordered" CHECK ("epf_bands"."to_sen" >= "epf_bands"."from_sen"),
	CONSTRAINT "epf_bands_amounts_non_negative" CHECK ("epf_bands"."from_sen" >= 0 AND "epf_bands"."er_sen" >= 0 AND "epf_bands"."ee_sen" >= 0),
	CONSTRAINT "epf_bands_part_has_schedule" CHECK ("epf_bands"."part" IN ('A', 'C', 'E'))
);
--> statement-breakpoint
CREATE TABLE "rule_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_settings" (
	"rule_pack_id" text PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_sources" (
	"rule_pack_id" text NOT NULL,
	"ref" text NOT NULL,
	"issuer" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"retrieved_at" date NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_sources_rule_pack_id_ref_pk" PRIMARY KEY("rule_pack_id","ref"),
	CONSTRAINT "rule_sources_sha256_is_hex" CHECK ("rule_sources"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "seed_files" (
	"file_name" text PRIMARY KEY NOT NULL,
	"sha256" text NOT NULL,
	"byte_size" integer NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seed_files_sha256_is_hex" CHECK ("seed_files"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "seed_files_byte_size_positive" CHECK ("seed_files"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "socso_bands" (
	"rule_pack_id" text NOT NULL,
	"from_sen" bigint NOT NULL,
	"to_sen" bigint NOT NULL,
	"cat1_er_sen" bigint NOT NULL,
	"cat1_ee_core_sen" bigint NOT NULL,
	"cat1_ee_skbbk_sen" bigint NOT NULL,
	"cat2_er_sen" bigint NOT NULL,
	"cat2_ee_skbbk_sen" bigint NOT NULL,
	CONSTRAINT "socso_bands_rule_pack_id_from_sen_pk" PRIMARY KEY("rule_pack_id","from_sen"),
	CONSTRAINT "socso_bands_range_ordered" CHECK ("socso_bands"."to_sen" >= "socso_bands"."from_sen"),
	CONSTRAINT "socso_bands_amounts_non_negative" CHECK ("socso_bands"."from_sen" >= 0 AND "socso_bands"."cat1_er_sen" >= 0 AND "socso_bands"."cat1_ee_core_sen" >= 0
          AND "socso_bands"."cat1_ee_skbbk_sen" >= 0 AND "socso_bands"."cat2_er_sen" >= 0 AND "socso_bands"."cat2_ee_skbbk_sen" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"run_id" text,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"bulk_operation_id" uuid
);
--> statement-breakpoint
CREATE TABLE "pay_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"pay_item_id" uuid,
	"item_code_snap" text NOT NULL,
	"kind_snap" "pay_item_kind" NOT NULL,
	"basis_snap" "rate_basis" NOT NULL,
	"name_en_snap" text NOT NULL,
	"name_ms_snap" text NOT NULL,
	"epf_wages_snap" boolean NOT NULL,
	"socso_wages_snap" boolean NOT NULL,
	"eis_wages_snap" boolean NOT NULL,
	"prorates_snap" boolean NOT NULL,
	"sort_snap" integer DEFAULT 0 NOT NULL,
	"quantity" numeric(10, 4),
	"rate_sen" bigint,
	"amount_sen" bigint,
	"resolved_amount_sen" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_line_items_shape_matches_basis" CHECK (("pay_line_items"."quantity" IS NULL AND "pay_line_items"."rate_sen" IS NULL AND "pay_line_items"."amount_sen" IS NOT NULL)
          = ("pay_line_items"."basis_snap" IN ('AMOUNT', 'FIXED_MONTHLY'))),
	CONSTRAINT "pay_line_items_quantity_shape_complete" CHECK (("pay_line_items"."basis_snap" IN ('AMOUNT', 'FIXED_MONTHLY'))
          OR ("pay_line_items"."quantity" IS NOT NULL AND "pay_line_items"."rate_sen" IS NOT NULL AND "pay_line_items"."amount_sen" IS NULL)),
	CONSTRAINT "pay_line_items_rate_non_negative" CHECK ("pay_line_items"."rate_sen" IS NULL OR "pay_line_items"."rate_sen" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pay_line_overrides" (
	"line_id" uuid NOT NULL,
	"field" "override_field" NOT NULL,
	"override_sen" bigint NOT NULL,
	"reason" text NOT NULL,
	"actor" text NOT NULL,
	"approved_by" text,
	"evidence_ref" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_line_overrides_line_id_field_pk" PRIMARY KEY("line_id","field"),
	CONSTRAINT "pay_line_overrides_reason_not_blank" CHECK (length(btrim("pay_line_overrides"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "pay_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"employment_id" uuid NOT NULL,
	"employee_snapshot" jsonb NOT NULL,
	"working_days" integer NOT NULL,
	"paid_days" numeric(10, 4),
	"hours_worked" numeric(10, 4),
	"period_end" date NOT NULL,
	"gross_sen" bigint,
	"epf_wages_sen" bigint,
	"socso_wages_sen" bigint,
	"eis_wages_sen" bigint,
	"epf_ee_sen" bigint,
	"epf_er_sen" bigint,
	"socso_ee_core_sen" bigint,
	"socso_ee_skbbk_sen" bigint,
	"socso_er_sen" bigint,
	"eis_ee_sen" bigint,
	"eis_er_sen" bigint,
	"pcb_net_sen" bigint,
	"cp38_sen" bigint,
	"zakat_sen" bigint,
	"other_deductions_sen" bigint,
	"deductions_total_sen" bigint,
	"net_sen" bigint,
	"hrdf_sen" bigint,
	"employer_cost_sen" bigint,
	"trace" jsonb,
	"computed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_lines_run_employment_unique" UNIQUE("run_id","employment_id"),
	CONSTRAINT "pay_lines_paid_days_within_period" CHECK ("pay_lines"."paid_days" IS NULL OR ("pay_lines"."paid_days" >= 0 AND "pay_lines"."paid_days" <= "pay_lines"."working_days")),
	CONSTRAINT "pay_lines_hours_non_negative" CHECK ("pay_lines"."hours_worked" IS NULL OR "pay_lines"."hours_worked" >= 0),
	CONSTRAINT "pay_lines_working_days_valid" CHECK ("pay_lines"."working_days" BETWEEN 1 AND 31)
);
--> statement-breakpoint
CREATE TABLE "pay_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"run_type" "run_type" DEFAULT 'REGULAR' NOT NULL,
	"offcycle_reason" "offcycle_reason",
	"linked_run_id" text,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"working_days" integer NOT NULL,
	"rule_pack_id" text NOT NULL,
	"status" "run_status" DEFAULT 'DRAFT' NOT NULL,
	"calc_revision" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewed_revision" text,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"approved_revision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "pay_runs_offcycle_has_reason" CHECK (("pay_runs"."run_type" = 'OFFCYCLE') = ("pay_runs"."offcycle_reason" IS NOT NULL)),
	CONSTRAINT "pay_runs_period_ordered" CHECK ("pay_runs"."period_end" >= "pay_runs"."period_start"),
	CONSTRAINT "pay_runs_month_valid" CHECK ("pay_runs"."month" BETWEEN 1 AND 12),
	CONSTRAINT "pay_runs_year_valid" CHECK ("pay_runs"."year" BETWEEN 2000 AND 2999),
	CONSTRAINT "pay_runs_working_days_valid" CHECK ("pay_runs"."working_days" BETWEEN 1 AND 31)
);
--> statement-breakpoint
CREATE TABLE "pcb_entries" (
	"line_id" uuid PRIMARY KEY NOT NULL,
	"pcb_amount_sen" bigint,
	"cp38_sen" bigint DEFAULT 0 NOT NULL,
	"zakat_offset_sen" bigint DEFAULT 0 NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"source" text,
	"evidence_ref" text,
	"entered_by" text,
	"entered_at" timestamp with time zone,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	CONSTRAINT "pcb_entries_verified_needs_amount_and_source" CHECK (NOT "pcb_entries"."verified" OR ("pcb_entries"."pcb_amount_sen" IS NOT NULL AND "pcb_entries"."source" IS NOT NULL)),
	CONSTRAINT "pcb_entries_amounts_non_negative" CHECK (("pcb_entries"."pcb_amount_sen" IS NULL OR "pcb_entries"."pcb_amount_sen" >= 0)
          AND "pcb_entries"."cp38_sen" >= 0 AND "pcb_entries"."zakat_offset_sen" >= 0)
);
--> statement-breakpoint
ALTER TABLE "employment_pay_items" ADD CONSTRAINT "employment_pay_items_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_pay_items" ADD CONSTRAINT "employment_pay_items_pay_item_id_pay_items_id_fk" FOREIGN KEY ("pay_item_id") REFERENCES "public"."pay_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employments" ADD CONSTRAINT "employments_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employments" ADD CONSTRAINT "employments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eis_bands" ADD CONSTRAINT "eis_bands_rule_pack_id_rule_packs_id_fk" FOREIGN KEY ("rule_pack_id") REFERENCES "public"."rule_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epf_bands" ADD CONSTRAINT "epf_bands_rule_pack_id_rule_packs_id_fk" FOREIGN KEY ("rule_pack_id") REFERENCES "public"."rule_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_settings" ADD CONSTRAINT "rule_settings_rule_pack_id_rule_packs_id_fk" FOREIGN KEY ("rule_pack_id") REFERENCES "public"."rule_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_sources" ADD CONSTRAINT "rule_sources_rule_pack_id_rule_packs_id_fk" FOREIGN KEY ("rule_pack_id") REFERENCES "public"."rule_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "socso_bands" ADD CONSTRAINT "socso_bands_rule_pack_id_rule_packs_id_fk" FOREIGN KEY ("rule_pack_id") REFERENCES "public"."rule_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_line_items" ADD CONSTRAINT "pay_line_items_line_id_pay_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."pay_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_line_items" ADD CONSTRAINT "pay_line_items_pay_item_id_pay_items_id_fk" FOREIGN KEY ("pay_item_id") REFERENCES "public"."pay_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_line_overrides" ADD CONSTRAINT "pay_line_overrides_line_id_pay_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."pay_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_lines" ADD CONSTRAINT "pay_lines_run_id_pay_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_lines" ADD CONSTRAINT "pay_lines_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_rule_pack_id_rule_packs_id_fk" FOREIGN KEY ("rule_pack_id") REFERENCES "public"."rule_packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcb_entries" ADD CONSTRAINT "pcb_entries_line_id_pay_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."pay_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employments_company_period" ON "employments" USING btree ("company_id","join_date","termination_date");--> statement-breakpoint
CREATE INDEX "employments_person" ON "employments" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "persons_ic_unique" ON "persons" USING btree ("ic") WHERE "persons"."ic" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_events_run" ON "audit_events" USING btree ("run_id","at");--> statement-breakpoint
CREATE INDEX "audit_events_entity" ON "audit_events" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "pay_line_items_line" ON "pay_line_items" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "pay_lines_run" ON "pay_lines" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_runs_regular_period_unique" ON "pay_runs" USING btree ("company_id","year","month") WHERE "pay_runs"."run_type" = 'REGULAR';--> statement-breakpoint
CREATE INDEX "pay_runs_company_status" ON "pay_runs" USING btree ("company_id","status");