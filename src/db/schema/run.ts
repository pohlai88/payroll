/**
 * @feature pay-run
 * @layer schema
 *
 * The pay run and its lines.
 *
 * A line freezes what it was calculated from — the employee snapshot, the item
 * definitions as they stood — so a run recomputed years later cannot be
 * reinterpreted by a catalog that has since changed. Immutability past DRAFT is
 * enforced by trigger, not by discipline.
 */

import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
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
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { payItems } from "./catalog";
import {
  offcycleReason,
  overrideField,
  payItemKind,
  pcbRemunerationClass,
  rateBasis,
  runStatus,
  runType,
} from "./enums";
import { companies, employments } from "./parties";
import { rulePacks } from "./rule-pack";

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const payRuns = pgTable(
  "pay_runs",
  {
    /** The human run identifier — `DLBB-2026-07`, `DLBB-2026-07-OC1`. It appears on artifacts. */
    id: text().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    runType: runType("run_type").notNull().default("REGULAR"),
    offcycleReason: offcycleReason("offcycle_reason"),
    /** The regular run an off-cycle run corrects or supplements. */
    linkedRunId: text("linked_run_id").references(
      (): AnyPgColumn => payRuns.id
    ),

    year: integer().notNull(),
    month: integer().notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    /** Days in the wage period — the proration divisor, not an employee attribute. */
    workingDays: integer("working_days").notNull(),

    rulePackId: text("rule_pack_id")
      .notNull()
      .references(() => rulePacks.id),
    /**
     * What this run was actually calculated by, stamped permanently.
     *
     * The pack id alone is not enough: "reproduce July 2026" has to resolve to a
     * specific content hash and a specific version of the calculation code, not
     * to whatever those names refer to today.
     */
    rulePackHash: text("rule_pack_hash"),
    calcEngineVersion: text("calc_engine_version"),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }),
    status: runStatus().notNull().default("DRAFT"),

    /**
     * Canonical hash of calculation-relevant state. Null throughout this phase:
     * it is computed and certified by the findings and gates engine, which is
     * what consumes it.
     */
    calcRevision: text("calc_revision"),
    /**
     * Last revision for which findings scan completed fully. Gate prerequisites
     * require equality with calcRevision — a failed scan must never advance this.
     */
    findingsScannedRevision: text("findings_scanned_revision"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    reviewedRevision: text("reviewed_revision"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    approvedRevision: text("approved_revision"),

    /**
     * Artifact id of the sealed closure manifest. FK enforced in SQL
     * (avoids a Drizzle cycle with `control.ts` → `pay_runs`).
     */
    closedManifestArtifactId: uuid("closed_manifest_artifact_id"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: text("closed_by"),

    createdAt,
    createdBy: text("created_by"),
  },
  (t) => [
    // §1.4: one regular run per company-period, with off-cycle runs alongside it.
    uniqueIndex("pay_runs_regular_period_unique")
      .on(t.companyId, t.year, t.month)
      .where(sql`${t.runType} = 'REGULAR'`),
    check(
      "pay_runs_offcycle_has_reason",
      sql`(${t.runType} = 'OFFCYCLE') = (${t.offcycleReason} IS NOT NULL)`
    ),
    check("pay_runs_period_ordered", sql`${t.periodEnd} >= ${t.periodStart}`),
    check("pay_runs_month_valid", sql`${t.month} BETWEEN 1 AND 12`),
    check("pay_runs_year_valid", sql`${t.year} BETWEEN 2000 AND 2999`),
    check(
      "pay_runs_working_days_valid",
      sql`${t.workingDays} BETWEEN 1 AND 31`
    ),
    index("pay_runs_company_status").on(t.companyId, t.status),
  ]
);

export const payLines = pgTable(
  "pay_lines",
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: text("run_id")
      .notNull()
      .references(() => payRuns.id, { onDelete: "cascade" }),
    employmentId: uuid("employment_id")
      .notNull()
      .references(() => employments.id),

    /**
     * The `EmployeeSnapshot` the engine consumed, frozen at line creation and
     * parsed through Zod at the repository boundary. A later change to the
     * employment record cannot rewrite what this run was calculated from.
     */
    employeeSnapshot: jsonb("employee_snapshot").notNull(),

    // ---- LineInputs ----
    workingDays: integer("working_days").notNull(),
    paidDays: numeric("paid_days", { precision: 10, scale: 4 }),
    /**
     * Hours worked in the period.
     *
     * Deliberately unbounded. Statutory-limit breaches — overtime past the
     * monthly cap, hours past the weekly maximum — are *recordable facts*, not
     * impossible ones: they happen, and a payroll system that refuses to record
     * them cannot report them. The findings engine flags them in a later phase
     * by reading `statutoryLimits` off the rule pack. Do not turn this into a
     * hard reject.
     */
    hoursWorked: numeric("hours_worked", { precision: 10, scale: 4 }),
    periodEnd: date("period_end").notNull(),

    // ---- LineResult: every figure in integer sen ----
    grossSen: bigint("gross_sen", { mode: "number" }),
    epfWagesSen: bigint("epf_wages_sen", { mode: "number" }),
    socsoWagesSen: bigint("socso_wages_sen", { mode: "number" }),
    eisWagesSen: bigint("eis_wages_sen", { mode: "number" }),
    epfEeSen: bigint("epf_ee_sen", { mode: "number" }),
    epfErSen: bigint("epf_er_sen", { mode: "number" }),
    socsoEeCoreSen: bigint("socso_ee_core_sen", { mode: "number" }),
    socsoEeSkbbkSen: bigint("socso_ee_skbbk_sen", { mode: "number" }),
    socsoErSen: bigint("socso_er_sen", { mode: "number" }),
    eisEeSen: bigint("eis_ee_sen", { mode: "number" }),
    eisErSen: bigint("eis_er_sen", { mode: "number" }),
    /** Null when PCB has not been entered. Never zero to mean absent. */
    pcbNetSen: bigint("pcb_net_sen", { mode: "number" }),
    cp38Sen: bigint("cp38_sen", { mode: "number" }),
    zakatSen: bigint("zakat_sen", { mode: "number" }),
    otherDeductionsSen: bigint("other_deductions_sen", { mode: "number" }),
    /** Null when PCB is applicable but missing — the total is genuinely unknown. */
    deductionsTotalSen: bigint("deductions_total_sen", { mode: "number" }),
    /** Null when PCB is applicable but missing. Rendered as an em dash, never as zero. */
    netSen: bigint("net_sen", { mode: "number" }),
    hrdfSen: bigint("hrdf_sen", { mode: "number" }),
    employerCostSen: bigint("employer_cost_sen", { mode: "number" }),

    /** The typed trace the payslip annex renders. The renderer never recalculates. */
    trace: jsonb(),
    computedAt: timestamp("computed_at", { withTimezone: true }),

    createdAt,
  },
  (t) => [
    unique("pay_lines_run_employment_unique").on(t.runId, t.employmentId),
    // §3.3 domain-impossible: rejected at the database, never persisted.
    check(
      "pay_lines_paid_days_within_period",
      sql`${t.paidDays} IS NULL OR (${t.paidDays} >= 0 AND ${t.paidDays} <= ${t.workingDays})`
    ),
    check(
      "pay_lines_hours_non_negative",
      sql`${t.hoursWorked} IS NULL OR ${t.hoursWorked} >= 0`
    ),
    check(
      "pay_lines_working_days_valid",
      sql`${t.workingDays} BETWEEN 1 AND 31`
    ),
    index("pay_lines_run").on(t.runId),
  ]
);

