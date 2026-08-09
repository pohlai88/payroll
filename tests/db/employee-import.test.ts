/**
 * Proves the two guarantees that matter most: create-only re-import
 * idempotency, and that a manually mutated profile field survives a
 * re-import untouched (no-clobber).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { importEmployeeRows } from "@/service/employee-import";
import {
  ALL_TABLES,
  connectTestDatabase,
  type TestDatabase,
} from "./harness/database";

const REPO_CUSTOM_FIELDS_SEED = path.join(
  process.cwd(),
  "db",
  "seed",
  "employee-custom-fields.json"
);
const PRISTINE_SEED_CONTENT = fs.readFileSync(REPO_CUSTOM_FIELDS_SEED, "utf8");

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

function sampleRow(
  overrides: Record<string, string> = {}
): Record<string, string> {
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

    await importEmployeeRows(db, [
      sampleRow({ "Job Title": "R&D DIRECTOR (FROM SHEET)" }),
    ]);

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

  it("aborts entire import when unrecognized column exists without --auto-register", async () => {
    await expect(
      importEmployeeRows(db, [sampleRow({ "Bonus Amount": "5000.00" })])
    ).rejects.toThrow(/Unrecognized columns: Bonus Amount/);

    const rows = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM employments`);
    expect(Number(rows.rows[0]?.count)).toBe(0);

    const persons = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM persons`);
    expect(Number(persons.rows[0]?.count)).toBe(0);
  });

  it("aborts entire import when only a later row has an unrecognized column (JSON-style)", async () => {
    const firstRow = sampleRow({ "Employee Code": "DLBB1001" });
    const secondRow = sampleRow({
      "Employee Code": "DLBB1002",
      "Bonus Amount": "5000.00",
    });

    await expect(importEmployeeRows(db, [firstRow, secondRow])).rejects.toThrow(
      /Unrecognized columns: Bonus Amount/
    );

    const rows = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM employments`);
    expect(Number(rows.rows[0]?.count)).toBe(0);
  });

  it("auto-registers unrecognized column as TEXT custom field with --auto-register", async () => {
    const tempSeedPath = path.join(
      os.tmpdir(),
      `employee-custom-fields-${process.pid}-${Date.now()}.json`
    );
    fs.writeFileSync(
      tempSeedPath,
      `${JSON.stringify({ fields: [] }, null, 2)}\n`,
      "utf8"
    );

    try {
      const report = await importEmployeeRows(
        db,
        [sampleRow({ "Bonus Amount": "5000.00" })],
        { autoRegister: true, customFieldsSeedPath: tempSeedPath }
      );
      expect(report.created).toBe(1);
      expect(report.failed).toBe(0);

      const customFields = await db.execute<{
        field_key: string;
        label: string;
        data_type: string;
      }>(sql`
      SELECT field_key, label, data_type FROM employee_custom_field_defs
      WHERE label = 'Bonus Amount'`);
      expect(customFields.rows.length).toBe(1);
      expect(customFields.rows[0]?.field_key).toBe("bonus_amount");
      expect(customFields.rows[0]?.data_type).toBe("TEXT");

      const seedContent = JSON.parse(fs.readFileSync(tempSeedPath, "utf8")) as {
        fields: Array<{ fieldKey: string; label: string; dataType: string }>;
      };
      expect(seedContent.fields).toHaveLength(1);
      expect(seedContent.fields[0]?.fieldKey).toBe("bonus_amount");
      expect(seedContent.fields[0]?.label).toBe("Bonus Amount");
      expect(seedContent.fields[0]?.dataType).toBe("TEXT");
    } finally {
      fs.unlinkSync(tempSeedPath);
    }
  });

  it("auto-registers headers that slugify to the same key with unique suffixes", async () => {
    // Slugify collision: "Foo-Bar" and "Foo Bar" both become "foo_bar".
    // The second header receives field_key "foo_bar_2".
    const tempSeedPath = path.join(
      os.tmpdir(),
      `employee-custom-fields-${process.pid}-${Date.now()}.json`
    );
    fs.writeFileSync(
      tempSeedPath,
      `${JSON.stringify({ fields: [] }, null, 2)}\n`,
      "utf8"
    );

    try {
      const report = await importEmployeeRows(
        db,
        [sampleRow({ "Foo-Bar": "alpha", "Foo Bar": "beta" })],
        { autoRegister: true, customFieldsSeedPath: tempSeedPath }
      );
      expect(report.created).toBe(1);
      expect(report.failed).toBe(0);

      const customFields = await db.execute<{
        field_key: string;
        label: string;
      }>(sql`
        SELECT field_key, label FROM employee_custom_field_defs
        WHERE label IN ('Foo-Bar', 'Foo Bar')
        ORDER BY label`);
      expect(customFields.rows).toEqual([
        { field_key: "foo_bar_2", label: "Foo Bar" },
        { field_key: "foo_bar", label: "Foo-Bar" },
      ]);
    } finally {
      fs.unlinkSync(tempSeedPath);
    }
  });

  it("throws when a header slugifies to an empty string with --auto-register", async () => {
    // "!!!" → slugify strips all non-alphanumeric chars → "_" → strip leading/trailing → ""
    const tempSeedPath = path.join(
      os.tmpdir(),
      `employee-custom-fields-${process.pid}-${Date.now()}.json`
    );
    fs.writeFileSync(
      tempSeedPath,
      `${JSON.stringify({ fields: [] }, null, 2)}\n`,
      "utf8"
    );

    try {
      await expect(
        importEmployeeRows(db, [sampleRow({ "!!!": "value" })], {
          autoRegister: true,
          customFieldsSeedPath: tempSeedPath,
        })
      ).rejects.toThrow(
        'Cannot auto-register column "!!!": slugified field key is empty'
      );
    } finally {
      if (fs.existsSync(tempSeedPath)) {
        fs.unlinkSync(tempSeedPath);
      }
    }
  });

  it("leaves repo employee-custom-fields.json unchanged", () => {
    expect(fs.readFileSync(REPO_CUSTOM_FIELDS_SEED, "utf8")).toBe(
      PRISTINE_SEED_CONTENT
    );
  });
});
