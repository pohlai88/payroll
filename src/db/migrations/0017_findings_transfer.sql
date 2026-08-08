CREATE TYPE "public"."finding_severity" AS ENUM('INFO', 'REVIEW', 'WARNING', 'BLOCKING');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('OPEN', 'ACKNOWLEDGED', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."finding_event_kind" AS ENUM('DETECTED', 'REOPENED', 'ACKNOWLEDGED', 'RESOLVED');--> statement-breakpoint
CREATE TABLE "anomaly_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text,
	"transfer_id" uuid,
	"line_id" uuid,
	"rule_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "finding_status" DEFAULT 'OPEN' NOT NULL,
	"ack_note" text,
	"ack_actor" text,
	"ack_at" timestamp with time zone,
	"detected_revision" text,
	"resolved_at" timestamp with time zone,
	"resolved_revision" text,
	"resolution_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "finding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finding_id" uuid NOT NULL,
	"kind" "finding_event_kind" NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "anomaly_findings" ADD CONSTRAINT "anomaly_findings_run_id_pay_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomaly_findings" ADD CONSTRAINT "anomaly_findings_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_events" ADD CONSTRAINT "finding_events_finding_id_anomaly_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."anomaly_findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anomaly_findings_run_line_rule_uidx" ON "anomaly_findings" USING btree ("run_id","line_id","rule_id") NULLS NOT DISTINCT WHERE "run_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "anomaly_findings_transfer_rule_uidx" ON "anomaly_findings" USING btree ("transfer_id","rule_id") NULLS NOT DISTINCT WHERE "run_id" IS NULL AND "transfer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "anomaly_findings_run" ON "anomaly_findings" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "anomaly_findings_transfer" ON "anomaly_findings" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "anomaly_findings_status" ON "anomaly_findings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "finding_events_finding" ON "finding_events" USING btree ("finding_id");
