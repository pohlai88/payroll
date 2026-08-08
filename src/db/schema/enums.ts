/**
 * Postgres enums, each mirroring a TypeScript union in `src/domain/calc/types.ts`.
 *
 * The members are written out literally rather than derived from the unions,
 * because a generated enum would silently follow a code change that the database
 * has no migration for. `tests/db/enums.test.ts` asserts membership equality in
 * both directions instead, so adding a union member without a migration fails
 * loudly rather than drifting.
 */

import { pgEnum } from "drizzle-orm/pg-core";

/** `PayItemDef["kind"]` — closed. A third kind is a code change plus a migration. */
export const payItemKind = pgEnum("pay_item_kind", ["EARNING", "DEDUCTION"]);

/** `RateBasis` — how an item's amount is arrived at. */
export const rateBasis = pgEnum("rate_basis", [
  "FIXED_MONTHLY",
  "PER_DAY",
  "PER_HOUR",
  "PER_UNIT",
  "AMOUNT",
]);

/** `PayBasis` — how the employment itself is paid. */
export const payBasis = pgEnum("pay_basis", ["MONTHLY", "DAILY", "HOURLY"]);

/** `EpfPart` — EPF Third Schedule part. */
export const epfPart = pgEnum("epf_part", ["A", "C", "E", "F", "NONE"]);

/** `SocsoCategory`. */
export const socsoCategory = pgEnum("socso_category", [
  "FIRST",
  "SECOND",
  "NONE",
]);

/** Spec §1.1. PAID is deliberately absent: payment is a line-level rollup. */
export const runStatus = pgEnum("run_status", [
  "DRAFT",
  "REVIEWED",
  "APPROVED",
  "CLOSED",
]);

/** Spec §1.4. */
export const runType = pgEnum("run_type", ["REGULAR", "OFFCYCLE"]);

export const offcycleReason = pgEnum("offcycle_reason", [
  "CORRECTION",
  "ARREARS",
  "BONUS",
  "MISSED_PAYMENT",
  "FINAL_PAYMENT",
]);

/**
 * Which authority a rule pack speaks for.
 *
 * Three different kinds of fact with three different governance regimes: a
 * contribution schedule, a gazetted working-hours maximum and a company
 * allowance rate are not interchangeable, and must not share a container.
 */
export const rulePackLayer = pgEnum("rule_pack_layer", [
  "STATUTORY_CALCULATION",
  "EMPLOYMENT_LAW",
  "COMPANY_POLICY",
]);

/**
 * A rule pack's life. Only APPROVED and EFFECTIVE may reach a payroll run.
 *
 * SOURCE_CAPTURED means the instrument and its evidence are recorded; VERIFIED
 * means a human has read the provision and confirmed the values against it;
 * APPROVED means someone has taken responsibility for it. SUPERSEDED packs stay
 * exactly as they were — a run calculated under one must remain reproducible.
 */
export const rulePackStatus = pgEnum("rule_pack_status", [
  "DRAFT",
  "SOURCE_CAPTURED",
  "VERIFIED",
  "APPROVED",
  "EFFECTIVE",
  "SUPERSEDED",
]);

/**
 * How a figure was established.
 *
 * Human review of an official PDF is a first-class method: the gazette is the
 * authority, and a reviewer reading it is evidence. Machine extraction is a
 * convenience for the reviewer, never a substitute for one, and so is not a
 * method here.
 */
export const verificationMethod = pgEnum("verification_method", [
  "HUMAN_REVIEW_OF_OFFICIAL_PDF",
  "OFFICIAL_HTML_PAGE",
  "OFFICIAL_API",
  "ISSUER_CORRESPONDENCE",
]);

/** `OverrideInput["field"]` — the statutory figures an approved override may replace. */
export const overrideField = pgEnum("override_field", [
  "EPF_EE",
  "EPF_ER",
  "SOCSO_EE_CORE",
  "SOCSO_EE_SKBBK",
  "SOCSO_ER",
  "EIS_EE",
  "EIS_ER",
  "EPF_WAGES",
  "SOCSO_WAGES",
  "EIS_WAGES",
]);

/** PCB tax residence for offline MTD compute. */
export const pcbResidence = pgEnum("pcb_residence", [
  "RESIDENT",
  "NON_RESIDENT",
]);

/** LHDN MTD employee category 1 / 2 / 3. */
export const pcbCategory = pgEnum("pcb_category", ["1", "2", "3"]);

/** Computerized MTD formula regime (resident). */
export const pcbFormulaRegime = pgEnum("pcb_formula_regime", [
  "NORMAL",
  "REP",
  "KNOWLEDGE_WORKER",
  "C_SUITE",
]);

/** Why an employment ended. */
export const terminationReason = pgEnum("termination_reason", [
  "RESIGNATION",
  "DISMISSAL",
  "CONTRACT_END",
  "INTERNAL_GROUP_TRANSFER",
  "RETIREMENT",
  "OTHER",
]);

/** Whether a transferred person's group tenure clock carries over or restarts. */
export const groupServiceContinuity = pgEnum("group_service_continuity", [
  "CONTINUOUS",
  "RESET",
]);

/** Whether a login account may authenticate. */
export const userStatus = pgEnum("user_status", ["ACTIVE", "DISABLED"]);

/**
 * How far a role's grants reach.
 *
 * GLOBAL applies system-wide (System Admin, cross-company operators).
 * COMPANY applies only within a specific company assignment.
 */
export const roleScope = pgEnum("role_scope", ["GLOBAL", "COMPANY"]);

/** Row of the permission matrix — a payroll domain module. */
export const permissionResource = pgEnum("permission_resource", [
  "COMPANY",
  "EMPLOYMENT",
  "PAY_RUN",
  "PAY_ITEM",
  "RULE_PACK",
  "REPORT",
]);

/** Column of the permission matrix — a CRUD verb. */
export const permissionAction = pgEnum("permission_action", [
  "CREATE",
  "READ",
  "UPDATE",
  "DELETE",
]);

/**
 * `CustomFieldDef["dataType"]` — deliberately has no monetary member. Any
 * amount an admin wants to capture belongs in `pay_items`/`employments`
 * through `domain/money.ts`, never in a custom field. See MY-STAT-S02 and
 * docs/superpowers/specs/2026-08-08-employee-master-import-design.md.
 */
export const employeeCustomFieldDataType = pgEnum(
  "employee_custom_field_data_type",
  ["TEXT", "NUMBER", "DATE", "BOOLEAN"]
);
