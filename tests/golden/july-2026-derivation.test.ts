import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeLine } from "@/domain/calc/compose";
import type { LineItemInput } from "@/domain/calc/types";
import { deriveLine } from "@/domain/derive/emit";
import { canonicalJson, ROOT_KEYS, readSen } from "@/domain/derive/graph";
import { renderLabel } from "@/domain/derive/i18n/render";
import {
  assertAcyclic,
  assertCitationsResolve,
  assertEdgesResolve,
  assertKeysTranslated,
  assertNoDeadEnds,
  assertRoundingDiscipline,
} from "@/domain/derive/invariants";
import { assertMirrors } from "@/domain/derive/mirror";
import {
  defaultSettings,
  loadPayItems,
  loadTables,
  makeEmployee,
} from "../helpers";

/**
 * The derivation graph, checked against the same 37 verified employees the
 * golden master pins. Because the fixture is real payroll rather than invented
 * cases, this doubles as a conformance suite for citations, translations, dead
 * ends and rounding discipline — not just for arithmetic.
 *
 * The golden master file itself is never edited. This runs beside it.
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
  employees: FixtureEmployee[];
};

const tables = loadTables();
const payItems = loadPayItems();
const settings = defaultSettings();
const RULE_PACK_ID = "MY-STATUTORY-2026-06";

function optionsFor(e: FixtureEmployee) {
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
  return {
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
    pcb: { pcbAmountSen: 0, zakatOffsetSen: 0, cp38Sen: 0, verified: true },
  };
}

const cases = fixture.employees.map((e) => {
  const opts = optionsFor(e);
  return {
    employee: e,
    result: computeLine(opts),
    graph: deriveLine({ ...opts, rulePackId: RULE_PACK_ID }),
  };
});

describe("Derivation graph over the July 2026 golden fixture", () => {
  it("covers all 37 employees", () => {
    expect(cases.length).toBe(37);
  });

  describe.each(cases)(
    "$employee.id $employee.name",
    ({ employee, result, graph }) => {
      it("reproduces every figure the engine computed", () => {
        assertMirrors(graph, result);
      });

      it("reproduces the figures the golden master asserts", () => {
        expect(readSen(graph, "gross")).toBe(employee.expected.grossSen);
        expect(readSen(graph, "epfEe")).toBe(employee.expected.epfEeSen);
        expect(readSen(graph, "epfEr")).toBe(employee.expected.epfErSen);
        expect(readSen(graph, "socsoEeCore")).toBe(
          employee.expected.socsoCoreSen
        );
        expect(readSen(graph, "socsoEeSkbbk")).toBe(employee.expected.skbbkSen);
        expect(readSen(graph, "socsoEr")).toBe(employee.expected.socsoErSen);
        expect(readSen(graph, "eisEe")).toBe(employee.expected.eisEeSen);
        expect(readSen(graph, "eisEr")).toBe(employee.expected.eisErSen);
        expect(readSen(graph, "net")).toBe(employee.expected.netSen);
      });

      it("has no dead ends", () => {
        assertNoDeadEnds(graph);
      });

      it("shows every rounding step", () => {
        assertRoundingDiscipline(graph);
      });

      it("is acyclic with every edge resolving", () => {
        assertEdgesResolve(graph);
        assertAcyclic(graph);
      });

      it("cites only sources the rule pack publishes", () => {
        assertCitationsResolve(graph);
      });

      it("renders in both English and Malay", () => {
        assertKeysTranslated(graph);
      });

      it("emits an identical graph when recomputed", () => {
        const again = deriveLine({
          ...optionsFor(employee),
          rulePackId: RULE_PACK_ID,
        });
        expect(canonicalJson(again)).toBe(canonicalJson(graph));
      });

      it("names every root", () => {
        for (const root of ROOT_KEYS) {
          expect(
            graph.roots[root],
            `root ${root} was never emitted`
          ).toBeDefined();
        }
      });
    }
  );
});

describe("What the graph explains", () => {
  const sample = cases[0]!;

  it("reaches the exact EPF Third Schedule row, cited to KWSP", () => {
    const band = sample.graph.nodes["line.epf.band"];
    expect(band?.kind).toBe("TABLE_LOOKUP");
    if (band?.kind !== "TABLE_LOOKUP") {
      throw new Error("expected a table lookup");
    }

    // The wage searched for actually falls inside the row that was returned.
    expect(band.keySen).toBeGreaterThanOrEqual(band.value.row.fromSen);
    expect(band.keySen).toBeLessThanOrEqual(band.value.row.toSen);
    expect(band.rowCount).toBeGreaterThan(300);
    expect(band.citations[0].sourceRef).toBe("S1");
    expect(band.citations[0].ruleId).toBe("MY.EPF.THIRD_SCHEDULE.BAND");
    expect(band.citations[0].clause?.locator).toMatch(/^row \d+$/);
  });

  it("says why overtime is excluded from EPF wages", () => {
    const epfWages = sample.graph.nodes["line.wages.epf"];
    const excluded =
      epfWages?.inputs.filter((r) => r.role === "EXCLUDED") ?? [];
    for (const ref of excluded) {
      expect(
        ref.because,
        `${ref.nodeId} is excluded without a reason`
      ).toBeDefined();
    }
  });

  it("records PCB as an external figure, never as a computation", () => {
    const declared = sample.graph.nodes["line.pcb.declared"];
    expect(declared?.kind).toBe("EXTERNAL_VERIFIED");
    expect(declared?.citations[0]?.ruleId).toBe("MY.PCB.EXTERNAL_ONLY");
  });

  it("renders the same node differently in each language", () => {
    const band = sample.graph.nodes["line.epf.band"]!;
    const en = renderLabel(band.detail!, "en");
    const ms = renderLabel(band.detail!, "ms");
    expect(en).toContain("band");
    expect(ms).toContain("banjaran");
    expect(en).not.toBe(ms);
  });

  it("keeps a line's graph small enough to store per line", () => {
    const size = JSON.stringify(sample.graph).length;
    expect(size).toBeLessThan(60_000);
  });
});
