/**
 * Findings engine persistence — stable logical identity + event history.
 * Spec: docs/superpowers/specs/2026-08-08-phase6-findings-gates-approval-design.md
 */

import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { findingEventKind, findingSeverity, findingStatus } from "./enums";
import { payRuns } from "./run";
import { transfers } from "./transfer";

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const anomalyFindings = pgTable(
  "anomaly_findings",
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: text("run_id").references(() => payRuns.id, { onDelete: "cascade" }),
    transferId: uuid("transfer_id").references(() => transfers.id, {
      onDelete: "cascade",
    }),
    /** Pay-line id when the finding is line-scoped; otherwise null (run-scoped). */
    lineId: uuid("line_id"),
    ruleId: text("rule_id").notNull(),
    fingerprint: text().notNull(),
    severity: findingSeverity().notNull(),
    /** Gate names this finding blocks, e.g. ["APPROVAL"]. */
    blocks: jsonb().$type<string[]>().notNull().default([]),
    title: text().notNull(),
    detail: text().notNull(),
    evidence: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: findingStatus().notNull().default("OPEN"),
    ackNote: text("ack_note"),
    ackActor: text("ack_actor"),
    ackAt: timestamp("ack_at", { withTimezone: true }),
    detectedRevision: text("detected_revision"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedRevision: text("resolved_revision"),
    resolutionType: text("resolution_type"),
    createdAt,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Fingerprint is NOT part of identity — see Phase 6 design.
    uniqueIndex("anomaly_findings_line_scoped_uidx")
      .on(t.runId, t.lineId, t.ruleId)
      .where(sql`${t.runId} IS NOT NULL AND ${t.lineId} IS NOT NULL`),
    uniqueIndex("anomaly_findings_run_scoped_uidx")
      .on(t.runId, t.ruleId)
      .where(sql`${t.runId} IS NOT NULL AND ${t.lineId} IS NULL`),
    uniqueIndex("anomaly_findings_transfer_rule_uidx")
      .on(t.transferId, t.ruleId)
      .where(sql`${t.runId} IS NULL AND ${t.transferId} IS NOT NULL`),
    index("anomaly_findings_run").on(t.runId),
    index("anomaly_findings_transfer").on(t.transferId),
    index("anomaly_findings_status").on(t.status),
  ]
);

export const findingEvents = pgTable(
  "finding_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => anomalyFindings.id, { onDelete: "cascade" }),
    kind: findingEventKind().notNull(),
    evidence: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    actor: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("finding_events_finding").on(t.findingId)]
);

export type AnomalyFindingRow = typeof anomalyFindings.$inferSelect;
export type FindingEventRow = typeof findingEvents.$inferSelect;
