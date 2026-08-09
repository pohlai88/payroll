/**
 * @feature diff
 * @layer test
 */

import { describe, expect, it } from "vitest";
import { diffGraphs, graphsIdentical } from "@/domain/derive/diff";
import { type DeriveOptions, deriveLine } from "@/domain/derive/emit";
import {
  defaultSettings,
  loadPayItems,
  loadTables,
  makeEmployee,
} from "../helpers";

/**
 * Diffing is the test of the id design. If ids were content hashes, every node
 * would change whenever any figure did and a month-over-month comparison would
 * be noise. These tests pin the property that makes variance explanation free.
 */

const base: DeriveOptions = {
  rulePackId: "MY-STATUTORY-2026-06",
  employee: makeEmployee({
    id: "T1",
    name: "TEST",
    dob: "1990-01-15",
    baseRateSen: 400_000,
    epfApplicable: true,
    socsoApplicable: true,
    eisApplicable: true,
    pcbApplicable: true,
  }),
  inputs: {
    workingDays: 26,
    paidDays: 26,
    hoursWorked: null,
    items: [],
    periodEnd: "2026-07-31",
  },
  payItems: loadPayItems(),
  tables: loadTables(),
  settings: defaultSettings(),
  pcb: { pcbAmountSen: 0, zakatOffsetSen: 0, cp38Sen: 0, verified: true },
};

describe("Comparing two months of the same employee", () => {
  it("reports nothing when nothing changed", () => {
    expect(graphsIdentical(deriveLine(base), deriveLine(base))).toBe(true);
  });

  it("explains a raise as a chain of value moves, not a wall of new nodes", () => {
    const july = deriveLine(base);
    const august = deriveLine({
      ...base,
      employee: { ...base.employee, baseRateSen: 450_000 },
      inputs: { ...base.inputs, periodEnd: "2026-08-31" },
    });

    const diff = diffGraphs(july, august);
    const ids = diff.map((d) => d.id);

    // The same nodes exist in both months — a raise moves values, it does not
    // restructure the derivation.
    expect(diff.filter((d) => d.d === "ADDED")).toHaveLength(0);
    expect(diff.filter((d) => d.d === "REMOVED")).toHaveLength(0);

    expect(ids).toContain("line.input.baseRate");
    expect(ids).toContain("line.wages.epf");
    expect(ids).toContain("line.epf.band");
    expect(ids).toContain("line.epf.ee");
    expect(ids).toContain("line.net");

    const wages = diff.find((d) => d.id === "line.wages.epf");
    expect(wages?.d).toBe("VALUE");
    if (wages?.d === "VALUE") {
      expect(wages.deltaSen).toBe(50_000);
    }
  });

  it("reports a new allowance as an added node and a changed gross", () => {
    const before = deriveLine(base);
    const after = deriveLine({
      ...base,
      inputs: {
        ...base.inputs,
        items: [{ payItemCode: "PARKING", basis: "AMOUNT", amountSen: 10_000 }],
      },
    });

    const diff = diffGraphs(before, after);
    const added = diff.filter((d) => d.d === "ADDED").map((d) => d.id);
    expect(added).toContain("line.earn.PARKING");

    const gross = diff.find(
      (d) => d.id === "line.gross" && d.d === "STRUCTURE"
    );
    expect(gross, "gross should gain an input edge").toBeDefined();
    if (gross?.d === "STRUCTURE") {
      expect(gross.added.map((r) => r.nodeId)).toContain("line.earn.PARKING");
    }
  });

  it("shows the band row moving when a raise crosses a band boundary", () => {
    const low = deriveLine(base);
    const high = deriveLine({
      ...base,
      employee: { ...base.employee, baseRateSen: 500_000 },
    });

    const band = diffGraphs(low, high).find((d) => d.id === "line.epf.band");
    expect(band?.d).toBe("VALUE");
    if (band?.d === "VALUE" && band.from.t === "ROW" && band.to.t === "ROW") {
      expect(band.to.row.fromSen).toBeGreaterThan(band.from.row.fromSen);
    }
  });
});
