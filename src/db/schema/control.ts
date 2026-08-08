/**
 * Pay-run control tables — certifications, payment obligation projection,
 * and Phase 7 payment/release structures (schema present; Phase 6 services
 * only write READY line_payments + gate_certifications).
 *
 * Spec: docs/superpowers/specs/2026-08-08-phase6-findings-gates-approval-design.md
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { artifacts } from "./artifacts";
import {
  distributionChannel,
  gateKind,
  linePaymentState,
  paymentAttemptStatus,
  releaseBatchStatus,
  releaseMethod,
  withdrawalReason,
} from "./enums";
import { payLines, payRuns } from "./run";

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const gateCertifications = pgTable(
  "gate_certifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: text("run_id")
      .notNull()
      .references(() => payRuns.id, { onDelete: "cascade" }),
    gate: gateKind().notNull(),
    calcRevision: text("calc_revision").notNull(),
    statutoryPackId: text("statutory_pack_id").notNull(),
    anomalyPackVersion: text("anomaly_pack_version").notNull(),
    actor: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("gate_certifications_run_gate_revision").on(
      t.runId,
      t.gate,
      t.calcRevision
    ),
    index("gate_certifications_run").on(t.runId),
  ]
);

export const linePayments = pgTable(
  "line_payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => payLines.id, { onDelete: "cascade" })
      .unique(),
    state: linePaymentState().notNull().default("READY"),
    holdReason: text("hold_reason"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releaseBatchId: text("release_batch_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymentRef: text("payment_ref"),
    failedReason: text("failed_reason"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconEvidenceArtifactId: uuid("recon_evidence_artifact_id").references(
      () => artifacts.id
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("line_payments_state").on(t.state)]
);

export const withdrawals = pgTable(
  "withdrawals",
  {
    id: uuid().primaryKey().defaultRandom(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => payLines.id, { onDelete: "cascade" })
      .unique(),
    reasonCode: withdrawalReason("reason_code").notNull(),
    note: text().notNull(),
    actor: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    postApprovalApprover: text("post_approval_approver"),
    replacementRunId: text("replacement_run_id").references(() => payRuns.id),
  },
  (t) => [
    check("withdrawals_note_not_blank", sql`length(btrim(${t.note})) > 0`),
  ]
);

export const releaseBatches = pgTable(
  "release_batches",
  {
    id: text().primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => payRuns.id, { onDelete: "cascade" }),
    method: releaseMethod().notNull(),
    status: releaseBatchStatus().notNull().default("OPEN"),
    totalSen: bigint("total_sen", { mode: "number" }).notNull(),
    lineCount: integer("line_count").notNull(),
    registerArtifactId: uuid("register_artifact_id").references(
      () => artifacts.id
    ),
    createdBy: text("created_by").notNull(),
    createdAt,
  },
  (t) => [
    check("release_batches_line_count_positive", sql`${t.lineCount} > 0`),
    index("release_batches_run").on(t.runId),
  ]
);

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    batchId: text("batch_id")
      .notNull()
      .references(() => releaseBatches.id, { onDelete: "cascade" }),
    lineId: uuid("line_id")
      .notNull()
      .references(() => payLines.id, { onDelete: "cascade" }),
    amountSen: bigint("amount_sen", { mode: "number" }).notNull(),
    /** Snapshot at release: { bank, account, name }. */
    bankSnapshot: jsonb("bank_snapshot").notNull(),
    status: paymentAttemptStatus().notNull().default("PENDING"),
    failedReason: text("failed_reason"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    paymentRef: text("payment_ref"),
    createdAt,
  },
  (t) => [
    index("payment_attempts_batch").on(t.batchId),
    index("payment_attempts_line").on(t.lineId),
  ]
);

export const distributions = pgTable(
  "distributions",
  {
    id: uuid().primaryKey().defaultRandom(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => payLines.id, { onDelete: "cascade" }),
    channel: distributionChannel().notNull(),
    artifactId: uuid("artifact_id").references(() => artifacts.id),
    actor: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    note: text(),
  },
  (t) => [index("distributions_line").on(t.lineId)]
);
