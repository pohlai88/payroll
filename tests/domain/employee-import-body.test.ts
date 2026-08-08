import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_IMPORT_MAX_BODY_BYTES,
  EmployeeImportError,
  parseEmployeeImportBody,
} from "@/service/employee-import";

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