/**
 * One entered earning or deduction, with the catalog definition frozen onto it.
 *
 * Reads are served entirely from the `_snap` columns. `payItemId` is provenance
 * only — it exists so a later phase can raise "catalog changed since compute"
 * and "line references an inactive item" findings. Nothing computes from it.
 */
export const payLineItems = pgTable(
  "pay_line_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => payLines.id, { onDelete: "cascade" }),
    payItemId: uuid("pay_item_id").references(() => payItems.id),

    itemCodeSnap: text("item_code_snap").notNull(),
    kindSnap: payItemKind("kind_snap").notNull(),
    basisSnap: rateBasis("basis_snap").notNull(),
    nameEnSnap: text("name_en_snap").notNull(),
    nameMsSnap: text("name_ms_snap").notNull(),
    epfWagesSnap: boolean("epf_wages_snap").notNull(),
    socsoWagesSnap: boolean("socso_wages_snap").notNull(),
    eisWagesSnap: boolean("eis_wages_snap").notNull(),
    proratesSnap: boolean("prorates_snap").notNull(),
    pcbClassSnap: pcbRemunerationClass("pcb_class_snap")
      .notNull()
      .default("NORMAL"),
    sortSnap: integer("sort_snap").notNull().default(0),

    /** Set for quantity bases only. */
    quantity: numeric({ precision: 10, scale: 4 }),
    rateSen: bigint("rate_sen", { mode: "number" }),
    /** Set for AMOUNT and FIXED_MONTHLY only. */
    amountSen: bigint("amount_sen", { mode: "number" }),
    /** What the engine resolved: `quantity × rateSen` or the entered amount. */
    resolvedAmountSen: bigint("resolved_amount_sen", {
      mode: "number",
    }).notNull(),

    createdAt,
  },
  (t) => [
    /**
     * A quantity item carries no independent amount to disagree with the
     * quantity and rate that produced it, and vice versa. This is the database
     * half of the `LineItemInput` discriminated union.
     */
    check(
      "pay_line_items_shape_matches_basis",
      sql`(${t.quantity} IS NULL AND ${t.rateSen} IS NULL AND ${t.amountSen} IS NOT NULL)
          = (${t.basisSnap} IN ('AMOUNT', 'FIXED_MONTHLY'))`
    ),
    check(
      "pay_line_items_quantity_shape_complete",
      sql`(${t.basisSnap} IN ('AMOUNT', 'FIXED_MONTHLY'))
          OR (${t.quantity} IS NOT NULL AND ${t.rateSen} IS NOT NULL AND ${t.amountSen} IS NULL)`
    ),
    check(
      "pay_line_items_rate_non_negative",
      sql`${t.rateSen} IS NULL OR ${t.rateSen} >= 0`
    ),
    index("pay_line_items_line").on(t.lineId),
  ]
);

