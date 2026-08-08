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
