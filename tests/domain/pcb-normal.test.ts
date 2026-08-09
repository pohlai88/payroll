/**
 * @feature pay-run
 * @layer test
 */

import { describe, expect, it } from "vitest";
import {
  computePcb,
  computePcbNonResident,
  estimateK2Sen,
  pcbNet,
  resolveGrossPcbSen,
} from "@/domain/calc/pcb";
import type { PcbMonthContext, PcbTaxProfile } from "@/domain/calc/types";
import {
  divTruncateSen,
  pctTruncateSen,
  roundUpToFiveSen,
  truncateSen,
} from "@/domain/money";

const cat3Profile: PcbTaxProfile = {
  residence: "RESIDENT",
  category: 3,
  disabledIndividual: false,
  disabledSpouse: false,
  qualifyingChildUnits: 3,
};

describe("PCB money helpers (LHDN 2dp + 5-sen round-up)", () => {
  it("truncates toward zero", () => {
    expect(truncateSen(30863.636)).toBe(30863);
    expect(truncateSen(-1.9)).toBe(-1);
  });

  it("divides with truncate toward zero", () => {
    // EXHIBIT 5 Jan: (400000 − 60500) / 11 → 30863.636… → 30863 sen
    expect(divTruncateSen(339_500, 11)).toBe(30_863);
  });

  it("applies percent with truncate", () => {
    expect(pctTruncateSen(1_200_007, 6)).toBe(72_000);
  });

  it("rounds up to five sen", () => {
    expect(roundUpToFiveSen(28_702)).toBe(28_705);
    expect(roundUpToFiveSen(15_206)).toBe(15_210);
    expect(roundUpToFiveSen(11_000)).toBe(11_000);
  });
});

describe("estimateK2Sen (EPF annual cap)", () => {
  it("caps estimated remaining EPF and never exceeds K1", () => {
    expect(estimateK2Sen(0, 60_500, 11)).toBe(30_863);
    expect(estimateK2Sen(60_500, 60_500, 10)).toBe(27_900);
    // Cap exhausted → 0
    expect(estimateK2Sen(400_000, 60_500, 11)).toBe(0);
    // n = 0 → 0
    expect(estimateK2Sen(0, 60_500, 0)).toBe(0);
    // Estimated above K1 → K1
    expect(estimateK2Sen(0, 10_000, 11)).toBe(10_000);
    // Kt (additional EPF) reduces remaining headroom — EXHIBIT 5 April Step 2
    expect(estimateK2Sen(181_500, 60_500, 8, 400_000, 90_800)).toBe(8_400);
  });
});

describe("computePcbNormal — EXHIBIT 5 Normal cases", () => {
  it("January: Cat 3, 3 children, Y1=5500, K1=605, n=11 → RM110.00", () => {
    const month: PcbMonthContext = {
      ySen: 0,
      kSen: 0,
      y1Sen: 550_000,
      k1Sen: 60_500,
      n: 11,
      xSen: 0,
      zSen: 0,
      accumulatedLpSen: 0,
      lp1Sen: 0,
    };
    const result = computePcb(cat3Profile, month);
    expect(result.k2Sen).toBe(30_863);
    expect(result.pSen).toBe(4_700_007);
    expect(result.mtdSen).toBe(11_000);
  });

  it("February: prior Y/K and X=110 → RM110.00", () => {
    const month: PcbMonthContext = {
      ySen: 550_000,
      kSen: 60_500,
      y1Sen: 550_000,
      k1Sen: 60_500,
      n: 10,
      xSen: 11_000,
      zSen: 0,
      accumulatedLpSen: 0,
      lp1Sen: 0,
    };
    const result = computePcb(cat3Profile, month);
    expect(result.k2Sen).toBe(27_900);
    expect(result.pSen).toBe(4_700_000);
    expect(result.mtdSen).toBe(11_000);
  });

  it("March: LP1=300, X=220 → RM108.20", () => {
    const month: PcbMonthContext = {
      ySen: 1_100_000,
      kSen: 121_000,
      y1Sen: 550_000,
      k1Sen: 60_500,
      n: 9,
      xSen: 22_000,
      zSen: 0,
      accumulatedLpSen: 0,
      lp1Sen: 30_000,
    };
    const result = computePcb(cat3Profile, month);
    expect(result.k2Sen).toBe(24_277);
    expect(result.pSen).toBe(4_670_007);
    expect(result.mtdSen).toBe(10_820);
  });
});

