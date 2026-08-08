import { describe, expect, it } from "vitest";
import {
  computePcb,
  computePcbCSuite,
  computePcbKnowledgeWorker,
  computePcbRep,
} from "@/domain/calc/pcb";
import { flat15RebateTSen } from "@/domain/calc/pcb-core";
import type { PcbMonthContext, PcbTaxProfile } from "@/domain/calc/types";

const baseMonth = (over: Partial<PcbMonthContext> = {}): PcbMonthContext => ({
  ySen: 0,
  kSen: 0,
  y1Sen: 1_000_000,
  k1Sen: 0,
  n: 11,
  xSen: 0,
  zSen: 0,
  accumulatedLpSen: 0,
  lp1Sen: 0,
  ...over,
});

describe("flat 15% regimes (REP / KW / C-Suite)", () => {
  it("applies Table 2/3 rebate when P ≤ RM35,000", () => {
    expect(flat15RebateTSen(3_500_000, 1)).toBe(40_000);
    expect(flat15RebateTSen(3_500_000, 2)).toBe(80_000);
    expect(flat15RebateTSen(3_500_100, 1)).toBe(0);
  });

  it("matches Table 2 (REP, p.15) and Table 3 (Knowledge Worker, p.16) of P-SPEC-2026 exactly", () => {
    // db/evidence/pcb-spec-2026.pdf, Table 2 and Table 3: both give
    // P ≤ 35,000 -> R=15%, T=400 (cat 1&3) / 800 (cat 2); P > 35,000 -> T=0.
    // The two tables are byte-for-byte identical in the primary source, so
    // asserting once here covers both REP and Knowledge Worker.
    expect(flat15RebateTSen(3_500_000, 1)).toBe(40_000); // RM400
    expect(flat15RebateTSen(3_500_000, 2)).toBe(80_000); // RM800
    expect(flat15RebateTSen(3_500_000, 3)).toBe(40_000); // RM400
    expect(flat15RebateTSen(3_500_100, 1)).toBe(0);
    expect(flat15RebateTSen(3_500_100, 2)).toBe(0);
    expect(flat15RebateTSen(3_500_100, 3)).toBe(0);
  });

  it("REP and Knowledge Worker share the rebate formula", () => {
    const profile: PcbTaxProfile = {
      residence: "RESIDENT",
      category: 1,
      disabledIndividual: false,
      disabledSpouse: false,
      qualifyingChildUnits: 0,
      formulaRegime: "REP",
    };
    // Low P triggers RM400 rebate
    const month = baseMonth({ y1Sen: 200_000 });
    const rep = computePcbRep(profile, month);
    const kw = computePcbKnowledgeWorker(
      { ...profile, formulaRegime: "KNOWLEDGE_WORKER" },
      month
    );
    expect(rep.path).toBe("REP");
    expect(kw.path).toBe("KNOWLEDGE_WORKER");
    expect(rep.mtdSen).toBe(kw.mtdSen);
    expect(rep.mtdSen).toBeGreaterThan(0);

    // C-Suite has no rebate → higher or equal MTD
    const cs = computePcbCSuite(
      { ...profile, formulaRegime: "C_SUITE" },
      month
    );
    expect(cs.path).toBe("C_SUITE");
    expect(cs.mtdSen).toBeGreaterThanOrEqual(rep.mtdSen);
  });

  it("dispatcher routes formulaRegime", () => {
    const month = baseMonth();
    const rep = computePcb(
      {
        residence: "RESIDENT",
        category: 1,
        disabledIndividual: false,
        disabledSpouse: false,
        qualifyingChildUnits: 0,
        formulaRegime: "REP",
      },
      month
    );
    expect(rep.path).toBe("REP");

    const cs = computePcb(
      {
        residence: "RESIDENT",
        category: 2,
        disabledIndividual: false,
        disabledSpouse: false,
        qualifyingChildUnits: 2,
        formulaRegime: "C_SUITE",
      },
      month
    );
    expect(cs.path).toBe("C_SUITE");
    // P = 12×10,000 − (9,000 + 4,000 + 4,000) = 120,000 − 17,000 = 103,000
    // tax 15% = 15,450; /12 = 1,287.50
    expect(cs.pSen).toBe(10_300_000);
    expect(cs.mtdSen).toBe(128_750);
  });
});
