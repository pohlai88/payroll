-- Phase 6: scan completeness stamp + correct nullable lineId uniqueness.

ALTER TABLE "pay_runs" ADD COLUMN "findings_scanned_revision" text;--> statement-breakpoint

DROP INDEX IF EXISTS "anomaly_findings_run_line_rule_uidx";--> statement-breakpoint

CREATE UNIQUE INDEX "anomaly_findings_line_scoped_uidx"
  ON "anomaly_findings" USING btree ("run_id","line_id","rule_id")
  WHERE "run_id" IS NOT NULL AND "line_id" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "anomaly_findings_run_scoped_uidx"
  ON "anomaly_findings" USING btree ("run_id","rule_id")
  WHERE "run_id" IS NOT NULL AND "line_id" IS NULL;--> statement-breakpoint