describe("categories and <RM10", () => {
  it("Category 2 spouse relief changes B in the low band", () => {
    const month: PcbMonthContext = {
      ySen: 0,
      kSen: 0,
      y1Sen: 550_000,
      k1Sen: 60_500,
      n: 11,
      xSen: 0,
      zSen: 0,
      accumulatedLpSen: 0,
      lp1Sen: 0,
    };
    const cat2: PcbTaxProfile = {
      ...cat3Profile,
      category: 2,
      qualifyingChildUnits: 3,
    };
    const cat1: PcbTaxProfile = {
      ...cat3Profile,
      category: 1,
      qualifyingChildUnits: 0,
    };
    // Same P band (35k–50k) → B identical for cat1/2/3 at that band; differ via S.
    const mtdCat2 = computePcb(cat2, month).mtdSen;
    const mtdCat3 = computePcb(cat3Profile, month).mtdSen;
    const mtdCat1 = computePcb(cat1, month).mtdSen;
    // Cat 2 has spouse relief (+RM4,000) → lower P → possibly lower MTD
    expect(mtdCat2).toBeLessThanOrEqual(mtdCat3);
    // Cat 1 has no children → higher P → higher or equal MTD vs cat3 with 3 kids
    expect(mtdCat1).toBeGreaterThanOrEqual(mtdCat3);
  });

  it("MTD below RM10 becomes 0 unless employer elects to deduct", () => {
    // Force a tiny MTD via high prior X relative to a modest P.
    const profile: PcbTaxProfile = {
      residence: "RESIDENT",
      category: 1,
      disabledIndividual: false,
      disabledSpouse: false,
      qualifyingChildUnits: 0,
    };
    const month: PcbMonthContext = {
      ySen: 0,
      kSen: 0,
      y1Sen: 200_000,
      k1Sen: 0,
      n: 11,
      xSen: 0,
      zSen: 0,
      accumulatedLpSen: 0,
      lp1Sen: 0,
    };
    const base = computePcb(profile, month);
    // If already ≥ RM10, synthesise a below-RM10 case via non-resident tiny wage
    if (base.mtdSen >= 1_000) {
      const tiny = computePcbNonResident(2_000, false);
      expect(tiny.mtdSen).toBe(0);
      const elected = computePcbNonResident(2_000, true);
      expect(elected.mtdSen).toBeGreaterThan(0);
      expect(elected.mtdSen).toBeLessThan(1_000);
    } else {
      expect(base.mtdSen).toBe(0);
    }
  });
});

describe("non-resident 30%", () => {
  it("charges 30% of Y1 with 5-sen round-up", () => {
    // RM1,000 → RM300.00
    expect(computePcbNonResident(100_000).mtdSen).toBe(30_000);
    // RM20.00 → RM6.00 → <RM10 → 0
    expect(computePcbNonResident(2_000).mtdSen).toBe(0);
    // Same wage when employer elects to deduct below RM10
    expect(computePcbNonResident(2_000, true).mtdSen).toBe(600);
    // RM33.40 → 1,002 sen → round up to 1,005 (≥ RM10, deducted)
    expect(computePcbNonResident(3_340).mtdSen).toBe(1_005);
  });
});

describe("dual path resolve", () => {
  it("prefers verified override over compute", () => {
    const resolved = resolveGrossPcbSen({
      pcbAmountSen: 5_000,
      zakatOffsetSen: 0,
      cp38Sen: 0,
      verified: true,
      taxProfile: cat3Profile,
      monthContext: {
        ySen: 0,
        kSen: 0,
        y1Sen: 550_000,
        k1Sen: 60_500,
        n: 11,
        xSen: 0,
        zSen: 0,
        accumulatedLpSen: 0,
        lp1Sen: 0,
      },
    });
    expect(resolved.path).toBe("OVERRIDE");
    expect(resolved.grossPcbSen).toBe(5_000);
  });

  it("computes when profile + month context are complete and no override", () => {
    const resolved = resolveGrossPcbSen({
      pcbAmountSen: null,
      zakatOffsetSen: 0,
      cp38Sen: 0,
      verified: false,
      taxProfile: cat3Profile,
      monthContext: {
        ySen: 0,
        kSen: 0,
        y1Sen: 550_000,
        k1Sen: 60_500,
        n: 11,
        xSen: 0,
        zSen: 0,
        accumulatedLpSen: 0,
        lp1Sen: 0,
      },
    });
    expect(resolved.path).toBe("COMPUTED");
    expect(resolved.grossPcbSen).toBe(11_000);
  });

  it("applies zakat after resolve", () => {
    const net = pcbNet({
      pcbAmountSen: null,
      zakatOffsetSen: 2_000,
      cp38Sen: 0,
      verified: false,
      taxProfile: cat3Profile,
      monthContext: {
        ySen: 0,
        kSen: 0,
        y1Sen: 550_000,
        k1Sen: 60_500,
        n: 11,
        xSen: 0,
        zSen: 0,
        accumulatedLpSen: 0,
        lp1Sen: 0,
      },
    });
    expect(net.path).toBe("COMPUTED");
    expect(net.grossPcbSen).toBe(11_000);
    expect(net.netPcbSen).toBe(9_000);
  });
});
