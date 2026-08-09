/**
 * @feature control
 * @layer schema
 *
 * The closure chain — one row per closed run, each linked to the previous
 * closure in the same company.
 *
 * Append-only at the database level (migration 0024): no UPDATE, no DELETE,
 * not even by the application role. That is the whole point. A seal that could
 * be rewritten would attest to nothing, because the rewrite is exactly what
 * the chain exists to expose.
 */

import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./parties";
import { payRuns } from "./run";

export const closureSeals = pgTable(
  "closure_seals",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** One seal per run: a run is closed once. */
    runId: text("run_id")
      .notNull()
      .unique("closure_seals_run_unique")
      .references(() => payRuns.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    /** 1-based position in this company's chain. */
    sequence: integer().notNull(),
    /** SHA-256 of the sealed `manifest.json`, which carries every artifact hash. */
    manifestSha256: text("manifest_sha256").notNull(),
    manifestArtifactId: uuid("manifest_artifact_id").notNull(),
    calcRevision: text("calc_revision"),
    approvedRevision: text("approved_revision"),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
    closedBy: text("closed_by").notNull(),
    /** Null only at sequence 1 — the company's genesis closure. */
    previousSealHash: text("previous_seal_hash"),
    sealHash: text("seal_hash").notNull(),
    /** Canonical form version, so an old seal stays verifiable after a bump. */
    sealVersion: text("seal_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("closure_seals_company_sequence_unique").on(t.companyId, t.sequence),
    // A repeated link would fork the chain into two branches of equal standing.
    unique("closure_seals_company_previous_unique").on(
      t.companyId,
      t.previousSealHash
    ),
    check("closure_seals_sequence_positive", sql`${t.sequence} >= 1`),
    check(
      "closure_seals_genesis_has_no_link",
      sql`(${t.sequence} = 1) = (${t.previousSealHash} IS NULL)`
    ),
    index("closure_seals_company_sequence").on(t.companyId, t.sequence),
  ]
);

export type ClosureSealRow = typeof closureSeals.$inferSelect;
