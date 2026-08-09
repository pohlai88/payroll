/**
 * @feature shell
 * @layer schema
 *
 * Multi-feature schema — see section banners for companies / employees.
 *
 * Companies, persons and employments.
 *
 * One person, many employments. The split is here from the start rather than
 * retrofitted: `EmployeeSnapshot.dob` comes from the person, and backfilling a
 * person/employment separation later means matching historical records by IC —
 * exactly the migration the workspace spec §8.1 warns about.
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
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  epfPart,
  payBasis,
  pcbCategory,
  pcbFormulaRegime,
  pcbResidence,
  socsoCategory,
  terminationReason,
} from "./enums";

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

// --- @feature companies @layer schema ---
export const companies = pgTable(
  "companies",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    name: text().notNull(),
    epfNo: text("epf_no"),
    socsoNo: text("socso_no"),
    /** LHDN employer number (E number). */
    lhdnNo: text("lhdn_no"),
    hrdfEnabled: boolean("hrdf_enabled").notNull().default(false),
    /** Percent, not sen — a levy rate, e.g. 1. */
    hrdfLevyPct: numeric("hrdf_levy_pct", { precision: 6, scale: 4 })
      .notNull()
      .default("1"),
    createdAt,
  },
  (t) => [
    check("companies_code_not_blank", sql`length(btrim(${t.code})) > 0`),
    check(
      "companies_hrdf_levy_pct_sane",
      sql`${t.hrdfLevyPct} >= 0 AND ${t.hrdfLevyPct} <= 100`
    ),
  ]
);

/**
 * The human being. Identity that survives moving between group companies.
 */
// --- @feature employees @layer schema ---
export const persons = pgTable(
  "persons",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    /** Malaysian NRIC. Derives date of birth and drives age classification. */
    ic: text(),
    passport: text(),
    dob: date(),
    nationality: text(),
    /**
     * First joining date anywhere in the group. Not calculation-relevant and
     * excluded from `calcRevision` — it informs service-based entitlements, not
     * any statutory figure.
     */
    groupServiceDate: date("group_service_date"),
    createdAt,
  },
  (t) => [
    check("persons_name_not_blank", sql`length(btrim(${t.name})) > 0`),
    // Partial: many persons legitimately have no IC on file, and NULLs must not collide.
    uniqueIndex("persons_ic_unique").on(t.ic).where(sql`${t.ic} IS NOT NULL`),
  ]
);

/**
 * The employment record — one person's engagement by one legal employer.
 *
 * Everything the engine needs about the employee lives here or on the person;
 * `EmployeeSnapshot` is composed from the pair by the repository layer and
 * frozen onto the line at run creation.
 */
export const employments = pgTable(
  "employments",
  {
    id: uuid().primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    /** The payroll-facing identifier, e.g. `DLBB1017`. Unique within the company. */
    employeeCode: text("employee_code").notNull(),
    /** Legal employment start with this employer. Drives commencement proration. */
    joinDate: date("join_date").notNull(),
    terminationDate: date("termination_date"),
    terminationReason: terminationReason("termination_reason"),
    /** Set on a transfer's receiving employment; points at the one it ended. */
    priorEmploymentId: uuid("prior_employment_id").references(
      (): AnyPgColumn => employments.id
    ),

    payBasis: payBasis("pay_basis").notNull(),
    /** Monthly basic, daily rate or hourly rate, by basis. */
    baseRateSen: bigint("base_rate_sen", { mode: "number" }).notNull(),

    isMalaysian: boolean("is_malaysian").notNull().default(true),
    isPermanentResident: boolean("is_permanent_resident")
      .notNull()
      .default(false),
    epfApplicable: boolean("epf_applicable").notNull().default(true),
    socsoApplicable: boolean("socso_applicable").notNull().default(true),
    eisApplicable: boolean("eis_applicable").notNull().default(true),
    pcbApplicable: boolean("pcb_applicable").notNull().default(true),
    /** Tri-state: null means unknown, which is not the same as false. */
    epfMemberBeforeAug1998: boolean("epf_member_before_aug_1998"),
    eisPriorContribution: boolean("eis_prior_contribution"),
    /** Set only to override the age-derived classification. */
    epfPartOverride: epfPart("epf_part_override"),
    socsoCategoryOverride: socsoCategory("socso_category_override"),

    epfNo: text("epf_no"),
    socsoNo: text("socso_no"),
    /** LHDN tax identification number. */
    tin: text(),
    bankName: text("bank_name"),
    bankAccountNo: text("bank_account_no"),
    bankAccountName: text("bank_account_name"),

    createdAt,
  },
  (t) => [
    unique("employments_company_code_unique").on(t.companyId, t.employeeCode),
    check(
      "employments_employee_code_not_blank",
      sql`length(btrim(${t.employeeCode})) > 0`
    ),
    check(
      "employments_termination_after_join",
      sql`${t.terminationDate} IS NULL OR ${t.terminationDate} >= ${t.joinDate}`
    ),
    check(
      "employments_termination_reason_matches_date",
      sql`(${t.terminationDate} IS NULL) = (${t.terminationReason} IS NULL)`
    ),
    check("employments_base_rate_non_negative", sql`${t.baseRateSen} >= 0`),
    // Run membership is an employment-period overlap query; this is the index for it.
    index("employments_company_period").on(
      t.companyId,
      t.joinDate,
      t.terminationDate
    ),
    index("employments_person").on(t.personId),
  ]
);

