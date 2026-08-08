-- MY-STAT-S07c — persist tax profile + calendar-year YTD for offline PCB compute.
-- Dual path remains: verified pcb_entries.pcb_amount_sen overrides compute.

CREATE TYPE "public"."pcb_residence" AS ENUM('RESIDENT', 'NON_RESIDENT');--> statement-breakpoint
CREATE TYPE "public"."pcb_category" AS ENUM('1', '2', '3');--> statement-breakpoint
CREATE TYPE "public"."pcb_formula_regime" AS ENUM('NORMAL', 'REP', 'KNOWLEDGE_WORKER', 'C_SUITE');--> statement-breakpoint

CREATE TABLE "employment_tax_profiles" (
  "employment_id" uuid PRIMARY KEY NOT NULL,
  "residence" "pcb_residence" DEFAULT 'RESIDENT' NOT NULL,
  "category" "pcb_category" DEFAULT '1' NOT NULL,
  "formula_regime" "pcb_formula_regime" DEFAULT 'NORMAL' NOT NULL,
  "disabled_individual" boolean DEFAULT false NOT NULL,
  "disabled_spouse" boolean DEFAULT false NOT NULL,
  "qualifying_child_units" integer DEFAULT 0 NOT NULL,
  "elect_deduct_below_rm10" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employment_tax_profiles_child_units_non_negative"
    CHECK ("qualifying_child_units" >= 0)
);--> statement-breakpoint

ALTER TABLE "employment_tax_profiles"
  ADD CONSTRAINT "employment_tax_profiles_employment_id_employments_id_fk"
  FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "employment_pcb_ytd" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employment_id" uuid NOT NULL,
  "calendar_year" integer NOT NULL,
  "y_sen" bigint DEFAULT 0 NOT NULL,
  "k_sen" bigint DEFAULT 0 NOT NULL,
  "x_sen" bigint DEFAULT 0 NOT NULL,
  "z_sen" bigint DEFAULT 0 NOT NULL,
  "accumulated_lp_sen" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employment_pcb_ytd_employment_year"
    UNIQUE("employment_id","calendar_year"),
  CONSTRAINT "employment_pcb_ytd_year_plausible"
    CHECK ("calendar_year" >= 2000),
  CONSTRAINT "employment_pcb_ytd_amounts_non_negative"
    CHECK ("y_sen" >= 0 AND "k_sen" >= 0 AND "x_sen" >= 0 AND "z_sen" >= 0 AND "accumulated_lp_sen" >= 0)
);--> statement-breakpoint

ALTER TABLE "employment_pcb_ytd"
  ADD CONSTRAINT "employment_pcb_ytd_employment_id_employments_id_fk"
  FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "employment_pcb_ytd_employment"
  ON "employment_pcb_ytd" USING btree ("employment_id");--> statement-breakpoint

ALTER TABLE "pcb_entries" ADD COLUMN "y1_sen" bigint;--> statement-breakpoint
ALTER TABLE "pcb_entries" ADD COLUMN "yt_sen" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pcb_entries" ADD COLUMN "kt_sen" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pcb_entries" ADD COLUMN "lp1_sen" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint

ALTER TABLE "pcb_entries" DROP CONSTRAINT "pcb_entries_amounts_non_negative";--> statement-breakpoint
ALTER TABLE "pcb_entries" ADD CONSTRAINT "pcb_entries_amounts_non_negative" CHECK ((
  ("pcb_amount_sen" IS NULL OR "pcb_amount_sen" >= 0)
  AND "cp38_sen" >= 0 AND "zakat_offset_sen" >= 0
  AND ("y1_sen" IS NULL OR "y1_sen" >= 0)
  AND "yt_sen" >= 0 AND "kt_sen" >= 0 AND "lp1_sen" >= 0
));
