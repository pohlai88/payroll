/**
 * @feature pay-run
 * @layer test
 */

import { describe, expect, it } from "vitest";
import { computePcb, computePcbAdditional } from "@/domain/calc/pcb";
import type { PcbMonthContext, PcbTaxProfile } from "@/domain/calc/types";

const cat3: PcbTaxProfile = {
  residence: "RESIDENT",
  category: 3,
  disabledIndividual: false,
  disabledSpouse: false,
  qualifyingChildUnits: 3,
};

describe("computePcbAdditional — EXHIBIT 5 April 2025", () => {
  it("normal RM106.20 + additional RM727.50 = RM833.70", () => {
    const month: PcbMonthContext = {
      ySen: 1_650_000, // Jan–Mar × 5,500
      kSen: 181_500, // 605 × 3
      y1Sen: 550_000,
      k1Sen: 60_500,
      n: 8,
      xSen: 32_820, // 110 + 110 + 108.20
      zSen: 0,
      accumulatedLpSen: 30_000, // March books+medical
      lp1Sen: 30_000, // April sport+SSPN
      ytSen: 825_000, // bonus
      ktSen: 90_800,
    };

    const result = computePcbAdditional(cat3, month);
    expect(result.path).toBe("ADDITIONAL");
    expect(result.k2Sen).toBe(19_750); // Step-1 K2 (Kt excluded)
    expect(result.pSen).toBe(4_640_000);
    expect(result.normalMtdSen).toBe(10_620);
    expect(result.pWithAdditionalSen).toBe(5_465_000);
    expect(result.additionalMtdSen).toBe(72_750);
    expect(result.mtdSen).toBe(83_370);

    // Dispatcher selects Additional when ytSen is set under NORMAL regime
    expect(computePcb(cat3, month).mtdSen).toBe(83_370);
  });
});
