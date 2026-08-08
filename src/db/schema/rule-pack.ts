/**
 * The statutory rule pack: band tables, settings and the documents they came from.
 *
 * This is seeded, versioned data, not operational data. A run records the pack it
 * was calculated under, so a figure can always be traced to the table row and the
 * gazetted document that produced it.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  integer,
  jsonb,
  pgTable,
  // biome-ignore lint/suspicious/noDeprecatedImports: only the varargs overload is deprecated; every call here uses primaryKey({ columns: [...] }).
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { epfPart } from "./enums";

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const rulePacks = pgTable("rule_packs", {
  /** Human identifier, e.g. `MY-STATUTORY-2026-06`. */
  id: text().primaryKey(),
  name: text().notNull(),
  effectiveFrom: date("effective_from").notNull(),
  /** Null while the pack is the one currently in force. */
  effectiveTo: date("effective_to"),
  notes: text(),
  createdAt,
});

/**
 * The official documents behind the pack — issuer, URL, retrieval date and the
 * SHA-256 of what was retrieved. Every figure in the pack cites one of these.
 */
export const ruleSources = pgTable(
  "rule_sources",
  {
    rulePackId: text("rule_pack_id")
      .notNull()
      .references(() => rulePacks.id, { onDelete: "cascade" }),
    /** Short reference used in citations and on the payslip annex, e.g. `S1`. */
    ref: text().notNull(),
    issuer: text().notNull(),
    title: text().notNull(),
    url: text().notNull(),
    retrievedAt: date("retrieved_at").notNull(),
    /**
     * The hash of the document as retrieved, where there is a document.
     *
     * Nullable because two of the pack's sources are living portal pages rather
     * than gazetted files — LHDN's PCB methods page and HRD Corp's levy
     * guidance. Recording a hash of whatever HTML happened to be served that day
     * would look like evidence without being any.
     */
    sha256: text(),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.rulePackId, t.ref] }),
    check("rule_sources_sha256_is_hex", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  ]
);

/**
 * `RuleSettings` plus the `statutoryLimits` block, as one versioned document.
 *
 * jsonb rather than a column per setting: the shape is versioned with the pack
 * and read whole, and the repository layer parses it through a Zod schema at the
 * boundary, so a malformed pack fails there with a field path rather than
 * reaching the engine as `undefined`.
 */
export const ruleSettings = pgTable("rule_settings", {
  rulePackId: text("rule_pack_id")
    .primaryKey()
    .references(() => rulePacks.id, { onDelete: "cascade" }),
  settings: jsonb().notNull(),
  createdAt,
});

/** EPF Third Schedule Parts A, C and E. Parts F and NONE have no band table. */
export const epfBands = pgTable(
  "epf_bands",
  {
    rulePackId: text("rule_pack_id")
      .notNull()
      .references(() => rulePacks.id, { onDelete: "cascade" }),
    part: epfPart().notNull(),
    fromSen: bigint("from_sen", { mode: "number" }).notNull(),
    toSen: bigint("to_sen", { mode: "number" }).notNull(),
    erSen: bigint("er_sen", { mode: "number" }).notNull(),
    eeSen: bigint("ee_sen", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.rulePackId, t.part, t.fromSen] }),
    check("epf_bands_range_ordered", sql`${t.toSen} >= ${t.fromSen}`),
    check(
      "epf_bands_amounts_non_negative",
      sql`${t.fromSen} >= 0 AND ${t.erSen} >= 0 AND ${t.eeSen} >= 0`
    ),
    check("epf_bands_part_has_schedule", sql`${t.part} IN ('A', 'C', 'E')`),
  ]
);

/**
 * SOCSO Act 4 contributions including SKBBK.
 *
 * Category 1 splits the employee side into the core contribution and the SKBBK
 * supplement, which the payslip shows on its own line because the employee funds
 * it. Category 2 has no employee core contribution — only SKBBK.
 */
export const socsoBands = pgTable(
  "socso_bands",
  {
    rulePackId: text("rule_pack_id")
      .notNull()
      .references(() => rulePacks.id, { onDelete: "cascade" }),
    fromSen: bigint("from_sen", { mode: "number" }).notNull(),
    toSen: bigint("to_sen", { mode: "number" }).notNull(),
    cat1ErSen: bigint("cat1_er_sen", { mode: "number" }).notNull(),
    cat1EeCoreSen: bigint("cat1_ee_core_sen", { mode: "number" }).notNull(),
    cat1EeSkbbkSen: bigint("cat1_ee_skbbk_sen", { mode: "number" }).notNull(),
    cat2ErSen: bigint("cat2_er_sen", { mode: "number" }).notNull(),
    cat2EeSkbbkSen: bigint("cat2_ee_skbbk_sen", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.rulePackId, t.fromSen] }),
    check("socso_bands_range_ordered", sql`${t.toSen} >= ${t.fromSen}`),
    check(
      "socso_bands_amounts_non_negative",
      sql`${t.fromSen} >= 0 AND ${t.cat1ErSen} >= 0 AND ${t.cat1EeCoreSen} >= 0
          AND ${t.cat1EeSkbbkSen} >= 0 AND ${t.cat2ErSen} >= 0 AND ${t.cat2EeSkbbkSen} >= 0`
    ),
  ]
);

export const eisBands = pgTable(
  "eis_bands",
  {
    rulePackId: text("rule_pack_id")
      .notNull()
      .references(() => rulePacks.id, { onDelete: "cascade" }),
    fromSen: bigint("from_sen", { mode: "number" }).notNull(),
    toSen: bigint("to_sen", { mode: "number" }).notNull(),
    erSen: bigint("er_sen", { mode: "number" }).notNull(),
    eeSen: bigint("ee_sen", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.rulePackId, t.fromSen] }),
    check("eis_bands_range_ordered", sql`${t.toSen} >= ${t.fromSen}`),
    check(
      "eis_bands_amounts_non_negative",
      sql`${t.fromSen} >= 0 AND ${t.erSen} >= 0 AND ${t.eeSen} >= 0`
    ),
  ]
);

/**
 * The SHA-256 of every seed file as loaded.
 *
 * Seed data is content-addressed so an edited band table cannot slip in
 * unnoticed: `tests/db/seed-integrity.test.ts` re-hashes the files on disk and
 * compares. A silently changed statutory figure fails a test rather than
 * quietly changing a payroll.
 */
export const seedFiles = pgTable(
  "seed_files",
  {
    fileName: text("file_name").primaryKey(),
    sha256: text().notNull(),
    byteSize: integer("byte_size").notNull(),
    loadedAt: timestamp("loaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("seed_files_sha256_is_hex", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check("seed_files_byte_size_positive", sql`${t.byteSize} > 0`),
  ]
);

export type RulePackRow = typeof rulePacks.$inferSelect;
export type RuleSourceRow = typeof ruleSources.$inferSelect;