/**
 * Standing tax profile for offline PCB compute (1:1 with employment).
 * Absent row → COMPUTED path unavailable; override/entered path still works.
 */
export const employmentTaxProfiles = pgTable(
  "employment_tax_profiles",
  {
    employmentId: uuid("employment_id")
      .primaryKey()
      .references(() => employments.id, { onDelete: "cascade" }),
    residence: pcbResidence("residence").notNull().default("RESIDENT"),
    category: pcbCategory("category").notNull().default("1"),
    formulaRegime: pcbFormulaRegime("formula_regime")
      .notNull()
      .default("NORMAL"),
    disabledIndividual: boolean("disabled_individual").notNull().default(false),
    disabledSpouse: boolean("disabled_spouse").notNull().default(false),
    /** Precomputed qualifying child units `C` (OKU / higher-ed multipliers applied). */
    qualifyingChildUnits: integer("qualifying_child_units")
      .notNull()
      .default(0),
    electDeductBelowRm10: boolean("elect_deduct_below_rm10")
      .notNull()
      .default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "employment_tax_profiles_child_units_non_negative",
      sql`${t.qualifyingChildUnits} >= 0`
    ),
  ]
);

/**
 * Calendar-year PCB accumulators for an employment (TP3 openings + rolled YTD).
 * One row per (employment, calendar year).
 */
export const employmentPcbYtd = pgTable(
  "employment_pcb_ytd",
  {
    id: uuid().primaryKey().defaultRandom(),
    employmentId: uuid("employment_id")
      .notNull()
      .references(() => employments.id, { onDelete: "cascade" }),
    calendarYear: integer("calendar_year").notNull(),
    /** Accumulated gross remuneration prior to the current month (incl. prior employer). */
    ySen: bigint("y_sen", { mode: "number" }).notNull().default(0),
    /** Accumulated EPF against Y. */
    kSen: bigint("k_sen", { mode: "number" }).notNull().default(0),
    /** Accumulated PCB paid (excl. voluntary additional / CP500). */
    xSen: bigint("x_sen", { mode: "number" }).notNull().default(0),
    /** Accumulated zakat paid prior months. */
    zSen: bigint("z_sen", { mode: "number" }).notNull().default(0),
    /** Accumulated TP1 allowable deductions (`∑LP`). */
    accumulatedLpSen: bigint("accumulated_lp_sen", { mode: "number" })
      .notNull()
      .default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("employment_pcb_ytd_employment_year").on(
      t.employmentId,
      t.calendarYear
    ),
    check("employment_pcb_ytd_year_plausible", sql`${t.calendarYear} >= 2000`),
    check(
      "employment_pcb_ytd_amounts_non_negative",
      sql`${t.ySen} >= 0 AND ${t.kSen} >= 0 AND ${t.xSen} >= 0 AND ${t.zSen} >= 0 AND ${t.accumulatedLpSen} >= 0`
    ),
    index("employment_pcb_ytd_employment").on(t.employmentId),
  ]
);

export type CompanyRow = typeof companies.$inferSelect;
export type PersonRow = typeof persons.$inferSelect;
export type EmploymentRow = typeof employments.$inferSelect;
