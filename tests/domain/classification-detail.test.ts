/**
 * @feature pay-run
 * @layer test
 */

import { describe, expect, it } from "vitest";
import type { EmployeeSnapshot, LineInputs } from "@/domain/calc/types";
import { deriveLine } from "@/domain/derive/emit";
import { renderLabel } from "@/domain/derive/i18n/render";
import {
  defaultSettings,
  loadPayItems,
  loadTables,
  makeEmployee,
} from "../helpers";

/**
 * What the classification nodes *say*, as opposed to what they compute.
 *
 * These nodes carry statutory citations, so a detail sentence asserting an age
 * the employee record does not support attaches a fabricated fact to a real
 * rule reference. The `?? 0` fallbacks these tests replaced rendered a
 * null-DOB employee as "EPF Part A, from age 0 and citizenship status",
 * cited to MY.EPF.CLASSIFY.PART.
 */

const RULE_PACK_ID = "MY-STATUTORY-2026-06";

function makeInputs(partial: Partial<LineInputs> = {}): LineInputs {
  return {
    workingDays: 26,
    paidDays: null,
    hoursWorked: null,
    items: [],
    periodEnd: "2026-07-31",
    ...partial,
  };
}

function graphFor(employee: EmployeeSnapshot) {
  return deriveLine({
    rulePackId: RULE_PACK_ID,
    employee,
    inputs: makeInputs(),
    payItems: loadPayItems(),
    tables: loadTables(),
    settings: defaultSettings(),
  });
}

const CLASS_IDS = [
  "line.class.epfPart",
  "line.class.socsoCategory",
  "line.class.eisEligibility",
] as const;

function detailsOf(employee: EmployeeSnapshot): string[] {
  const g = graphFor(employee);
  return CLASS_IDS.map((id) => {
    const node = g.nodes[id];
    if (node === undefined) {
      throw new Error(`missing classification node ${id}`);
    }
    if (node.detail === undefined) {
      throw new Error(`node ${id} has no detail`);
    }
    return renderLabel(node.detail, "en");
  });
}

const NO_STATUTORY = {
  dob: null,
  epfApplicable: false,
  socsoApplicable: false,
  eisApplicable: false,
} as const;

describe("classification detail with no date of birth", () => {
  it("never states an age the record does not support", () => {
    for (const detail of detailsOf(makeEmployee(NO_STATUTORY))) {
      expect(detail).not.toMatch(/age 0/i);
      expect(detail).not.toMatch(/\bage\b/i);
    }
  });

  it("says the scheme does not apply rather than naming a band", () => {
    const [epf, socso, eis] = detailsOf(makeEmployee(NO_STATUTORY));
    expect(epf).toBe("EPF does not apply to this employee");
    expect(socso).toBe("SOCSO does not apply to this employee");
    expect(eis).toBe("EIS does not apply to this employee");
  });

  it("emits no age node to cite", () => {
    const g = graphFor(makeEmployee(NO_STATUTORY));
    expect(g.nodes["line.class.age"]).toBeUndefined();
  });

  it("keeps the age out of override details too", () => {
    // Overrides bypass the age band, so a null DOB is legitimate here.
    const overridden = makeEmployee({
      dob: null,
      eisApplicable: false,
      epfPartOverride: "A",
      socsoCategoryOverride: "FIRST",
    });
    const [epf, socso] = detailsOf(overridden);
    expect(epf).toBe("Part A, set manually on the employee record");
    expect(socso).toBe("First Category, set manually on the employee record");
  });
});

describe("classification detail with a date of birth", () => {
  it("still explains the band from the real age", () => {
    const [epf, socso, eis] = detailsOf(makeEmployee({ dob: "1990-01-15" }));
    expect(epf).toBe("Part A, from age 36 and citizenship status");
    expect(socso).toBe("First Category, from age 36");
    expect(eis).toBe("eligible — age 36 against the 18–60 range");
  });

  it("switches bands at 60 and says so", () => {
    const [epf, socso, eis] = detailsOf(makeEmployee({ dob: "1966-01-15" }));
    expect(epf).toBe("Part E, from age 60 and citizenship status");
    expect(socso).toBe("Second Category, from age 60");
    expect(eis).toBe("not eligible — age 60 against the 18–60 range");
  });
});
