# Employee Master Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a CSV/JSON template + create-only bulk importer that turns rows of the "Employee Master" data into `persons` + `employments` + a new `employment_profiles` row each, with admin-extensible custom fields — without ever touching `persons`/`employments`' calc-only nature or letting any monetary figure escape `money.ts`.

**Architecture:** Two new tables (`employment_profiles`, `employee_custom_field_defs`) added alongside the existing `parties.ts` schema. A pure `domain/import/employee-row.ts` module maps/validates one raw row; a `repo/employee-profile.ts` module does the DB reads/writes; a `service/employee-import.ts` module orchestrates row-by-row create-only import; two thin CLI scripts (`employee-template.ts`, `employee-import.ts`) are the only I/O-touching entry points.

**Tech Stack:** TypeScript, Drizzle ORM (Postgres), Vitest, `csv-parse` (new dependency, sync API, for CSV parsing only — JSON import needs no new dependency).

## Global Constraints

- **Create-only, forever:** nothing in this feature ever updates an existing `persons`/`employments`/`employment_profiles` row. A matched `(employee_code, payroll_company_code)` pair is always skipped, never overwritten.
- **No monetary values in the profile:** `employment_profiles` and `employee_custom_field_defs` (including `extra_attributes` and the `data_type` enum) must never hold a monetary figure. The one RM value this feature touches (`Base Rate RM`) is converted via `domain/money.ts`'s `parseRM` straight into `employments.base_rate_sen` — never staged anywhere else.
- **One authoritative company-code column:** `Payroll Company Code` is the only column matched against `companies.code`. `Final Company Code` / `Master Primary Company Code` are stored verbatim on the profile as reference text and never used for matching.
- **Custom fields are seed-file-driven:** `employee_custom_field_defs` rows come only from `db/seed/employee-custom-fields.json` via `scripts/seed.ts`, following the existing hash-tracked seed-file convention (see `scripts/seed.ts`, `tests/db/seed-integrity.test.ts`). No CRUD API/UI this slice.
- **Unrecognized columns fail the import** (whole file), unless `--auto-register` is passed to `scripts/employee-import.ts`.
- Follow existing repo conventions: Drizzle schema → `npm run db:generate` → generated migration (do not hand-write migration SQL/snapshot JSON), `@/` path alias inside `src`/`tests`, relative imports inside `scripts/` (matches `scripts/seed.ts`).

---

## Task 1: Schema + migration for `employment_profiles` and `employee_custom_field_defs`

**Files:**
- Modify: `src/db/schema/enums.ts`
- Create: `src/db/schema/employee-profile.ts`
- Modify: `tests/db/harness/database.ts` (`ALL_TABLES`)
- Create: `tests/db/employee-profile.test.ts`
- Generated (via `db:generate`, do not hand-write): `src/db/migrations/0013_*.sql`, `src/db/migrations/meta/0013_snapshot.json`, `src/db/migrations/meta/_journal.json` (updated)

**Interfaces:**
- Produces: `employmentProfiles` table, `employeeCustomFieldDefs` table, `EmploymentProfileRow`, `EmployeeCustomFieldDefRow` types, `employeeCustomFieldDataType` enum — all exported from `@/db/schema/employee-profile` (tables) and `@/db/schema/enums` (enum). Later tasks import these.

- [ ] **Step 1: Add the enum**

Append to `src/db/schema/enums.ts` (after `permissionAction`):

```ts
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
```

- [ ] **Step 2: Write the new schema file**

Create `src/db/schema/employee-profile.ts`:

```ts
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
```

- [ ] **Step 3: Generate the migration**

Run:
```bash
npm run db:generate
```
Expected: a new `src/db/migrations/0013_<auto-name>.sql` and updated `meta/_journal.json` + a new `meta/0013_snapshot.json` appear. Open the generated SQL and confirm it contains: `CREATE TYPE "public"."employee_custom_field_data_type"`, `CREATE TABLE "employment_profiles"` with an FK to `employments(id)` `ON DELETE cascade`, and `CREATE TABLE "employee_custom_field_defs"` with a unique constraint on `field_key` and the two check constraints. If drizzle-kit names the migration file something other than a recognizable name, rename it to `0013_employee_profile.sql` and update the corresponding entry in `meta/_journal.json` to match (same pattern as existing numbered migrations).

- [ ] **Step 4: Apply the migration locally**

Run:
```bash
docker compose up -d
export DATABASE_URL=postgres://payroll:payroll@localhost:54329/payroll
npm run db:migrate
```
Expected: migration `0013` applies with no errors.

- [ ] **Step 5: Add the two new tables to the test truncation list**

In `tests/db/harness/database.ts`, add to `ALL_TABLES` (`TRUNCATE ... CASCADE` handles ordering, so position doesn't matter — add near `employments`):

```ts
export const ALL_TABLES = [
  "audit_events",
  "pcb_entries",
  "pay_line_overrides",
  "pay_line_items",
  "pay_lines",
  "pay_runs",
  "employment_pay_items",
  "employment_pcb_ytd",
  "employment_tax_profiles",
  "employment_profiles",
  "employee_custom_field_defs",
  "employments",
  "persons",
  "user_role_assignments",
  "role_permissions",
  "roles",
  "users",
  "companies",
  "pay_items",
  "epf_bands",
  "socso_bands",
  "eis_bands",
  "employment_law_rules",
  "rule_settings",
  "rule_sources",
  "rule_packs",
  "seed_files",
] as const;
```

- [ ] **Step 6: Write the failing constraint test**

Create `tests/db/employee-profile.test.ts`:

```ts
/**
 * Constraints for the employee bulk-import tables, and the guarantee that
 * `employee_custom_field_data_type` can never express a monetary value.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ALL_TABLES,
  connectTestDatabase,
  expectRejected,
  type TestDatabase,
} from "./harness/database";

const database: TestDatabase = connectTestDatabase();
const { db } = database;

const COMPANY = "11111111-1111-1111-1111-111111111111";
const PERSON = "22222222-2222-2222-2222-222222222222";
const EMPLOYMENT = "33333333-3333-3333-3333-333333333333";

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.truncate(...ALL_TABLES);
  await db.execute(sql`
    INSERT INTO companies (id, code, name)
    VALUES (${COMPANY}, 'TESTCO', 'Test Sdn Bhd')`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON}, 'TEST PERSON', '920713-10-5913', '1992-07-13')`);
  await db.execute(sql`
    INSERT INTO employments (id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen)
    VALUES (${EMPLOYMENT}, ${PERSON}, ${COMPANY}, 'E001', '2020-01-01', 'MONTHLY', 350000)`);
});

