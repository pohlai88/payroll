/**
 * @feature employee-import
 * @layer test
 */

import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_IMPORT_MAX_BODY_BYTES,
  EmployeeImportError,
  intraFileDuplicateKeys,
  parseEmployeeImportBody,
} from "@/service/employee-import";

describe("intraFileDuplicateKeys", () => {
  it("flags duplicate company+employee codes within the batch", () => {
    const keys = intraFileDuplicateKeys([
      { "Payroll Company Code": "DLBB", "Employee Code": "A1" },
      { "Payroll Company Code": "DLBB", "Employee Code": "A1" },
      { "Payroll Company Code": "DLBB", "Employee Code": "A2" },
    ]);
    expect(keys.has("DLBB\0A1")).toBe(true);
    expect(keys.has("DLBB\0A2")).toBe(false);
  });

  it("allows the same employee code under different companies", () => {
    const keys = intraFileDuplicateKeys([
      { "Payroll Company Code": "DLBB", "Employee Code": "A1" },
      { "Payroll Company Code": "AFENDA", "Employee Code": "A1" },
    ]);
    expect(keys.size).toBe(0);
  });
});

describe("parseEmployeeImportBody", () => {
  it("parses CSV rows", () => {
    const rows = parseEmployeeImportBody(
      "text/csv",
      "Employee Code,Payroll Company Code\nA1,DLBB\n"
    );
    expect(rows).toEqual([
      { "Employee Code": "A1", "Payroll Company Code": "DLBB" },
    ]);
  });

  it("normalizes JSON scalar cells to strings", () => {
    const rows = parseEmployeeImportBody(
      "application/json",
      JSON.stringify([
        {
          "Employee Code": "A1",
          "Payroll Company Code": "DLBB",
          "Base Rate RM": 1000,
          "EPF Applicable": true,
        },
      ])
    );
    expect(rows[0]?.["Base Rate RM"]).toBe("1000");
    expect(rows[0]?.["EPF Applicable"]).toBe("true");
  });

  it("rejects oversize bodies by default", () => {
    const text = "x".repeat(EMPLOYEE_IMPORT_MAX_BODY_BYTES + 1);
    expect(() => parseEmployeeImportBody("text/csv", text)).toThrow(
      EmployeeImportError
    );
    try {
      parseEmployeeImportBody("text/csv", text);
    } catch (error) {
      expect(error).toBeInstanceOf(EmployeeImportError);
      expect((error as EmployeeImportError).code).toBe("PAYLOAD_TOO_LARGE");
    }
  });

  it("allows unbounded bodies when maxBytes is null", () => {
    const text = "x".repeat(EMPLOYEE_IMPORT_MAX_BODY_BYTES + 1);
    expect(() =>
      parseEmployeeImportBody("text/csv", text, { maxBytes: null })
    ).not.toThrow();
  });

  it("rejects non-object JSON array entries", () => {
    expect(() =>
      parseEmployeeImportBody("application/json", JSON.stringify(["nope"]))
    ).toThrow(/array of row objects/);
  });
});
