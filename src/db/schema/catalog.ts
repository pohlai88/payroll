/**
 * The pay item catalog and its per-employment defaults.
 *
 * Fixed kinds, free catalog: users create and edit items, but only within the
 * closed `pay_item_kind` enum. Adding a kind is a code change plus a migration,
 * because a kind decides whether a figure is paid or deducted.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  integer,
  pgTable,
  // biome-ignore lint/suspicious/noDeprecatedImports: only the varargs overload is deprecated; every call here uses primaryKey({ columns: [...] }).
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { payItemKind, rateBasis } from "./enums";
import { employments } from "./parties";

export const payItems = pgTable(
  "pay_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Stable code used in citations, snapshots and imports. Immutable — see the trigger. */
    code: text().notNull().unique(),
    nameEn: text("name_en").notNull(),
    nameMs: text("name_ms").notNull(),
    /** Immutable after creation: changing it reclassifies history. */
    kind: payItemKind().notNull(),
    /** How the amount is arrived at. Editable — entries snapshot the basis in force. */
    rateBasis: rateBasis("rate_basis").notNull(),
    /**
     * Default rate for quantity-based items, in sen. There is no multiplier
     * column: the engine computes `qty × rate` and consumes no factor, and a
     * stored value nothing reads would drift out of truth. Overtime multipliers
     * arrive as a domain change and a migration together.
     */
    defaultRateSen: bigint("default_rate_sen", { mode: "number" }),
    /** Whether the item enters each statutory wage base. Read by the engine as typed booleans. */
    epfWages: boolean("epf_wages").notNull(),
    socsoWages: boolean("socso_wages").notNull(),
    eisWages: boolean("eis_wages").notNull(),
    /** MONTHLY-basis pay is reduced by days paid; most allowances are not. */
    prorates: boolean().notNull().default(false),
    /**
     * Informational for the human PCB workflow and the payslip. Not an engine
     * input: PCB is never calculated, only recorded as a verified external figure.
     */
    taxable: boolean().notNull().default(true),
    /** System items (BASIC, OT) cannot be deactivated — see the trigger. */
    isSystem: boolean("is_system").notNull().default(false),
    sort: integer().notNull().default(0),
    /** Soft delete only. Hard deletes are rejected by the trigger. */
    active: boolean().notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: text("updated_by"),
  },
  (t) => [
    check("pay_items_code_not_blank", sql`length(btrim(${t.code})) > 0`),
    check(
      "pay_items_default_rate_non_negative",
      sql`${t.defaultRateSen} IS NULL OR ${t.defaultRateSen} >= 0`
    ),
  ]
);

/**
 * What each employment is normally paid, per item.
 *
 * This is where a line's `rateSen` is defaulted from before the operator edits
 * it for the run. The shape rule — a rate for quantity bases, an amount for the
 * others — and the pay-basis compatibility rule both need the item's
 * `rate_basis` and the employment's `pay_basis`, so they live in a trigger
 * rather than a CHECK.
 */
export const employmentPayItems = pgTable(
  "employment_pay_items",
  {
    employmentId: uuid("employment_id")
      .notNull()
      .references(() => employments.id, { onDelete: "cascade" }),
    payItemId: uuid("pay_item_id")
      .notNull()
      .references(() => payItems.id),
    /** Set for quantity bases (PER_DAY / PER_HOUR / PER_UNIT). */
    rateSen: bigint("rate_sen", { mode: "number" }),
    /** Set for AMOUNT and FIXED_MONTHLY. */
    amountSen: bigint("amount_sen", { mode: "number" }),
    active: boolean().notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: text("updated_by"),
  },
  (t) => [
    primaryKey({ columns: [t.employmentId, t.payItemId] }),
    check(
      "employment_pay_items_rate_non_negative",
      sql`${t.rateSen} IS NULL OR ${t.rateSen} >= 0`
    ),
  ]
);

export type PayItemRow = typeof payItems.$inferSelect;
export type EmploymentPayItemRow = typeof employmentPayItems.$inferSelect;