describe("employment_profiles", () => {
  it("cascades on employment delete", async () => {
    await db.execute(sql`
      INSERT INTO employment_profiles (employment_id, job_title)
      VALUES (${EMPLOYMENT}, 'Clerk')`);
    await db.execute(sql`DELETE FROM employments WHERE id = ${EMPLOYMENT}`);
    const rows = await db.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM employment_profiles`
    );
    expect(Number(rows.rows[0]?.count)).toBe(0);
  });

  it("defaults extra_attributes to an empty object", async () => {
    await db.execute(sql`
      INSERT INTO employment_profiles (employment_id) VALUES (${EMPLOYMENT})`);
    const rows = await db.execute<{ extra: unknown }>(
      sql`SELECT extra_attributes AS extra FROM employment_profiles WHERE employment_id = ${EMPLOYMENT}`
    );
    expect(rows.rows[0]?.extra).toEqual({});
  });
});

describe("employee_custom_field_defs", () => {
  it("rejects a duplicate field_key", async () => {
    await db.execute(sql`
      INSERT INTO employee_custom_field_defs (field_key, label, data_type)
      VALUES ('uniform_size', 'Uniform Size', 'TEXT')`);
    await expectRejected(
      db.execute(sql`
        INSERT INTO employee_custom_field_defs (field_key, label, data_type)
        VALUES ('uniform_size', 'Uniform Size Again', 'TEXT')`),
      /duplicate key value|unique constraint/
    );
  });

  it("rejects a blank field_key", async () => {
    await expectRejected(
      db.execute(sql`
        INSERT INTO employee_custom_field_defs (field_key, label, data_type)
        VALUES ('   ', 'Blank Key', 'TEXT')`),
      /employee_custom_field_defs_field_key_not_blank/
    );
  });

  it("has no monetary data_type member", async () => {
    const rows = await db.execute<{ label: string }>(sql`
      SELECT e.enumlabel AS label
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'employee_custom_field_data_type'
      ORDER BY e.enumsortorder`);
    const labels = rows.rows.map((r) => r.label);
    expect(labels).toEqual(["TEXT", "NUMBER", "DATE", "BOOLEAN"]);
    for (const label of labels) {
      expect(label).not.toMatch(/MONEY|CURRENCY|AMOUNT|SEN|RM/i);
    }
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `DATABASE_URL=postgres://payroll:payroll@localhost:54329/payroll npx vitest run --project db tests/db/employee-profile.test.ts`
Expected: FAIL — relation `employment_profiles` does not exist (until migration is applied) or table not yet migrated in the test DB.

- [ ] **Step 8: Make it pass**

Run: `npm run db:migrate` again against the same `DATABASE_URL` the test harness uses (the local docker DB), then re-run:
Run: `npx vitest run --project db tests/db/employee-profile.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Commit**

```bash
git add src/db/schema/enums.ts src/db/schema/employee-profile.ts src/db/migrations/0013_* src/db/migrations/meta/_journal.json src/db/migrations/meta/0013_snapshot.json tests/db/harness/database.ts tests/db/employee-profile.test.ts
git commit -m "feat: add employment_profiles and employee_custom_field_defs tables"
```

---

## Task 2: Custom-field seed file + `scripts/seed.ts` loader

**Files:**
- Create: `db/seed/employee-custom-fields.json`
- Modify: `scripts/seed.ts`

**Interfaces:**
- Consumes: `employeeCustomFieldDefs` table from Task 1 (`@/db/schema/employee-profile`).
- Produces: seeded rows in `employee_custom_field_defs`, readable via `repo/employee-profile.ts`'s `listActiveCustomFieldDefs` (Task 4).

- [ ] **Step 1: Write the seed file**

Create `db/seed/employee-custom-fields.json`:

```json
{
  "fields": [
    {
      "fieldKey": "uniform_size",
      "label": "Uniform Size",
      "dataType": "TEXT",
      "required": false,
      "sortOrder": 1,
      "active": true
    }
  ]
}
```

- [ ] **Step 2: Add the loader to `scripts/seed.ts`**

Add the import (with the other schema imports near the top):

```ts
import { employeeCustomFieldDefs } from "../src/db/schema/employee-profile";
```

Add this interface and function after `seedRbac`:

```ts
interface EmployeeCustomFieldSeed {
  fields: Array<{
    fieldKey: string;
    label: string;
    dataType: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN";
    required: boolean;
    sortOrder: number;
    active: boolean;
  }>;
}

/**
 * Custom employee-profile fields. Idempotent and always refreshed on
 * re-seed — unlike an approved rule pack, these are admin config, not a
 * statutory figure someone has signed off on.
 */
async function seedEmployeeCustomFields(db: Database): Promise<void> {
  const file = read<EmployeeCustomFieldSeed>("employee-custom-fields.json");
  for (const field of file.data.fields) {
    await db
      .insert(employeeCustomFieldDefs)
      .values({
        fieldKey: field.fieldKey,
        label: field.label,
        dataType: field.dataType,
        required: field.required,
        sortOrder: field.sortOrder,
        active: field.active,
      })
      .onConflictDoUpdate({
        target: employeeCustomFieldDefs.fieldKey,
        set: {
          label: field.label,
          dataType: field.dataType,
          required: field.required,
          sortOrder: field.sortOrder,
          active: field.active,
        },
      });
  }
  await recordSeedFiles(db, [file]);
}
```

Call it from both branches of `seed()` — the early-return (already-approved-pack) branch and the main path — right next to the existing `await seedRbac(db);` calls:

```ts
    await seedRbac(db);
    await seedEmployeeCustomFields(db);
    return packId;
```
(early-return branch, replace the existing `await seedRbac(db); return packId;` pair)

```ts
  await seedRbac(db);
  await seedEmployeeCustomFields(db);
  return packId;
```
(end of function, replace the existing `await seedRbac(db); return packId;` pair)

- [ ] **Step 3: Run the existing seed-integrity test to verify it fails first**

Run: `DATABASE_URL=postgres://payroll:payroll@localhost:54329/payroll npx vitest run --project db tests/db/seed-integrity.test.ts`
Expected: FAIL on "covers every seed file in the directory" — `seed_files` table doesn't yet have `employee-custom-fields.json` recorded, because the loader hasn't been wired in yet. (If Step 2 is done before running this, skip straight to Step 4 — this step exists to prove the test is actually sensitive to the change.)

- [ ] **Step 4: Run it again after wiring in the loader**

Run: `npx vitest run --project db tests/db/seed-integrity.test.ts`
Expected: PASS — `employee-custom-fields.json` now appears in `seed_files`, hashed.

- [ ] **Step 5: Commit**

```bash
git add db/seed/employee-custom-fields.json scripts/seed.ts
git commit -m "feat: seed employee custom field definitions"
```

---

## Task 3: Pure row mapping/validation — `domain/import/employee-row.ts`

**Files:**
- Create: `src/domain/import/employee-row.ts`
- Test: `tests/domain/employee-row.test.ts`

**Interfaces:**
- Consumes: `parseRM` from `@/domain/money`.
- Produces: `FIXED_HEADERS`, `ParsedEmployeeRow`, `CustomFieldDef`, `RowError`, `parseEmployeeRow(raw, customFieldDefs)` — consumed by Task 4 (`repo/employee-profile.ts`'s `createEmployeeFromImport` takes a `ParsedEmployeeRow`) and Task 5 (`service/employee-import.ts` calls `parseEmployeeRow`).

- [ ] **Step 1: Write the failing tests**

Create `tests/domain/employee-row.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  FIXED_HEADERS,
  parseEmployeeRow,
  type CustomFieldDef,
} from "@/domain/import/employee-row";

function baseRow(): Record<string, string> {
  return {
    "Employee Code": "DLBB1001",
    "Payroll Company Code": "DLBB",
    "Person IC": "860502435427",
    "Person Name": "LIM KIAN TECK",
    "Person Passport": "",
    "Person DOB": "1986-05-02",
    "Person Nationality": "MALAYSIAN",
    "Join Date": "2023-08-01",
    "Pay Basis": "MONTHLY",
    "Base Rate RM": "10,000.00",
    "Is Malaysian": "Yes",
    "Is Permanent Resident": "No",
    "EPF Applicable": "Yes",
    "SOCSO Applicable": "Yes",
    "EIS Applicable": "Yes",
    "PCB Applicable": "Yes",
    "EPF No": "17378402",
    "SOCSO No": "IG21057338040",
    TIN: "860502435427",
    "Bank Name": "PUBLIC BANK",
    "Bank Account No": "4502410032",
    "Job Title": "R&D DIRECTOR",
    Department: "R&D",
    "Superior Name": "WEE POH LAI",
    Gender: "M",
    Race: "Chinese",
    Religion: "Buddhist",
    "Marital Status": "Married",
    Email: "ktlim@delettucebear.com",
    "Mobile No": "012-7668567",
    "Phone No": "012-7668567",
    "Address Line": "24, Lorong Sentosa 6A/KS6",
    City: "Klang",
    State: "Selangor",
    "Postal Code": "41200",
    Country: "MY",
    "Payment Method": "Bank Transfer",
    "Final Company Code": "DLBB",
    "Master Primary Company Code": "DLBB",
    "Payroll Notes": "",
    "Import Source Notes": "OK",
  };
}

describe("parseEmployeeRow", () => {
  it("parses a complete valid row", () => {
    const result = parseEmployeeRow(baseRow(), []);
    if ("errors" in result) {
      throw new Error(`expected success, got errors: ${JSON.stringify(result.errors)}`);
    }
    expect(result.row.employeeCode).toBe("DLBB1001");
    expect(result.row.baseRateSen).toBe(1_000_000);
    expect(result.row.payBasis).toBe("MONTHLY");
    expect(result.row.isMalaysian).toBe(true);
    expect(result.row.isPermanentResident).toBe(false);
    expect(result.row.profile.jobTitle).toBe("R&D DIRECTOR");
  });

  it("collects every missing required field, not just the first", () => {
    const row = baseRow();
    row["Employee Code"] = "";
    row["Person Name"] = "";
    const result = parseEmployeeRow(row, []);
    if (!("errors" in result)) {
      throw new Error("expected errors");
    }
    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain("Employee Code");
    expect(fields).toContain("Person Name");
  });

  it("rejects an invalid Pay Basis", () => {
    const row = baseRow();
    row["Pay Basis"] = "WEEKLY";
    const result = parseEmployeeRow(row, []);
    if (!("errors" in result)) {
      throw new Error("expected errors");
    }
    expect(result.errors.some((e) => e.field === "Pay Basis")).toBe(true);
  });

  it("rejects an unparseable Base Rate RM", () => {
    const row = baseRow();
    row["Base Rate RM"] = "not-a-number";
    const result = parseEmployeeRow(row, []);
    if (!("errors" in result)) {
      throw new Error("expected errors");
    }
    expect(result.errors.some((e) => e.field === "Base Rate RM")).toBe(true);
  });

  it("rejects an unrecognized column", () => {
    const row = { ...baseRow(), "Mystery Column": "x" };
    const result = parseEmployeeRow(row, []);
    if (!("errors" in result)) {
      throw new Error("expected errors");
    }
    expect(result.errors.some((e) => e.field === "Mystery Column")).toBe(true);
  });

  it("parses a custom field by label into extraAttributes keyed by fieldKey", () => {
    const defs: CustomFieldDef[] = [
      { fieldKey: "uniform_size", label: "Uniform Size", dataType: "TEXT", required: false },
    ];
    const row = { ...baseRow(), "Uniform Size": "L" };
    const result = parseEmployeeRow(row, defs);
    if ("errors" in result) {
      throw new Error(`expected success, got errors: ${JSON.stringify(result.errors)}`);
    }
    expect(result.row.extraAttributes).toEqual({ uniform_size: "L" });
  });

  it("fails when a required custom field is blank", () => {
    const defs: CustomFieldDef[] = [
      { fieldKey: "badge_no", label: "Badge No", dataType: "TEXT", required: true },
    ];
    const result = parseEmployeeRow(baseRow(), defs);
    if (!("errors" in result)) {
      throw new Error("expected errors");
    }
    expect(result.errors.some((e) => e.field === "Badge No")).toBe(true);
  });

  it("FIXED_HEADERS has no duplicate headers", () => {
    const headers = FIXED_HEADERS.map((h) => h.header);
    expect(new Set(headers).size).toBe(headers.length);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --project domain tests/domain/employee-row.test.ts`
Expected: FAIL — `Cannot find module '@/domain/import/employee-row'`.

- [ ] **Step 3: Implement**

Create `src/domain/import/employee-row.ts`:

```ts
/**
 * Pure mapping/validation from a raw spreadsheet row (string-keyed,
 * string-valued) to a typed row ready for `repo/employee-profile.ts`.
 *
 * No database access and no I/O — this is what `tests/domain/employee-row.test.ts`
 * exercises without Postgres, and what both the template generator and the
 * import script share so the two can never drift out of sync.
 */

import { parseRM } from "@/domain/money";

export type PayBasisValue = "MONTHLY" | "DAILY" | "HOURLY";

export interface EmployeeProfileFields {
  jobTitle: string | null;
  department: string | null;
  superiorName: string | null;
  gender: string | null;
  race: string | null;
  religion: string | null;
  maritalStatus: string | null;
  email: string | null;
  mobileNo: string | null;
  phoneNo: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  paymentMethod: string | null;
  finalCompanyCode: string | null;
  masterPrimaryCompanyCode: string | null;
  payrollNotes: string | null;
  importSourceNotes: string | null;
}

export interface ParsedEmployeeRow {
  employeeCode: string;
  payrollCompanyCode: string;
  personIc: string | null;
  personName: string;
  personPassport: string | null;
  personDob: string | null;
  personNationality: string | null;
  joinDate: string;
  payBasis: PayBasisValue;
  baseRateSen: number;
  isMalaysian: boolean;
  isPermanentResident: boolean;
  epfApplicable: boolean;
  socsoApplicable: boolean;
  eisApplicable: boolean;
  pcbApplicable: boolean;
  epfNo: string | null;
  socsoNo: string | null;
  tin: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  profile: EmployeeProfileFields;
  extraAttributes: Record<string, string | number | boolean>;
}

export interface CustomFieldDef {
  fieldKey: string;
  label: string;
  dataType: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN";
  required: boolean;
}

export interface RowError {
  field: string;
  reason: string;
}

/** Header order fixes the template's column order; `required` drives validation. */
export const FIXED_HEADERS: ReadonlyArray<{
  header: string;
  key: string;
  required: boolean;
}> = [
  { header: "Employee Code", key: "employeeCode", required: true },
  { header: "Payroll Company Code", key: "payrollCompanyCode", required: true },
  { header: "Person IC", key: "personIc", required: false },
  { header: "Person Name", key: "personName", required: true },
  { header: "Person Passport", key: "personPassport", required: false },
  { header: "Person DOB", key: "personDob", required: false },
  { header: "Person Nationality", key: "personNationality", required: false },
  { header: "Join Date", key: "joinDate", required: true },
  { header: "Pay Basis", key: "payBasis", required: true },
  { header: "Base Rate RM", key: "baseRateRm", required: true },
  { header: "Is Malaysian", key: "isMalaysian", required: false },
  { header: "Is Permanent Resident", key: "isPermanentResident", required: false },
  { header: "EPF Applicable", key: "epfApplicable", required: false },
  { header: "SOCSO Applicable", key: "socsoApplicable", required: false },
  { header: "EIS Applicable", key: "eisApplicable", required: false },
  { header: "PCB Applicable", key: "pcbApplicable", required: false },
  { header: "EPF No", key: "epfNo", required: false },
  { header: "SOCSO No", key: "socsoNo", required: false },
  { header: "TIN", key: "tin", required: false },
  { header: "Bank Name", key: "bankName", required: false },
  { header: "Bank Account No", key: "bankAccountNo", required: false },
  { header: "Job Title", key: "jobTitle", required: false },
  { header: "Department", key: "department", required: false },
  { header: "Superior Name", key: "superiorName", required: false },
  { header: "Gender", key: "gender", required: false },
  { header: "Race", key: "race", required: false },
  { header: "Religion", key: "religion", required: false },
  { header: "Marital Status", key: "maritalStatus", required: false },
  { header: "Email", key: "email", required: false },
  { header: "Mobile No", key: "mobileNo", required: false },
  { header: "Phone No", key: "phoneNo", required: false },
  { header: "Address Line", key: "addressLine", required: false },
  { header: "City", key: "city", required: false },
  { header: "State", key: "state", required: false },
  { header: "Postal Code", key: "postalCode", required: false },
  { header: "Country", key: "country", required: false },
  { header: "Payment Method", key: "paymentMethod", required: false },
  { header: "Final Company Code", key: "finalCompanyCode", required: false },
  {
    header: "Master Primary Company Code",
    key: "masterPrimaryCompanyCode",
    required: false,
  },
  { header: "Payroll Notes", key: "payrollNotes", required: false },
  { header: "Import Source Notes", key: "importSourceNotes", required: false },
];

const PAY_BASIS_VALUES = new Set(["MONTHLY", "DAILY", "HOURLY"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function blankToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function parseYesNo(value: string | undefined, fallback: boolean): boolean {
  const v = (value ?? "").trim().toUpperCase();
  if (v === "") {
    return fallback;
  }
  if (v === "YES" || v === "Y" || v === "TRUE") {
    return true;
  }
  if (v === "NO" || v === "N" || v === "FALSE") {
    return false;
  }
  throw new Error(`expected Yes/No, got ${JSON.stringify(value)}`);
}

function parseCustomValue(
  raw: string,
  dataType: CustomFieldDef["dataType"]
): string | number | boolean {
  if (dataType === "TEXT") {
    return raw;
  }
  if (dataType === "NUMBER") {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw new Error(`expected a number, got ${JSON.stringify(raw)}`);
    }
    return n;
  }
  if (dataType === "DATE") {
    if (!ISO_DATE.test(raw)) {
      throw new Error(`expected YYYY-MM-DD, got ${JSON.stringify(raw)}`);
    }
    return raw;
  }
  // BOOLEAN
  return parseYesNo(raw, false);
}

const BOOLEAN_FIELDS: ReadonlyArray<readonly [string, boolean]> = [
  ["Is Malaysian", true],
  ["Is Permanent Resident", false],
  ["EPF Applicable", true],
  ["SOCSO Applicable", true],
  ["EIS Applicable", true],
  ["PCB Applicable", true],
];

/**
 * Parses one raw row. Never throws: every failure is collected into the
 * returned error list, so the caller can report every problem on a row in
 * one pass rather than stopping at the first.
 */
export function parseEmployeeRow(
  raw: Record<string, string | undefined>,
  customFieldDefs: readonly CustomFieldDef[]
): { row: ParsedEmployeeRow } | { errors: RowError[] } {
  const errors: RowError[] = [];
  const get = (header: string): string | undefined => raw[header];

  for (const h of FIXED_HEADERS) {
    if (h.required && blankToNull(get(h.header)) === null) {
      errors.push({ field: h.header, reason: "required field is blank" });
    }
  }

  let payBasis: PayBasisValue = "MONTHLY";
  const payBasisRaw = (get("Pay Basis") ?? "").trim().toUpperCase();
  if (payBasisRaw !== "") {
    if (!PAY_BASIS_VALUES.has(payBasisRaw)) {
      errors.push({
        field: "Pay Basis",
        reason: `must be one of MONTHLY, DAILY, HOURLY; got ${JSON.stringify(payBasisRaw)}`,
      });
    } else {
      payBasis = payBasisRaw as PayBasisValue;
    }
  }

  const joinDateRaw = (get("Join Date") ?? "").trim();
  if (joinDateRaw !== "" && !ISO_DATE.test(joinDateRaw)) {
    errors.push({
      field: "Join Date",
      reason: `must be YYYY-MM-DD, got ${JSON.stringify(joinDateRaw)}`,
    });
  }

  const personDobRaw = blankToNull(get("Person DOB"));
  if (personDobRaw !== null && !ISO_DATE.test(personDobRaw)) {
    errors.push({
      field: "Person DOB",
      reason: `must be YYYY-MM-DD, got ${JSON.stringify(personDobRaw)}`,
    });
  }

  const baseRateRaw = get("Base Rate RM") ?? "";
  const baseRateSen = parseRM(baseRateRaw.trim());
  if (baseRateSen === null) {
    errors.push({
      field: "Base Rate RM",
      reason: `not a valid RM amount: ${JSON.stringify(baseRateRaw)}`,
    });
  }

  const booleans: Record<string, boolean> = {};
  for (const [header, fallback] of BOOLEAN_FIELDS) {
    try {
      booleans[header] = parseYesNo(get(header), fallback);
    } catch (cause) {
      errors.push({ field: header, reason: (cause as Error).message });
    }
  }

  const knownHeaders = new Set(FIXED_HEADERS.map((h) => h.header));
  const extraAttributes: Record<string, string | number | boolean> = {};
  const customLabels = new Set(customFieldDefs.map((d) => d.label));
  for (const def of customFieldDefs) {
    const value = blankToNull(get(def.label));
    if (value === null) {
      if (def.required) {
        errors.push({ field: def.label, reason: "required custom field is blank" });
      }
      continue;
    }
    try {
      extraAttributes[def.fieldKey] = parseCustomValue(value, def.dataType);
    } catch (cause) {
      errors.push({ field: def.label, reason: (cause as Error).message });
    }
  }

  for (const header of Object.keys(raw)) {
    if (!(knownHeaders.has(header) || customLabels.has(header))) {
      errors.push({ field: header, reason: "unrecognized column" });
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    row: {
      employeeCode: (get("Employee Code") ?? "").trim(),
      payrollCompanyCode: (get("Payroll Company Code") ?? "").trim(),
      personIc: blankToNull(get("Person IC")),
      personName: (get("Person Name") ?? "").trim(),
      personPassport: blankToNull(get("Person Passport")),
      personDob: personDobRaw,
      personNationality: blankToNull(get("Person Nationality")),
      joinDate: joinDateRaw,
      payBasis,
      baseRateSen: baseRateSen as number,
      isMalaysian: booleans["Is Malaysian"],
      isPermanentResident: booleans["Is Permanent Resident"],
      epfApplicable: booleans["EPF Applicable"],
      socsoApplicable: booleans["SOCSO Applicable"],
      eisApplicable: booleans["EIS Applicable"],
      pcbApplicable: booleans["PCB Applicable"],
      epfNo: blankToNull(get("EPF No")),
      socsoNo: blankToNull(get("SOCSO No")),
      tin: blankToNull(get("TIN")),
      bankName: blankToNull(get("Bank Name")),
      bankAccountNo: blankToNull(get("Bank Account No")),
      profile: {
        jobTitle: blankToNull(get("Job Title")),
        department: blankToNull(get("Department")),
        superiorName: blankToNull(get("Superior Name")),
        gender: blankToNull(get("Gender")),
        race: blankToNull(get("Race")),
        religion: blankToNull(get("Religion")),
        maritalStatus: blankToNull(get("Marital Status")),
        email: blankToNull(get("Email")),
        mobileNo: blankToNull(get("Mobile No")),
        phoneNo: blankToNull(get("Phone No")),
        addressLine: blankToNull(get("Address Line")),
        city: blankToNull(get("City")),
        state: blankToNull(get("State")),
        postalCode: blankToNull(get("Postal Code")),
        country: blankToNull(get("Country")),
        paymentMethod: blankToNull(get("Payment Method")),
        finalCompanyCode: blankToNull(get("Final Company Code")),
        masterPrimaryCompanyCode: blankToNull(
          get("Master Primary Company Code")
        ),
        payrollNotes: blankToNull(get("Payroll Notes")),
        importSourceNotes: blankToNull(get("Import Source Notes")),
      },
      extraAttributes,
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --project domain tests/domain/employee-row.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/import/employee-row.ts tests/domain/employee-row.test.ts
git commit -m "feat: add pure employee-row parsing/validation"
```

---

## Task 4: Repo layer — `repo/employee-profile.ts`

**Files:**
- Create: `src/repo/employee-profile.ts`

**Interfaces:**
- Consumes: `Database` (`@/db/client`); `companies`, `employments`, `persons` (`@/db/schema/parties`); `employeeCustomFieldDefs`, `employmentProfiles` (`@/db/schema/employee-profile`, Task 1); `ParsedEmployeeRow` (`@/domain/import/employee-row`, Task 3).
- Produces: `findCompanyIdByCode(db, code)`, `findExistingEmploymentId(db, companyId, employeeCode)`, `listActiveCustomFieldDefs(db)`, `createEmployeeFromImport(db, companyId, row)` — consumed by Task 5 (`service/employee-import.ts`) and Task 6 (`scripts/employee-template.ts` uses `listActiveCustomFieldDefs`).

- [ ] **Step 1: Implement** (no standalone unit test — this module is exercised end-to-end by Task 5's integration tests against real Postgres, matching how `repo/pay-run.ts` has no dedicated unit test file and is exercised via `tests/db/*`)

Create `src/repo/employee-profile.ts`:

```ts
/**
 * DB operations for the employee bulk importer. Create-only: nothing here
 * ever updates an existing person/employment/profile row — see
 * docs/superpowers/specs/2026-08-08-employee-master-import-design.md.
 */

import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  employeeCustomFieldDefs,
  employmentProfiles,
} from "@/db/schema/employee-profile";
import { companies, employments, persons } from "@/db/schema/parties";
import type { ParsedEmployeeRow } from "@/domain/import/employee-row";

export async function findCompanyIdByCode(
  db: Database,
  code: string
): Promise<string | null> {
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.code, code))
    .limit(1);
  return row?.id ?? null;
}

export async function findExistingEmploymentId(
  db: Database,
  companyId: string,
  employeeCode: string
): Promise<string | null> {
  const [row] = await db
    .select({ id: employments.id })
    .from(employments)
    .where(
      and(
        eq(employments.companyId, companyId),
        eq(employments.employeeCode, employeeCode)
      )
    )
    .limit(1);
  return row?.id ?? null;
}

export async function listActiveCustomFieldDefs(
  db: Database
): Promise<Array<typeof employeeCustomFieldDefs.$inferSelect>> {
  return await db
    .select()
    .from(employeeCustomFieldDefs)
    .where(eq(employeeCustomFieldDefs.active, true))
    .orderBy(employeeCustomFieldDefs.sortOrder);
}

/**
 * Creates person (or reuses one matched by IC) + employment + profile inside
 * one transaction. The caller (`service/employee-import.ts`) has already
 * confirmed no employment exists for this `(companyId, employeeCode)` — this
 * function does not re-check, so it must only ever be called from the
 * create-only import path.
 */
export async function createEmployeeFromImport(
  db: Database,
  companyId: string,
  row: ParsedEmployeeRow
): Promise<{ personId: string; employmentId: string }> {
  return await db.transaction(async (tx) => {
    let personId: string | null = null;

    if (row.personIc !== null) {
      const [existing] = await tx
        .select({ id: persons.id })
        .from(persons)
        .where(eq(persons.ic, row.personIc))
        .limit(1);
      personId = existing?.id ?? null;
    }

    if (personId === null) {
      const [created] = await tx
        .insert(persons)
        .values({
          name: row.personName,
          ic: row.personIc,
          passport: row.personPassport,
          dob: row.personDob,
          nationality: row.personNationality,
        })
        .returning({ id: persons.id });
      personId = created.id;
    }

    const [employment] = await tx
      .insert(employments)
      .values({
        personId,
        companyId,
        employeeCode: row.employeeCode,
        joinDate: row.joinDate,
        payBasis: row.payBasis,
        baseRateSen: row.baseRateSen,
        isMalaysian: row.isMalaysian,
        isPermanentResident: row.isPermanentResident,
        epfApplicable: row.epfApplicable,
        socsoApplicable: row.socsoApplicable,
        eisApplicable: row.eisApplicable,
        pcbApplicable: row.pcbApplicable,
        epfNo: row.epfNo,
        socsoNo: row.socsoNo,
        tin: row.tin,
        bankName: row.bankName,
        bankAccountNo: row.bankAccountNo,
      })
      .returning({ id: employments.id });

    await tx.insert(employmentProfiles).values({
      employmentId: employment.id,
      jobTitle: row.profile.jobTitle,
      department: row.profile.department,
      superiorName: row.profile.superiorName,
      gender: row.profile.gender,
      race: row.profile.race,
      religion: row.profile.religion,
      maritalStatus: row.profile.maritalStatus,
      email: row.profile.email,
      mobileNo: row.profile.mobileNo,
      phoneNo: row.profile.phoneNo,
      addressLine: row.profile.addressLine,
      city: row.profile.city,
      state: row.profile.state,
      postalCode: row.profile.postalCode,
      country: row.profile.country,
      paymentMethod: row.profile.paymentMethod,
      finalCompanyCode: row.profile.finalCompanyCode,
      masterPrimaryCompanyCode: row.profile.masterPrimaryCompanyCode,
      payrollNotes: row.profile.payrollNotes,
      importSourceNotes: row.profile.importSourceNotes,
      extraAttributes: row.extraAttributes,
    });

    return { personId, employmentId: employment.id };
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors attributable to this file.

- [ ] **Step 3: Commit**

```bash
git add src/repo/employee-profile.ts
git commit -m "feat: add employee-profile repo layer (create-only)"
```

---

## Task 5: Service layer + integration tests — `service/employee-import.ts`

**Files:**
- Create: `src/service/employee-import.ts`
- Test: `tests/db/employee-import.test.ts`

**Interfaces:**
- Consumes: `parseEmployeeRow`, `CustomFieldDef`, `RowError` (Task 3); `findCompanyIdByCode`, `findExistingEmploymentId`, `listActiveCustomFieldDefs`, `createEmployeeFromImport` (Task 4).
- Produces: `RowOutcome`, `ImportReport`, `importEmployeeRows(db, rawRows)` — consumed by Task 7 (`scripts/employee-import.ts`).

- [ ] **Step 1: Write the failing integration tests**

Create `tests/db/employee-import.test.ts`:

```ts
/**
 * Proves the two guarantees that matter most: create-only re-import
 * idempotency, and that a manually mutated profile field survives a
 * re-import untouched (no-clobber).
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { importEmployeeRows } from "@/service/employee-import";
import { ALL_TABLES, connectTestDatabase, type TestDatabase } from "./harness/database";

const database: TestDatabase = connectTestDatabase();
const { db } = database;

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.truncate(...ALL_TABLES);
  await db.execute(sql`
    INSERT INTO companies (id, code, name)
    VALUES ('11111111-1111-1111-1111-111111111111', 'DLBB', 'DLBB Sdn Bhd')`);
});

function sampleRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    "Employee Code": "DLBB1001",
    "Payroll Company Code": "DLBB",
    "Person IC": "860502435427",
    "Person Name": "LIM KIAN TECK",
    "Person Passport": "",
    "Person DOB": "1986-05-02",
    "Person Nationality": "MALAYSIAN",
    "Join Date": "2023-08-01",
    "Pay Basis": "MONTHLY",
    "Base Rate RM": "10,000.00",
    "Is Malaysian": "Yes",
    "Is Permanent Resident": "No",
    "EPF Applicable": "Yes",
    "SOCSO Applicable": "Yes",
    "EIS Applicable": "Yes",
    "PCB Applicable": "Yes",
    "EPF No": "17378402",
    "SOCSO No": "IG21057338040",
    TIN: "860502435427",
    "Bank Name": "PUBLIC BANK",
    "Bank Account No": "4502410032",
    "Job Title": "R&D DIRECTOR",
    Department: "R&D",
    "Superior Name": "WEE POH LAI",
    Gender: "M",
    Race: "Chinese",
    Religion: "Buddhist",
    "Marital Status": "Married",
    Email: "ktlim@delettucebear.com",
    "Mobile No": "012-7668567",
    "Phone No": "012-7668567",
    "Address Line": "24, Lorong Sentosa 6A/KS6",
    City: "Klang",
    State: "Selangor",
    "Postal Code": "41200",
    Country: "MY",
    "Payment Method": "Bank Transfer",
    "Final Company Code": "DLBB",
    "Master Primary Company Code": "DLBB",
    "Payroll Notes": "",
    "Import Source Notes": "OK",
    ...overrides,
  };
}

describe("importEmployeeRows", () => {
  it("creates person + employment + profile for a new row", async () => {
    const report = await importEmployeeRows(db, [sampleRow()]);
    expect(report.created).toBe(1);
    expect(report.skippedExisting).toBe(0);
    expect(report.failed).toBe(0);

    const rows = await db.execute<{ code: string }>(sql`
      SELECT e.employee_code AS code FROM employments e
      JOIN companies c ON c.id = e.company_id
      WHERE c.code = 'DLBB' AND e.employee_code = 'DLBB1001'`);
    expect(rows.rows.length).toBe(1);
  });

  it("re-importing the identical file a second time creates nothing", async () => {
    await importEmployeeRows(db, [sampleRow()]);
    const second = await importEmployeeRows(db, [sampleRow()]);

    expect(second.created).toBe(0);
    expect(second.skippedExisting).toBe(1);
    expect(second.rows[0]?.status).toBe("SKIPPED_EXISTING");

    const rows = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM employments WHERE employee_code = 'DLBB1001'`);
    expect(Number(rows.rows[0]?.count)).toBe(1);
  });

  it("does not clobber a profile field edited after the first import", async () => {
    await importEmployeeRows(db, [sampleRow()]);
    await db.execute(sql`
      UPDATE employment_profiles SET job_title = 'PROMOTED TITLE'
      WHERE employment_id = (SELECT id FROM employments WHERE employee_code = 'DLBB1001')`);

    await importEmployeeRows(db, [sampleRow({ "Job Title": "R&D DIRECTOR (FROM SHEET)" })]);

    const rows = await db.execute<{ job_title: string }>(sql`
      SELECT p.job_title FROM employment_profiles p
      JOIN employments e ON e.id = p.employment_id
      WHERE e.employee_code = 'DLBB1001'`);
    expect(rows.rows[0]?.job_title).toBe("PROMOTED TITLE");
  });

  it("finds an existing person by IC instead of duplicating them across two employments", async () => {
    await db.execute(sql`
      INSERT INTO companies (id, code, name)
      VALUES ('22222222-2222-2222-2222-222222222222', 'DLBM', 'DLBM Sdn Bhd')`);

    await importEmployeeRows(db, [sampleRow()]);
    await importEmployeeRows(db, [
      sampleRow({
        "Employee Code": "DLBM9001",
        "Payroll Company Code": "DLBM",
      }),
    ]);

    const rows = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM persons WHERE ic = '860502435427'`);
    expect(Number(rows.rows[0]?.count)).toBe(1);
  });

  it("fails a row with a bad company code without creating anything", async () => {
    const report = await importEmployeeRows(db, [
      sampleRow({ "Payroll Company Code": "NOPE" }),
    ]);
    expect(report.failed).toBe(1);
    expect(report.created).toBe(0);
    const rows = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM employments`);
    expect(Number(rows.rows[0]?.count)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL=postgres://payroll:payroll@localhost:54329/payroll npx vitest run --project db tests/db/employee-import.test.ts`
Expected: FAIL — `Cannot find module '@/service/employee-import'`.

- [ ] **Step 3: Implement**

Create `src/service/employee-import.ts`:

```ts
/**
 * Orchestrates the employee bulk importer: parse → check existing → create.
 * Create-only — see docs/superpowers/specs/2026-08-08-employee-master-import-design.md.
 */

import type { Database } from "@/db/client";
import {
  parseEmployeeRow,
  type CustomFieldDef,
  type RowError,
} from "@/domain/import/employee-row";
import {
  createEmployeeFromImport,
  findCompanyIdByCode,
  findExistingEmploymentId,
  listActiveCustomFieldDefs,
} from "@/repo/employee-profile";

export type RowOutcome =
  | {
      status: "CREATED";
      rowNumber: number;
      employeeCode: string;
      employmentId: string;
    }
  | { status: "SKIPPED_EXISTING"; rowNumber: number; employeeCode: string }
  | {
      status: "FAILED";
      rowNumber: number;
      employeeCode: string | null;
      errors: RowError[];
    };

export interface ImportReport {
  created: number;
  skippedExisting: number;
  failed: number;
  rows: RowOutcome[];
}

export async function importEmployeeRows(
  db: Database,
  rawRows: ReadonlyArray<Record<string, string | undefined>>
): Promise<ImportReport> {
  const defs = await listActiveCustomFieldDefs(db);
  const customFieldDefs: CustomFieldDef[] = defs.map((d) => ({
    fieldKey: d.fieldKey,
    label: d.label,
    dataType: d.dataType,
    required: d.required,
  }));

  const rows: RowOutcome[] = [];
  let created = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (const [index, raw] of rawRows.entries()) {
    const rowNumber = index + 2; // header is row 1
    const parsed = parseEmployeeRow(raw, customFieldDefs);

    if ("errors" in parsed) {
      failed += 1;
      rows.push({
        status: "FAILED",
        rowNumber,
        employeeCode: raw["Employee Code"] ?? null,
        errors: parsed.errors,
      });
      continue;
    }

    const { row } = parsed;
    const companyId = await findCompanyIdByCode(db, row.payrollCompanyCode);
    if (companyId === null) {
      failed += 1;
      rows.push({
        status: "FAILED",
        rowNumber,
        employeeCode: row.employeeCode,
        errors: [
          {
            field: "Payroll Company Code",
            reason: `no company with code ${JSON.stringify(row.payrollCompanyCode)}`,
          },
        ],
      });
      continue;
    }

    const existingId = await findExistingEmploymentId(
      db,
      companyId,
      row.employeeCode
    );
    if (existingId !== null) {
      skippedExisting += 1;
      rows.push({
        status: "SKIPPED_EXISTING",
        rowNumber,
        employeeCode: row.employeeCode,
      });
      continue;
    }

    const { employmentId } = await createEmployeeFromImport(db, companyId, row);
    created += 1;
    rows.push({
      status: "CREATED",
      rowNumber,
      employeeCode: row.employeeCode,
      employmentId,
    });
  }

  return { created, skippedExisting, failed, rows };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --project db tests/db/employee-import.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/service/employee-import.ts tests/db/employee-import.test.ts
git commit -m "feat: add create-only employee import service with idempotency tests"
```

---

## Task 6: Template generation script

**Files:**
- Create: `scripts/employee-template.ts`
- Modify: `package.json` (add `employee:template` script)

**Interfaces:**
- Consumes: `FIXED_HEADERS` (Task 3); `listActiveCustomFieldDefs` (Task 4); `createDatabase`, `createPool`, `requireDatabaseUrl` (`@/db/client` — actually `../src/db/client` from `scripts/`).

- [ ] **Step 1: Implement**

Create `scripts/employee-template.ts`:

```ts
/**
 * Emits the employee bulk-import CSV template: fixed headers plus one
 * column per active custom field, in order. Re-run after editing
 * db/seed/employee-custom-fields.json and reseeding to pick up new columns.
 */

import fs from "node:fs";
import {
  createDatabase,
  createPool,
  requireDatabaseUrl,
} from "../src/db/client";
import { FIXED_HEADERS } from "../src/domain/import/employee-row";
import { listActiveCustomFieldDefs } from "../src/repo/employee-profile";

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function main(): Promise<void> {
  const pool = createPool(requireDatabaseUrl());
  try {
    const db = createDatabase(pool);
    const defs = await listActiveCustomFieldDefs(db);
    const headers = [
      ...FIXED_HEADERS.map((h) => h.header),
      ...defs.map((d) => d.label),
    ];
    const line = headers.map(csvEscape).join(",");
    const outPath = process.argv[2] ?? "employee-import-template.csv";
    fs.writeFileSync(outPath, `${line}\n`);
    process.stdout.write(`wrote ${headers.length} columns to ${outPath}\n`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("employee-template.ts")) {
  await main();
}
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"` (alongside `"db:seed"`):

```json
    "employee:template": "tsx scripts/employee-template.ts",
```

- [ ] **Step 3: Run it against the local dev database**

Run:
```bash
export DATABASE_URL=postgres://payroll:payroll@localhost:54329/payroll
npm run db:seed
npm run employee:template -- /tmp/employee-import-template.csv
```
Expected: `wrote 42 columns to …/employee-import-template.csv` (`FIXED_HEADERS.length` is 41 + 1 seeded `Uniform Size` custom field). Open the file and confirm the header row matches `FIXED_HEADERS` order followed by `Uniform Size`.

- [ ] **Step 4: Commit**

```bash
git add scripts/employee-template.ts package.json
git commit -m "feat: add employee import template generator"
```

---

## Task 7: Import CLI script

**Files:**
- Create: `scripts/employee-import.ts`
- Modify: `package.json` (add `csv-parse` dependency and `employee:import` script)

**Interfaces:**
- Consumes: `importEmployeeRows` (Task 5); `createDatabase`, `createPool`, `requireDatabaseUrl` (`../src/db/client`).

- [ ] **Step 1: Add the dependency**

Run:
```bash
npm install csv-parse
```
Expected: `csv-parse` appears under `"dependencies"` in `package.json` and `package-lock.json` updates.

- [ ] **Step 2: Implement the script**

Create `scripts/employee-import.ts`:

```ts
/**
 * CLI for the employee bulk importer. Accepts CSV or JSON (array of row
 * objects); either way, column/key names must match the template exactly.
 * Create-only: an existing (employee code, company) pair is always
 * skipped, never overwritten.
 */

import fs from "node:fs";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import {
  createDatabase,
  createPool,
  requireDatabaseUrl,
} from "../src/db/client";
import { importEmployeeRows } from "../src/service/employee-import";

function loadRows(
  filePath: string
): Array<Record<string, string | undefined>> {
  const raw = fs.readFileSync(filePath, "utf8");
  if (path.extname(filePath).toLowerCase() === ".json") {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("JSON import file must be an array of row objects");
    }
    return parsed;
  }
  return parseCsv(raw, { columns: true, skip_empty_lines: true });
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (filePath === undefined) {
    throw new Error(
      "usage: tsx scripts/employee-import.ts <file.csv|file.json>"
    );
  }

  const pool = createPool(requireDatabaseUrl());
  try {
    const db = createDatabase(pool);
    const rows = loadRows(filePath);
    const report = await importEmployeeRows(db, rows);

    process.stdout.write(
      `created ${report.created}, skipped-existing ${report.skippedExisting}, failed ${report.failed}\n`
    );
    for (const outcome of report.rows) {
      if (outcome.status === "FAILED") {
        for (const error of outcome.errors) {
          process.stdout.write(
            `  row ${outcome.rowNumber} (${outcome.employeeCode ?? "?"}): ${error.field}: ${error.reason}\n`
          );
        }
      }
    }

    if (report.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("employee-import.ts")) {
  await main();
}
```

- [ ] **Step 3: Add the npm script**

In `package.json`, add to `"scripts"`:

```json
    "employee:import": "tsx scripts/employee-import.ts",
```

- [ ] **Step 4: Exercise it end-to-end against the local dev database**

Run:
```bash
echo 'Employee Code,Payroll Company Code,Person IC,Person Name,Person Passport,Person DOB,Person Nationality,Join Date,Pay Basis,Base Rate RM,Is Malaysian,Is Permanent Resident,EPF Applicable,SOCSO Applicable,EIS Applicable,PCB Applicable,EPF No,SOCSO No,TIN,Bank Name,Bank Account No,Job Title,Department,Superior Name,Gender,Race,Religion,Marital Status,Email,Mobile No,Phone No,Address Line,City,State,Postal Code,Country,Payment Method,Final Company Code,Master Primary Company Code,Payroll Notes,Import Source Notes,Uniform Size
TEST001,TESTCO,,TEST PERSON,,,,2024-01-01,MONTHLY,"1,000.00",Yes,No,Yes,Yes,Yes,Yes,,,,,,,,,,,,,,,,,,,,,,,,,' > /tmp/one-row.csv
npm run employee:import -- /tmp/one-row.csv
```
(First insert a `TESTCO` company row via `psql` or a scratch script if one doesn't already exist locally.)
Expected: `created 1, skipped-existing 0, failed 0`. Running the same command again prints `created 0, skipped-existing 1, failed 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/employee-import.ts package.json package-lock.json
git commit -m "feat: add employee import CLI (CSV/JSON, create-only)"
```

---

## Task 8: Full suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `DATABASE_URL=postgres://payroll:payroll@localhost:54329/payroll npm test`
Expected: all `domain` and `db` project tests pass, including the pre-existing `tests/db/seed-integrity.test.ts`, `tests/db/enums.test.ts`, `tests/domain/money-module-boundary.test.ts`, and every new test file from Tasks 1, 3 and 5.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit if anything was fixed**

```bash
git add -A
git commit -m "chore: fix lint/typecheck issues from employee import feature"
```
(Skip this step if Steps 1–2 were already clean.)

---

## Self-Review Notes (completed while writing this plan)

- **Spec coverage:** every "In" scope row of the design doc maps to a task — `employment_profiles`/`employee_custom_field_defs` (Task 1), seed-file-driven custom fields (Task 2), template generation (Task 6), create-only import with per-row validation report (Tasks 3, 5, 7). The design doc's "widened scope" and "create-only" decisions are both implemented (Task 4/5), not just documented.
- **Money boundary:** no task introduces a monetary column outside `employments.base_rate_sen`, which is populated via `domain/money.ts`'s `parseRM` (Task 3) exactly as the constraint requires; Task 1's test asserts the custom-field enum has no monetary member.
- **Type consistency:** `ParsedEmployeeRow` (Task 3) is the type `createEmployeeFromImport` (Task 4) accepts and `importEmployeeRows` (Task 5) produces from `parseEmployeeRow` — checked field-by-field against the repo function's `row.*` accesses.
- **No placeholders:** every step has complete, runnable code; deferred items (custom-field CRUD UI, allowance-to-pay-item mapping, sheet REVIEW-row reconciliation) are explicitly out of scope per the design doc, not silently dropped.
