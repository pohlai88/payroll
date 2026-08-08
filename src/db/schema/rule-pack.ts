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
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  // biome-ignore lint/suspicious/noDeprecatedImports: only the varargs overload is deprecated; every call here uses primaryKey({ columns: [...] }).
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import {
  epfPart,
  rulePackLayer,
  rulePackStatus,
  verificationMethod,
} from "./enums";

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

/**
 * The executable representation of a set of official rules.
 *
 * Identity is `(jurisdiction, authority, code, version)` and the id carries its
 * era — `MY-EPF-2025-10`, never `EPF_CURRENT` — because a pack that has produced
 * a payroll must stay resolvable after the law changes.
 */
export const rulePacks = pgTable(
  "rule_packs",
  {
    /** Human identifier, e.g. `MY-EPF-2025-10`. */
    id: text().primaryKey(),
    name: text().notNull(),
    layer: rulePackLayer().notNull().default("STATUTORY_CALCULATION"),
    /** ISO 3166-1 alpha-2, or a subdivision code where a rule is state-level. */
    jurisdiction: text().notNull().default("MY"),
    /** The body that issued the instruments, e.g. `KWSP`, `PERKESO`, `LHDN`, `JTKSM`. */
    authority: text(),
    /** The family this pack versions, e.g. `EPF`, `SOCSO`, `EA-OVERTIME`. */
    code: text(),
    version: text(),
    /** When the authority published it, as distinct from when it takes effect. */
    publishedAt: date("published_at"),
    effectiveFrom: date("effective_from").notNull(),
    /** Null while the pack is the one currently in force. */
    effectiveTo: date("effective_to"),
    /**
     * Hash of the pack's own content, stamped onto every run that uses it. This
     * is what makes "reproduce that payroll" mean something specific.
     */
    contentHash: text("content_hash"),
    status: rulePackStatus().notNull().default("DRAFT"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** The pack that replaced this one, when a statutory change created a successor. */
    supersededBy: text("superseded_by"),
    notes: text(),
    createdAt,
  },
  (t) => [
    check(
      "rule_packs_effective_range_ordered",
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`
    ),
    // Approval is an act by someone, at a time. A pack cannot drift into it.
    check(
      "rule_packs_approved_is_attributable",
      sql`${t.status} NOT IN ('APPROVED', 'EFFECTIVE', 'SUPERSEDED')
          OR (${t.approvedBy} IS NOT NULL AND ${t.approvedAt} IS NOT NULL
              AND ${t.contentHash} IS NOT NULL)`
    ),
    check(
      "rule_packs_superseded_names_successor",
      sql`${t.status} <> 'SUPERSEDED' OR ${t.supersededBy} IS NOT NULL`
    ),
    check(
      "rule_packs_content_hash_is_hex",
      sql`${t.contentHash} IS NULL OR ${t.contentHash} ~ '^[0-9a-f]{64}$'`
    ),
    index("rule_packs_layer_effective").on(t.layer, t.effectiveFrom),
  ]
);

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

    // ---- evidence register ----
    /** Gazette or instrument number, e.g. `P.U. (A) 376/2024`. */
    instrumentNumber: text("instrument_number"),
    /** The provision the figure comes from, e.g. `Regulation 5`, `s.60A(1)(d)`. */
    provisionReference: text("provision_reference"),
    /** Where in the document a reviewer will find it. */
    pageReference: text("page_reference"),
    publishedDate: date("published_date"),
    effectiveDate: date("effective_date"),
    /**
     * How the figure was established. A reviewer reading the official PDF is
     * evidence; machine extraction is a convenience for that reviewer and is
     * deliberately not one of the options.
     */
    verificationMethod: verificationMethod("verification_method"),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
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
    check(
      "rule_sources_sha256_is_hex",
      sql`${t.sha256} IS NULL OR ${t.sha256} ~ '^[0-9a-f]{64}$'`
    ),
    // A verification is an act by someone, at a time, by some method.
    check(
      "rule_sources_verification_is_attributable",
      sql`(${t.verifiedBy} IS NULL AND ${t.verifiedAt} IS NULL AND ${t.verificationMethod} IS NULL)
          OR (${t.verifiedBy} IS NOT NULL AND ${t.verifiedAt} IS NOT NULL
              AND ${t.verificationMethod} IS NOT NULL)`
    ),
  ]
);

/**
 * The employment-law rule registry — what `statutoryLimits` should have been.
 *
 * One row per rule rather than a JSON blob, because each has its own instrument,
 * its own effective date and its own verification. The OT monthly cap and the
 * minimum wage do not change together and are not verified by the same reading.
 *
 * Nothing here is a calculation input. These are the thresholds the findings
 * engine reads to tell an operator that something recorded is unusual or
 * unlawful; a breach is a fact to report, never a figure to alter.
 */
export const employmentLawRules = pgTable(
  "employment_law_rules",
  {
    rulePackId: text("rule_pack_id")
      .notNull()
      .references(() => rulePacks.id, { onDelete: "cascade" }),
    /** Stable key the findings engine looks up, e.g. `OT_MAX_HOURS_MONTH`. */
    ruleKey: text("rule_key").notNull(),
    /**
     * The value, as a number in its own unit. `unit` says which — sen, hours,
     * or a bare multiplier — because a rule pack that stores 1700 without
     * saying "ringgit or sen?" is a payroll defect waiting to happen.
     */
    value: numeric({ precision: 18, scale: 6 }).notNull(),
    unit: text().notNull(),
    /** The `rule_sources.ref` this value was read from. */
    sourceRef: text("source_ref").notNull(),
    notes: text(),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.rulePackId, t.ruleKey] }),
    check(
      "employment_law_rules_unit_known",
      sql`${t.unit} IN ('SEN', 'HOURS', 'DAYS', 'MULTIPLIER', 'PERCENT', 'COUNT')`
    ),
    check(
      "employment_law_rules_key_not_blank",
      sql`length(btrim(${t.ruleKey})) > 0`
    ),
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