/** An approved replacement of a computed statutory figure. Maps to `OverrideInput`. */
export const payLineOverrides = pgTable(
  "pay_line_overrides",
  {
    lineId: uuid("line_id")
      .notNull()
      .references(() => payLines.id, { onDelete: "cascade" }),
    field: overrideField().notNull(),
    overrideSen: bigint("override_sen", { mode: "number" }).notNull(),
    /** An override without a stated reason is not auditable, so it is not allowed. */
    reason: text().notNull(),
    actor: text().notNull(),
    approvedBy: text("approved_by"),
    evidenceRef: text("evidence_ref"),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.lineId, t.field] }),
    check(
      "pay_line_overrides_reason_not_blank",
      sql`length(btrim(${t.reason})) > 0`
    ),
    // Every other statutory money column in this schema is non-negative; an
    // override is the one place that figure is hand-entered, which is exactly
    // where a typo or bad import would otherwise turn into a negative
    // deduction and an inflated net pay.
    check("pay_line_overrides_amount_non_negative", sql`${t.overrideSen} >= 0`),
  ]
);

/**
 * PCB / MTD per line — dual path.
 *
 * - Override: `pcb_amount_sen` + `verified` + `source` replaces offline compute.
 * - Compute inputs: optional `y1`/`yt`/`kt`/`lp1` month figures; tax profile and
 *   YTD come from `employment_tax_profiles` / `employment_pcb_ytd`.
 * - A null amount with incomplete compute context leaves net pay unknown.
 */
export const pcbEntries = pgTable(
  "pcb_entries",
  {
    lineId: uuid("line_id")
      .primaryKey()
      .references(() => payLines.id, { onDelete: "cascade" }),
    pcbAmountSen: bigint("pcb_amount_sen", { mode: "number" }),
    cp38Sen: bigint("cp38_sen", { mode: "number" }).notNull().default(0),
    zakatOffsetSen: bigint("zakat_offset_sen", { mode: "number" })
      .notNull()
      .default(0),
    verified: boolean().notNull().default(false),
    /**
     * Where an override figure came from. For 2026 the canonical verified
     * source is `P-CALC-2026` — the official LHDN HTML calculator.
     * See `LHDN_PCB_CALCULATOR_SOURCE_REF` in `src/domain/calc/pcb.ts`.
     */
    source: text(),
    evidenceRef: text("evidence_ref"),
    enteredBy: text("entered_by"),
    enteredAt: timestamp("entered_at", { withTimezone: true }),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /**
     * Optional current-month normal remuneration override for compute.
     * Null → compose auto-fills from non-additional earnings.
     */
    y1Sen: bigint("y1_sen", { mode: "number" }),
    /** Current-month additional remuneration (`Yt`). */
    ytSen: bigint("yt_sen", { mode: "number" }).notNull().default(0),
    /** EPF against Yt (`Kt`). */
    ktSen: bigint("kt_sen", { mode: "number" }).notNull().default(0),
    /** Current-month TP1 allowable deductions (`LP1`). */
    lp1Sen: bigint("lp1_sen", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    // Verified means someone checked a real figure against a real source.
    check(
      "pcb_entries_verified_needs_amount_and_source",
      sql`NOT ${t.verified} OR (${t.pcbAmountSen} IS NOT NULL AND ${t.source} IS NOT NULL)`
    ),
    check(
      "pcb_entries_amounts_non_negative",
      sql`(${t.pcbAmountSen} IS NULL OR ${t.pcbAmountSen} >= 0)
          AND ${t.cp38Sen} >= 0 AND ${t.zakatOffsetSen} >= 0
          AND (${t.y1Sen} IS NULL OR ${t.y1Sen} >= 0)
          AND ${t.ytSen} >= 0 AND ${t.ktSen} >= 0 AND ${t.lp1Sen} >= 0`
    ),
  ]
);

/** Append-only. Updates and deletes are rejected by trigger. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actor: text().notNull(),
    runId: text("run_id"),
    entity: text().notNull(),
    entityId: text("entity_id").notNull(),
    action: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    /** Groups the field-level children of one bulk edit under a parent event. */
    bulkOperationId: uuid("bulk_operation_id"),
  },
  (t) => [
    index("audit_events_run").on(t.runId, t.at),
    index("audit_events_entity").on(t.entity, t.entityId),
  ]
);

export type PayRunRow = typeof payRuns.$inferSelect;
export type PayLineRow = typeof payLines.$inferSelect;
export type PayLineItemRow = typeof payLineItems.$inferSelect;
