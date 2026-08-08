import { describe, expect, it } from "vitest";
import { computeLine } from "@/domain/calc/compose";
import { type DeriveOptions, deriveLine } from "@/domain/derive/emit";
import { readSen } from "@/domain/derive/graph";
import { renderLabel } from "@/domain/derive/i18n/render";
import { assertGraphInvariants } from "@/domain/derive/invariants";
import { assertMirrors } from "@/domain/derive/mirror";
import {
  defaultSettings,
  loadPayItems,
  loadTables,
  makeEmployee,
} from "../helpers";

/**
 * PCB is the one figure the engine never calculates, so it is also the one most
 * able to put an unexplained number on a payslip. These cases pin the three
 * states apart: a zero that statute explains, a genuine unknown that must block
 * net pay, and an entered figure that must be deducted whatever the flag says.
 */

const RULE_PACK_ID = "MY-STATUTORY-2026-06";

function optionsFor(over: Partial<DeriveOptions> = {}): DeriveOptions {
  return {
    rulePackId: RULE_PACK_ID,
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
    pcb: null,
    ...over,
  };
}

describe("PCB in the derivation graph", () => {
  it("blocks net pay when PCB applies but has not been entered", () => {
    const opts = optionsFor({ pcb: null });
    const graph = deriveLine(opts);

    expect(readSen(graph, "pcbNet")).toBeNull();
    expect(readSen(graph, "deductionsTotal")).toBeNull();
    expect(readSen(graph, "net")).toBeNull();

    const declared = graph.nodes["line.pcb.declared"];
    expect(declared?.kind).toBe("EXTERNAL_VERIFIED");
    expect(declared?.flags).toContain("NOT_ENTERED");
    assertMirrors(graph, computeLine(opts));
    assertGraphInvariants(graph);
  });

  it("states a cited zero, not an unknown, when PCB does not apply", () => {
    const opts = optionsFor({
      employee: makeEmployee({
        dob: "1990-01-15",
        baseRateSen: 400_000,
        pcbApplicable: false,
      }),
      pcb: null,
    });
    const graph = deriveLine(opts);

    // The bug this guards: net used to be computed from a zero while the graph
    // displayed "unknown", so the payslip showed a figure the sum had not used.
    expect(readSen(graph, "pcbNet")).toBe(0);
    expect(readSen(graph, "net")).not.toBeNull();

    const net = graph.nodes["line.pcb.net"];
    expect(net?.kind).toBe("NOT_APPLICABLE");
    expect(net?.citations[0]?.ruleId).toBe("MY.PCB.EXTERNAL_ONLY");
    expect(renderLabel(net!.detail!, "en")).toMatch(/does not apply/i);
    expect(renderLabel(net!.detail!, "ms")).toMatch(/tidak berkenaan/i);

    assertMirrors(graph, computeLine(opts));
    assertGraphInvariants(graph);
  });

  it("deducts an entered amount even when the applicability flag says otherwise", () => {
    const opts = optionsFor({
      employee: makeEmployee({
        dob: "1990-01-15",
        baseRateSen: 400_000,
        pcbApplicable: false,
      }),
      pcb: {
        pcbAmountSen: 12_345,
        zakatOffsetSen: 0,
        cp38Sen: 0,
        verified: true,
      },
    });
    const graph = deriveLine(opts);

    expect(readSen(graph, "pcbNet")).toBe(12_345);
    expect(graph.nodes["line.pcb.net"]?.kind).toBe("CALCULATION");
    assertMirrors(graph, computeLine(opts));
    assertGraphInvariants(graph);
  });

  it("offsets zakat against PCB and never goes below nil", () => {
    const opts = optionsFor({
      pcb: {
        pcbAmountSen: 10_000,
        zakatOffsetSen: 25_000,
        cp38Sen: 0,
        verified: true,
      },
    });
    const graph = deriveLine(opts);

    expect(readSen(graph, "pcbNet")).toBe(0);
    expect(readSen(graph, "zakat")).toBe(25_000);
    assertMirrors(graph, computeLine(opts));
    assertGraphInvariants(graph);
  });
});
