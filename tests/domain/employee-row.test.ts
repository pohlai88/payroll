/**
 * @feature employee-import
 * @layer test
 */

import { describe, expect, it } from "vitest";
import {
  type CustomFieldDef,
  FIXED_HEADERS,
  parseEmployeeRow,
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
      throw new Error(
        `expected success, got errors: ${JSON.stringify(result.errors)}`
      );
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

  it("reports only required-field error for blank Base Rate RM", () => {
    const row = baseRow();
    row["Base Rate RM"] = "";
    const result = parseEmployeeRow(row, []);
    if (!("errors" in result)) {
      throw new Error("expected errors");
    }
    const baseRateErrors = result.errors.filter(
      (e) => e.field === "Base Rate RM"
    );
    expect(baseRateErrors).toEqual([
      { field: "Base Rate RM", reason: "required field is blank" },
    ]);
  });

  it("rejects a negative Base Rate RM", () => {
    const row = baseRow();
    row["Base Rate RM"] = "-100.00";
    const result = parseEmployeeRow(row, []);
    if (!("errors" in result)) {
      throw new Error("expected errors");
    }
    expect(result.errors).toContainEqual({
      field: "Base Rate RM",
      reason: "base rate must be non-negative",
    });
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
      {
        fieldKey: "uniform_size",
        label: "Uniform Size",
        dataType: "TEXT",
        required: false,
      },
    ];
    const row = { ...baseRow(), "Uniform Size": "L" };
    const result = parseEmployeeRow(row, defs);
    if ("errors" in result) {
      throw new Error(
        `expected success, got errors: ${JSON.stringify(result.errors)}`
      );
    }
    expect(result.row.extraAttributes).toEqual({ uniform_size: "L" });
  });

  it("fails when a required custom field is blank", () => {
    const defs: CustomFieldDef[] = [
      {
        fieldKey: "badge_no",
        label: "Badge No",
        dataType: "TEXT",
        required: true,
      },
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

  it("rejects impossible calendar dates via isIsoDate", () => {
    const row = baseRow();
    row["Join Date"] = "2026-02-31";
    const result = parseEmployeeRow(row, []);
    if (!("errors" in result)) {
      throw new Error("expected errors");
    }
    expect(result.errors.some((e) => e.field === "Join Date")).toBe(true);
  });

  it("accepts leap-day Join Date in a leap year", () => {
    const row = baseRow();
    row["Join Date"] = "2028-02-29";
    const result = parseEmployeeRow(row, []);
    expect("errors" in result).toBe(false);
  });

  it("rejects Person DOB after Join Date", () => {
    const row = baseRow();
    row["Person DOB"] = "2000-01-01";
    row["Join Date"] = "1999-01-01";
    const result = parseEmployeeRow(row, []);
    if (!("errors" in result)) {
      throw new Error("expected errors");
    }
    expect(
      result.errors.some(
        (e) => e.field === "Person DOB" && /Join Date/.test(e.reason)
      )
    ).toBe(true);
  });

  it("allows future Join Date appointments", () => {
    const row = baseRow();
    row["Join Date"] = "2027-01-01";
    const result = parseEmployeeRow(row, []);
    expect("errors" in result).toBe(false);
  });
});
