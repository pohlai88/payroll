/**
 * @feature pay-run
 * @layer test
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeLine } from "@/domain/calc/compose";
import type { LineItemInput } from "@/domain/calc/types";
import {
  defaultSettings,
  loadPayItems,
  loadTables,
  makeEmployee,
} from "../helpers";

/**
 * Golden master: reproduces the verified July 2026 DLBB payroll run from the
 * Afenda Command Centre workbook. Every employee's EPF/SOCSO/EIS amounts and
 * the five company totals must match to the sen. This test pins the engine.
 */

interface FixtureEmployee {
  id: string;
  name: string;
  dob: string;
  basicSen: number;
  epfEligible: boolean;
  socsoEligible: boolean;
  eisEligible: boolean;
  eisPriorContribution: boolean;
  allowances: Record<string, number>;
  mealRateSen: number;
  mealDays: number;
  expected: {
    grossSen: number;
    epfEeSen: number;
    epfErSen: number;
    socsoCoreSen: number;
    skbbkSen: number;
    socsoErSen: number;
    eisEeSen: number;
    eisErSen: number;
    netSen: number;
  };
  reconstructed: boolean;
}

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "tests", "golden", "july-2026.json"),
    "utf8"
  )
) as {
  periodEnd: string;
  workingDays: number;
  paidDays: number;
  totals: {
    grossSen: number;
    epfEeSen: number;
    socsoEeTotalSen: number;
    eisEeSen: number;
    netSen: number;
    epfErSen: number;
    socsoErSen: number;
    eisErSen: number;
  };
  employees: FixtureEmployee[];
};

const tables = loadTables();
const payItems = loadPayItems();
const settings = defaultSettings();

function runEmployee(e: FixtureEmployee) {
  const items: LineItemInput[] = [];
  for (const [code, amountSen] of Object.entries(e.allowances)) {
    if (amountSen > 0) {
      items.push({ payItemCode: code, basis: "AMOUNT", amountSen });
    }
  }
  if (e.mealDays > 0 && e.mealRateSen > 0) {
    items.push({
      payItemCode: "MEAL",
      basis: "PER_DAY",
      qty: e.mealDays,
      rateSen: e.mealRateSen,
    });
  }
  return computeLine({
    employee: makeEmployee({
      id: e.id,
      name: e.name,
      dob: e.dob,
      baseRateSen: e.basicSen,
      epfApplicable: e.epfEligible,
      socsoApplicable: e.socsoEligible,
      eisApplicable: e.eisEligible,
      eisPriorContribution: e.eisPriorContribution,
      pcbApplicable: true,
    }),
    inputs: {
      workingDays: fixture.workingDays,
      paidDays: fixture.paidDays,
      hoursWorked: null,
      items,
      periodEnd: fixture.periodEnd,
    },
    payItems,
    tables,
    settings,
    // The July run records PCB as verified-zero pending real verification in-app;
    // the workbook's register carried PCB Net 0.00 in all totals.
    pcb: { pcbAmountSen: 0, zakatOffsetSen: 0, cp38Sen: 0, verified: true },
  });
}

describe("Golden master: July 2026 DLBB run (37 employees)", () => {
  it("has 37 employees", () => {
    expect(fixture.employees.length).toBe(37);
  });

  for (const e of fixture.employees) {
    it(`${e.id} ${e.name}${e.reconstructed ? " (reconstructed)" : ""}`, () => {
      const r = runEmployee(e);
      expect(r.grossSen, "gross").toBe(e.expected.grossSen);
      expect(r.epfEeSen, "EPF EE").toBe(e.expected.epfEeSen);
      expect(r.epfErSen, "EPF ER").toBe(e.expected.epfErSen);
      expect(r.socsoEeCoreSen, "SOCSO core").toBe(e.expected.socsoCoreSen);
      expect(r.socsoEeSkbbkSen, "SKBBK").toBe(e.expected.skbbkSen);
      expect(r.socsoErSen, "SOCSO ER").toBe(e.expected.socsoErSen);
      expect(r.eisEeSen, "EIS EE").toBe(e.expected.eisEeSen);
      expect(r.eisErSen, "EIS ER").toBe(e.expected.eisErSen);
      expect(r.netSen, "net").toBe(e.expected.netSen);
    });
  }

  it("company totals reconcile to the sen", () => {
    const results = fixture.employees.map(runEmployee);
    const sum = (f: (r: (typeof results)[number]) => number) =>
      results.reduce((s, r) => s + f(r), 0);
    expect(sum((r) => r.grossSen)).toBe(fixture.totals.grossSen); // 176,930.00
    expect(sum((r) => r.epfEeSen)).toBe(fixture.totals.epfEeSen); // 19,210.00
    expect(sum((r) => r.socsoEeCoreSen + r.socsoEeSkbbkSen)).toBe(
      fixture.totals.socsoEeTotalSen
    ); // 1,822.05
    expect(sum((r) => r.eisEeSen)).toBe(fixture.totals.eisEeSen); // 288.40
    expect(sum((r) => r.netSen ?? 0)).toBe(fixture.totals.netSen); // 155,609.55
    expect(sum((r) => r.epfErSen)).toBe(fixture.totals.epfErSen); // 21,977.00
    expect(sum((r) => r.socsoErSen)).toBe(fixture.totals.socsoErSen); // 2,555.80
    expect(sum((r) => r.eisErSen)).toBe(fixture.totals.eisErSen); // 288.40
  });
});
