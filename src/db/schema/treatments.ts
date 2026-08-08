/**
 * Governed pay-item statutory treatment (MY-STAT-S06) and PCB remuneration class.
 * Overlap exclusion lives in migrations 0018/0019 (GiST EXCLUDE via btree_gist).
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { payItems } from "./catalog";
import {
  pcbRemunerationClass,
  treatmentScheme,
  treatmentSource,
} from "./enums";

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const payItemTreatments = pgTable(
  "pay_item_treatments",
  {
    id: uuid().primaryKey().defaultRandom(),
    payItemId: uuid("pay_item_id")
      .notNull()
      .references(() => payItems.id, { onDelete: "cascade" }),
    scheme: treatmentScheme().notNull(),
    subject: boolean().notNull(),
    source: treatmentSource().notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    reason: text(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    actor: text().notNull(),
    createdAt,
  },
  (t) => [
    check(
      "pay_item_treatments_interval_ordered",
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`
    ),
    check(
      "pay_item_treatments_departure_needs_reason_approver",
      sql`(${t.source} != 'APPROVED_DEPARTURE')
          OR (length(btrim(${t.reason})) > 0 AND ${t.approvedBy} IS NOT NULL)`
    ),
    index("pay_item_treatments_item_scheme").on(t.payItemId, t.scheme),
  ]
);

export const payItemPcbClasses = pgTable(
  "pay_item_pcb_classes",
  {
    id: uuid().primaryKey().defaultRandom(),
    payItemId: uuid("pay_item_id")
      .notNull()
      .references(() => payItems.id, { onDelete: "cascade" }),
    class: pcbRemunerationClass().notNull(),
    source: treatmentSource().notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    reason: text(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    actor: text().notNull(),
    createdAt,
  },
  (t) => [
    check(
      "pay_item_pcb_classes_interval_ordered",
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`
    ),
    check(
      "pay_item_pcb_classes_departure_needs_reason_approver",
      sql`(${t.source} != 'APPROVED_DEPARTURE')
          OR (length(btrim(${t.reason})) > 0 AND ${t.approvedBy} IS NOT NULL)`
    ),
    index("pay_item_pcb_classes_item").on(t.payItemId),
  ]
);

export type PayItemTreatmentRow = typeof payItemTreatments.$inferSelect;
export type PayItemPcbClassRow = typeof payItemPcbClasses.$inferSelect;
