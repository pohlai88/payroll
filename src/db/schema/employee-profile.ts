/**
 * HR/admin profile data for an employment, plus admin-registrable custom
 * fields — deliberately separate from `parties.ts`, which stays calc-only.
 *
 * No monetary column exists anywhere in this file, by design: money is
 * settled only through `domain/money.ts` and the typed `_sen` columns on
 * `employments`/pay lines. See MY-STAT-S02.
 *
 * Every row here is written exactly once, by the create-only bulk importer
 * (`scripts/employee-import.ts`); nothing in this codebase updates an
 * existing row, so an on-screen edit (once a UI exists) can never be
 * clobbered by a re-import.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { employeeCustomFieldDataType } from "./enums";
import { employments } from "./parties";

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const employmentProfiles = pgTable("employment_profiles", {
  employmentId: uuid("employment_id")
    .primaryKey()
    .references(() => employments.id, { onDelete: "cascade" }),
  jobTitle: text("job_title"),
  department: text(),
  superiorName: text("superior_name"),
  gender: text(),
  race: text(),
  religion: text(),
  maritalStatus: text("marital_status"),
  email: text(),
  mobileNo: text("mobile_no"),
  phoneNo: text("phone_no"),
  addressLine: text("address_line"),
  city: text(),
  state: text(),
  postalCode: text("postal_code"),
  country: text(),
  paymentMethod: text("payment_method"),
  /** Reference-only: never used for company matching. */
  finalCompanyCode: text("final_company_code"),
  masterPrimaryCompanyCode: text("master_primary_company_code"),
  payrollNotes: text("payroll_notes"),
  importSourceNotes: text("import_source_notes"),
  /**
   * Custom-field values only, keyed by `employee_custom_field_defs.field_key`.
   * Never a monetary value — see the enum note above and
   * `tests/db/employee-profile.test.ts`'s "no monetary data type" assertion.
   */
  extraAttributes: jsonb("extra_attributes").notNull().default({}),
  createdAt,
});

export const employeeCustomFieldDefs = pgTable(
  "employee_custom_field_defs",
  {
    id: uuid().primaryKey().defaultRandom(),
    fieldKey: text("field_key").notNull().unique(),
    label: text().notNull(),
    dataType: employeeCustomFieldDataType("data_type").notNull(),
    required: boolean().notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean().notNull().default(true),
    createdAt,
  },
  (t) => [
    check(
      "employee_custom_field_defs_field_key_not_blank",
      sql`length(btrim(${t.fieldKey})) > 0`
    ),
    check(
      "employee_custom_field_defs_label_not_blank",
      sql`length(btrim(${t.label})) > 0`
    ),
  ]
);

export type EmploymentProfileRow = typeof employmentProfiles.$inferSelect;
export type EmployeeCustomFieldDefRow =
  typeof employeeCustomFieldDefs.$inferSelect;
