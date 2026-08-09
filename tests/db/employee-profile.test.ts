/**
 * @feature employee-import
 * @layer test
 *
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
