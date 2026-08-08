CREATE TYPE "public"."rule_pack_layer" AS ENUM('STATUTORY_CALCULATION', 'EMPLOYMENT_LAW', 'COMPANY_POLICY');--> statement-breakpoint
CREATE TYPE "public"."rule_pack_status" AS ENUM('DRAFT', 'SOURCE_CAPTURED', 'VERIFIED', 'APPROVED', 'EFFECTIVE', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."verification_method" AS ENUM('HUMAN_REVIEW_OF_OFFICIAL_PDF', 'OFFICIAL_HTML_PAGE', 'OFFICIAL_API', 'ISSUER_CORRESPONDENCE');--> statement-breakpoint
CREATE TABLE "employment_law_rules" (
	"rule_pack_id" text NOT NULL,
	"rule_key" text NOT NULL,
	"value" numeric(18, 6) NOT NULL,
	"unit" text NOT NULL,
	"source_ref" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employment_law_rules_rule_pack_id_rule_key_pk" PRIMARY KEY("rule_pack_id","rule_key"),
	CONSTRAINT "employment_law_rules_unit_known" CHECK ("employment_law_rules"."unit" IN ('SEN', 'HOURS', 'DAYS', 'MULTIPLIER', 'PERCENT', 'COUNT')),
	CONSTRAINT "employment_law_rules_key_not_blank" CHECK (length(btrim("employment_law_rules"."rule_key")) > 0)
);
--> statement-breakpoint
ALTER TABLE "rule_sources" DROP CONSTRAINT "rule_sources_sha256_is_hex";--> statement-breakpoint
ALTER TABLE "rule_packs" ADD COLUMN "layer" "rule_pack_layer" DEFAULT 'STATUTORY_CALCULATION' NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_packs" ADD COLUMN "jurisdiction" text DEFAULT 'MY' NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_packs" ADD COLUMN "authority" text;--> statement-breakpoint
ALTER TABLE "rule_packs" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "rule_packs" ADD COLUMN "version" text;--> statement-breakpoint
ALTER TABLE "rule_packs" ADD COLUMN "published_at" date;--> statement-breakpoint
ALTER TABLE "rule_packs" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "rule_packs" ADD COLUMN "status" "rule_pack_status" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "rule_packs" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "rule_packs" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rule_packs" ADD COLUMN "superseded_by" text;--> statement-breakpoint
ALTER TABLE "rule_sources" ADD COLUMN "instrument_number" text;--> statement-breakpoint
ALTER TABLE "rule_sources" ADD COLUMN "provision_reference" text;--> statement-breakpoint
ALTER TABLE "rule_sources" ADD COLUMN "page_reference" text;--> statement-breakpoint
ALTER TABLE "rule_sources" ADD COLUMN "published_date" date;--> statement-breakpoint
ALTER TABLE "rule_sources" ADD COLUMN "effective_date" date;--> statement-breakpoint
ALTER TABLE "rule_sources" ADD COLUMN "verification_method" "verification_method";--> statement-breakpoint
ALTER TABLE "rule_sources" ADD COLUMN "verified_by" text;--> statement-breakpoint
ALTER TABLE "rule_sources" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD COLUMN "rule_pack_hash" text;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD COLUMN "calc_engine_version" text;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD COLUMN "calculated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employment_law_rules" ADD CONSTRAINT "employment_law_rules_rule_pack_id_rule_packs_id_fk" FOREIGN KEY ("rule_pack_id") REFERENCES "public"."rule_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rule_packs_layer_effective" ON "rule_packs" USING btree ("layer","effective_from");--> statement-breakpoint
ALTER TABLE "rule_packs" ADD CONSTRAINT "rule_packs_effective_range_ordered" CHECK ("rule_packs"."effective_to" IS NULL OR "rule_packs"."effective_to" >= "rule_packs"."effective_from");--> statement-breakpoint
ALTER TABLE "rule_packs" ADD CONSTRAINT "rule_packs_approved_is_attributable" CHECK ("rule_packs"."status" NOT IN ('APPROVED', 'EFFECTIVE', 'SUPERSEDED')
          OR ("rule_packs"."approved_by" IS NOT NULL AND "rule_packs"."approved_at" IS NOT NULL
              AND "rule_packs"."content_hash" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "rule_packs" ADD CONSTRAINT "rule_packs_superseded_names_successor" CHECK ("rule_packs"."status" <> 'SUPERSEDED' OR "rule_packs"."superseded_by" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "rule_packs" ADD CONSTRAINT "rule_packs_content_hash_is_hex" CHECK ("rule_packs"."content_hash" IS NULL OR "rule_packs"."content_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "rule_sources" ADD CONSTRAINT "rule_sources_verification_is_attributable" CHECK (("rule_sources"."verified_by" IS NULL AND "rule_sources"."verified_at" IS NULL AND "rule_sources"."verification_method" IS NULL)
          OR ("rule_sources"."verified_by" IS NOT NULL AND "rule_sources"."verified_at" IS NOT NULL
              AND "rule_sources"."verification_method" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "rule_sources" ADD CONSTRAINT "rule_sources_sha256_is_hex" CHECK ("rule_sources"."sha256" IS NULL OR "rule_sources"."sha256" ~ '^[0-9a-f]{64}$');