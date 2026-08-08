/**
 * Official vectors from LHDN MTD Computerized Spec 2026 EXHIBIT 5.
 *
 * `P-TEST-2026` is fetched/hashed but has no published answer key — Q1–Q5 are
 * submission questions for IRBM verification, not self-checking fixtures.
 *
 * Manual oracle note: figures match EXHIBIT 5 in `P-SPEC-2026`
 * (sha256 a1618051…). No runtime scrape of the HTML calculator.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computePcb } from "@/domain/calc/pcb";
import {
  PCB_EPF_ANNUAL_CAP_SEN,
  PCB_RELIEFS_2026,
  PCB_TABLE1_2026,
} from "@/domain/calc/pcb-tables";
import type { PcbMonthContext, PcbTaxProfile } from "@/domain/calc/types";

const profile: PcbTaxProfile = {
  residence: "RESIDENT",
  category: 3,
  disabledIndividual: false,
  disabledSpouse: false,
  qualifyingChildUnits: 3,
};

interface Exhibit5Case {
  readonly name: string;
  readonly month: PcbMonthContext;
  readonly expectedMtdSen: number;
  readonly expectedPSen: number;
  readonly expectedK2Sen: number;
}

const EXHIBIT_5_NORMAL: readonly Exhibit5Case[] = [
  {
    name: "January 2025 — first month, n=11",
    month: {
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
    expectedMtdSen: 11_000,
    expectedPSen: 4_700_007,
    expectedK2Sen: 30_863,
  },
  {
    name: "February 2025 — X=RM110, n=10",
    month: {
      ySen: 550_000,
      kSen: 60_500,
      y1Sen: 550_000,
      k1Sen: 60_500,
      n: 10,
      xSen: 11_000,
      zSen: 0,
      accumulatedLpSen: 0,
      lp1Sen: 0,
    },
    expectedMtdSen: 11_000,
    expectedPSen: 4_700_000,
    expectedK2Sen: 27_900,
  },
  {
    name: "March 2025 — LP1=RM300, X=RM220, n=9",
    month: {
      ySen: 1_100_000,
      kSen: 121_000,
      y1Sen: 550_000,
      k1Sen: 60_500,
      n: 9,
      xSen: 22_000,
      zSen: 0,
      accumulatedLpSen: 0,
      lp1Sen: 30_000,
    },
    expectedMtdSen: 10_820,
    expectedPSen: 4_670_007,
    expectedK2Sen: 24_277,
  },
];

describe("PCB 2026 official vectors (EXHIBIT 5 Normal Remuneration)", () => {
  for (const c of EXHIBIT_5_NORMAL) {
    it(c.name, () => {
      const result = computePcb(profile, c.month);
      expect(result.path).toBe("NORMAL_RESIDENT");
      expect(result.k2Sen).toBe(c.expectedK2Sen);
      expect(result.pSen).toBe(c.expectedPSen);
      expect(result.mtdSen).toBe(c.expectedMtdSen);
    });
  }
});

describe("PCB 2026 official vectors (EXHIBIT 5 Additional Remuneration)", () => {
  it("April 2025 — bonus RM8,250 → total MTD RM833.70", () => {
    const month: PcbMonthContext = {
      ySen: 1_650_000,
      kSen: 181_500,
      y1Sen: 550_000,
      k1Sen: 60_500,
      n: 8,
      xSen: 32_820,
      zSen: 0,
      accumulatedLpSen: 30_000,
      lp1Sen: 30_000,
      ytSen: 825_000,
      ktSen: 90_800,
    };
    const result = computePcb(profile, month);
    expect(result.path).toBe("ADDITIONAL");
    expect(result.normalMtdSen).toBe(10_620);
    expect(result.additionalMtdSen).toBe(72_750);
    expect(result.mtdSen).toBe(83_370);
  });
});

describe("pcb-table1-2026.json mirrors pcb-tables.ts", () => {
  it("matches Table 1 rows, reliefs, and EPF cap", () => {
    const seedPath = path.resolve(
      import.meta.dirname,
      "../../db/seed/pcb-table1-2026.json"
    );
    const seed = JSON.parse(readFileSync(seedPath, "utf8")) as {
      epfAnnualCapSen: number;
      reliefs: typeof PCB_RELIEFS_2026;
      table1: typeof PCB_TABLE1_2026;
    };
    expect(seed.epfAnnualCapSen).toBe(PCB_EPF_ANNUAL_CAP_SEN);
    expect(seed.reliefs).toEqual(PCB_RELIEFS_2026);
    expect(seed.table1).toEqual([...PCB_TABLE1_2026]);
  });
});
