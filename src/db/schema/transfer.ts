/**
 * @feature transfer
 * @layer schema
 *
 * Cross-company internal group transfer: ends an employment at one company,
 * links it to the one created at another, for the same person.
 *
 * A separate file rather than `parties.ts` because `transfers` references
 * `pay_runs` (the linked final/commencement run) and `run.ts` already
 * imports `employments` from `parties.ts` — importing `run.ts` back from
 * `parties.ts` would cycle.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  // biome-ignore lint/suspicious/noDeprecatedImports: only the varargs overload is deprecated; every call here uses primaryKey({ columns: [...] }).
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { artifacts } from "./artifacts";
import { groupServiceContinuity } from "./enums";
import { employments, persons } from "./parties";
import { payRuns } from "./run";

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

/**
 * Links an ended employment to the one it was replaced by: Company A's
 * employment record to Company B's, for the same person.
 *
 * No `status` column: with no draft-persisting wizard yet, every row here is
 * already a completed commit.
 */
export const transfers = pgTable(
  "transfers",
  {
    id: uuid().primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id),
    fromEmploymentId: uuid("from_employment_id")
      .notNull()
      .references(() => employments.id),
    toEmploymentId: uuid("to_employment_id")
      .notNull()
      .unique()
      .references(() => employments.id),
    effectiveDate: date("effective_date").notNull(),
    groupServiceContinuity: groupServiceContinuity(
      "group_service_continuity"
    ).notNull(),
    /** Required, and only meaningful, when continuity is RESET. */
    continuityReason: text("continuity_reason"),
    leaveBenefitTreatmentNote: text("leave_benefit_treatment_note"),
    /**
     * Escape hatch for the no-concurrent-employment rule enforced in
     * `commitTransfer` — deliberately not a CHECK/trigger invariant because
     * it has a legitimate, explicit override.
     */
    allowedOverlap: boolean("allowed_overlap").notNull().default(false),
    overlapReason: text("overlap_reason"),
    /**
     * Legacy free-text evidence — read-only historical. New writes set null;
     * use `evidenceArtifactId` via `storeAttachedEvidence`.
     */
    evidenceRef: text("evidence_ref"),
    /** Hashed evidence via `storeAttachedEvidence`. */
    evidenceArtifactId: uuid("evidence_artifact_id").references(
      () => artifacts.id
    ),
    /** Linked later, once that run exists — never created by the commit itself. */
    finalPayRunId: text("final_pay_run_id").references(() => payRuns.id),
    commencementRunId: text("commencement_run_id").references(() => payRuns.id),
    actor: text().notNull(),
    createdAt,
  },
  (t) => [
    check(
      "transfers_continuity_reason_required_on_reset",
      sql`(${t.groupServiceContinuity} != 'RESET') OR (length(btrim(${t.continuityReason})) > 0)`
    ),
    check(
      "transfers_overlap_reason_required_when_allowed",
      sql`(NOT ${t.allowedOverlap}) OR (length(btrim(${t.overlapReason})) > 0)`
    ),
    index("transfers_person").on(t.personId),
  ]
);

/**
 * The prior employer's calendar-year figures for a transferred employee, kept
 * for Malaysian PCB tax continuity (TP3-style data). Mirrors `pcb_entries`'
 * verified/source shape — a separate concept from `employment_pcb_ytd`, which
 * accumulates the *current* employment's own contributions.
 */
export const employmentPriorYtd = pgTable(
  "employment_prior_ytd",
  {
    employmentId: uuid("employment_id")
      .notNull()
      .references(() => employments.id, { onDelete: "cascade" }),
    calendarYear: integer("calendar_year").notNull(),
    grossSen: bigint("gross_sen", { mode: "number" }).notNull().default(0),
    epfEeSen: bigint("epf_ee_sen", { mode: "number" }).notNull().default(0),
    epfErSen: bigint("epf_er_sen", { mode: "number" }).notNull().default(0),
    socsoEeSen: bigint("socso_ee_sen", { mode: "number" }).notNull().default(0),
    socsoErSen: bigint("socso_er_sen", { mode: "number" }).notNull().default(0),
    eisEeSen: bigint("eis_ee_sen", { mode: "number" }).notNull().default(0),
    eisErSen: bigint("eis_er_sen", { mode: "number" }).notNull().default(0),
    pcbSen: bigint("pcb_sen", { mode: "number" }).notNull().default(0),
    zakatSen: bigint("zakat_sen", { mode: "number" }).notNull().default(0),
    verified: boolean().notNull().default(false),
    source: text(),
    /**
     * Legacy free-text evidence — read-only historical. New writes set null;
     * use `evidenceArtifactId`.
     */
    evidenceRef: text("evidence_ref"),
    evidenceArtifactId: uuid("evidence_artifact_id").references(
      () => artifacts.id
    ),
    enteredBy: text("entered_by"),
    enteredAt: timestamp("entered_at", { withTimezone: true }),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.employmentId, t.calendarYear] }),
    check(
      "employment_prior_ytd_year_plausible",
      sql`${t.calendarYear} >= 2000`
    ),
    check(
      "employment_prior_ytd_amounts_non_negative",
      sql`${t.grossSen} >= 0 AND ${t.epfEeSen} >= 0 AND ${t.epfErSen} >= 0
          AND ${t.socsoEeSen} >= 0 AND ${t.socsoErSen} >= 0
          AND ${t.eisEeSen} >= 0 AND ${t.eisErSen} >= 0
          AND ${t.pcbSen} >= 0 AND ${t.zakatSen} >= 0`
    ),
    check(
      "employment_prior_ytd_verified_needs_source",
      sql`NOT ${t.verified} OR ${t.source} IS NOT NULL`
    ),
  ]
);

export type TransferRow = typeof transfers.$inferSelect;
export type EmploymentPriorYtdRow = typeof employmentPriorYtd.$inferSelect;
