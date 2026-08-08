CREATE TYPE "public"."pcb_remuneration_class" AS ENUM('NORMAL', 'ADDITIONAL', 'EXCLUDED');--> statement-breakpoint
CREATE TABLE "pay_item_pcb_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pay_item_id" uuid NOT NULL,
	"class" "pcb_remuneration_class" NOT NULL,
	"source" "treatment_source" NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"reason" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_item_pcb_classes_interval_ordered" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
	CONSTRAINT "pay_item_pcb_classes_departure_needs_reason_approver" CHECK (("source" != 'APPROVED_DEPARTURE') OR (length(btrim("reason")) > 0 AND "approved_by" IS NOT NULL))
);--> statement-breakpoint
ALTER TABLE "pay_item_pcb_classes" ADD CONSTRAINT "pay_item_pcb_classes_pay_item_id_pay_items_id_fk" FOREIGN KEY ("pay_item_id") REFERENCES "public"."pay_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pay_item_pcb_classes_item" ON "pay_item_pcb_classes" USING btree ("pay_item_id");--> statement-breakpoint
ALTER TABLE "pay_item_pcb_classes"
  ADD CONSTRAINT "pay_item_pcb_classes_no_overlapping_ranges"
  EXCLUDE USING gist (
    pay_item_id WITH =,
    daterange(
      effective_from,
      COALESCE(effective_to, 'infinity'::date),
      '[]'
    ) WITH &&
  );--> statement-breakpoint
INSERT INTO pay_item_pcb_classes (pay_item_id, class, source, effective_from, actor)
SELECT id,
  CASE
    WHEN kind = 'DEDUCTION' THEN 'EXCLUDED'::pcb_remuneration_class
    WHEN code = 'BONUS' THEN 'ADDITIONAL'::pcb_remuneration_class
    ELSE 'NORMAL'::pcb_remuneration_class
  END,
  'STATUTORY_DEFAULT',
  '2000-01-01',
  's06-pcb-cutover'
FROM pay_items;--> statement-breakpoint
ALTER TABLE "pay_line_items" ADD COLUMN "pcb_class_snap" "pcb_remuneration_class";--> statement-breakpoint
-- Backfill existing line snaps from current catalog class (open-ended).
UPDATE pay_line_items pli
SET pcb_class_snap = c.class
FROM pay_item_pcb_classes c
WHERE c.pay_item_id = pli.pay_item_id
  AND c.effective_to IS NULL;--> statement-breakpoint
UPDATE pay_line_items
SET pcb_class_snap = 'EXCLUDED'
WHERE pcb_class_snap IS NULL AND kind_snap = 'DEDUCTION';--> statement-breakpoint
UPDATE pay_line_items
SET pcb_class_snap = CASE WHEN item_code_snap = 'BONUS' THEN 'ADDITIONAL'::pcb_remuneration_class ELSE 'NORMAL'::pcb_remuneration_class END
WHERE pcb_class_snap IS NULL;--> statement-breakpoint
ALTER TABLE "pay_line_items" ALTER COLUMN "pcb_class_snap" SET NOT NULL;
