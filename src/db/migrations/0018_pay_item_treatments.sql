CREATE TYPE "public"."treatment_scheme" AS ENUM('EPF', 'SOCSO', 'EIS', 'HRD');--> statement-breakpoint
CREATE TYPE "public"."treatment_source" AS ENUM('STATUTORY_DEFAULT', 'APPROVED_DEPARTURE');--> statement-breakpoint
CREATE TABLE "pay_item_treatments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pay_item_id" uuid NOT NULL,
	"scheme" "treatment_scheme" NOT NULL,
	"subject" boolean NOT NULL,
	"source" "treatment_source" NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"reason" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_item_treatments_interval_ordered" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
	CONSTRAINT "pay_item_treatments_departure_needs_reason_approver" CHECK (("source" != 'APPROVED_DEPARTURE') OR (length(btrim("reason")) > 0 AND "approved_by" IS NOT NULL))
);--> statement-breakpoint
ALTER TABLE "pay_item_treatments" ADD CONSTRAINT "pay_item_treatments_pay_item_id_pay_items_id_fk" FOREIGN KEY ("pay_item_id") REFERENCES "public"."pay_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pay_item_treatments_item_scheme" ON "pay_item_treatments" USING btree ("pay_item_id","scheme");--> statement-breakpoint
ALTER TABLE "pay_item_treatments"
  ADD CONSTRAINT "pay_item_treatments_no_overlapping_ranges"
  EXCLUDE USING gist (
    pay_item_id WITH =,
    scheme WITH =,
    daterange(
      effective_from,
      COALESCE(effective_to, 'infinity'::date),
      '[]'
    ) WITH &&
  );--> statement-breakpoint
-- Cutover: mirror current boolean flags; HRD copies EPF.
INSERT INTO pay_item_treatments (pay_item_id, scheme, subject, source, effective_from, actor)
SELECT id, 'EPF', epf_wages, 'STATUTORY_DEFAULT', '2000-01-01', 's06-cutover' FROM pay_items;--> statement-breakpoint
INSERT INTO pay_item_treatments (pay_item_id, scheme, subject, source, effective_from, actor)
SELECT id, 'SOCSO', socso_wages, 'STATUTORY_DEFAULT', '2000-01-01', 's06-cutover' FROM pay_items;--> statement-breakpoint
INSERT INTO pay_item_treatments (pay_item_id, scheme, subject, source, effective_from, actor)
SELECT id, 'EIS', eis_wages, 'STATUTORY_DEFAULT', '2000-01-01', 's06-cutover' FROM pay_items;--> statement-breakpoint
INSERT INTO pay_item_treatments (pay_item_id, scheme, subject, source, effective_from, actor)
SELECT id, 'HRD', epf_wages, 'STATUTORY_DEFAULT', '2000-01-01', 's06-cutover' FROM pay_items;--> statement-breakpoint
-- Keep deprecated boolean mirrors in sync when open-ended treatments change.
CREATE OR REPLACE FUNCTION sync_pay_item_wage_mirrors() RETURNS trigger AS $$
BEGIN
  IF NEW.effective_to IS NOT NULL THEN
    RETURN NEW;
  END IF;
  UPDATE pay_items SET
    epf_wages = CASE WHEN NEW.scheme = 'EPF' THEN NEW.subject ELSE epf_wages END,
    socso_wages = CASE WHEN NEW.scheme = 'SOCSO' THEN NEW.subject ELSE socso_wages END,
    eis_wages = CASE WHEN NEW.scheme = 'EIS' THEN NEW.subject ELSE eis_wages END,
    updated_at = now()
  WHERE id = NEW.pay_item_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER pay_item_treatments_sync_mirrors
  AFTER INSERT OR UPDATE ON pay_item_treatments
  FOR EACH ROW EXECUTE FUNCTION sync_pay_item_wage_mirrors();
