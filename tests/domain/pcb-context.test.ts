/**
 * @feature pay-run
 * @layer test
 */

import { describe, expect, it } from "vitest";
import { computeLine } from "@/domain/calc/compose";
import { qualifyingChildUnits } from "@/domain/calc/pcb-children";
import {
  buildPcbMonthContext,
  monthsRemainingAfter,
  splitRemunerationSen,
} from "@/domain/calc/pcb-context";
import { sumTp1ClaimsSen } from "@/domain/calc/pcb-tp1";
import type { PcbInput } from "@/domain/calc/types";
import {
  defaultSettings,
  loadPayItems,
  loadTables,
  makeEmployee,
} from "../helpers";

describe("pcb-context helpers", () => {
  it("monthsRemainingAfter from period end", () => {
    expect(monthsRemainingAfter("2026-01-31")).toBe(11);
    expect(monthsRemainingAfter("2026-07-31")).toBe(5);
    expect(monthsRemainingAfter("2026-12-31")).toBe(0);
  });

  it("qualifyingChildUnits applies OKU / higher-ed multipliers", () => {
    expect(
      qualifyingChildUnits([
        { kind: "STANDARD", count: 1 },
        { kind: "DISABLED_HIGHER_ED", count: 1 },
      ])
    ).toBe(9);
  });

  it("sumTp1ClaimsSen caps per code", () => {
    expect(
      sumTp1ClaimsSen([
        { code: "MEDICAL_PARENTS", amountSen: 500_000 },
        { code: "MEDICAL_PARENTS", amountSen: 400_000 },
      ])
    ).toBe(800_000);
  });

  it("splitRemunerationSen separates BONUS into Yt", () => {
    const split = splitRemunerationSen([
      {
        payItemCode: "BASIC",
        basis: "FIXED_MONTHLY",
        qty: null,
        rateSen: 550_000,
        amountSen: 550_000,
        computed: true,
      },
      {
        payItemCode: "BONUS",
        basis: "AMOUNT",
        qty: null,
        rateSen: null,
        amountSen: 825_000,
        computed: false,
      },
    ]);
    expect(split.y1Sen).toBe(550_000);
    expect(split.ytSen).toBe(825_000);
  });

  it("buildPcbMonthContext defaults n from period end", () => {
    const ctx = buildPcbMonthContext({
      periodEndIso: "2026-04-30",
      ytd: {
        ySen: 1_650_000,
        kSen: 181_500,
        xSen: 32_820,
        zSen: 0,
        accumulatedLpSen: 30_000,
      },
      y1Sen: 550_000,
      k1Sen: 60_500,
      ytSen: 825_000,
      ktSen: 90_800,
      lp1Sen: 30_000,
    });
    expect(ctx.n).toBe(8);
  });
});

describe("compose auto-fills Y1/K1 when tax profile + YTD present", () => {
  it("computes PCB without a verified override", () => {
    const pcb: PcbInput = {
      pcbAmountSen: null,
      zakatOffsetSen: 0,
      cp38Sen: 0,
      verified: false,
      autoRemunerationFromItems: true,
      taxProfile: {
        residence: "RESIDENT",
        category: 1,
        disabledIndividual: false,
        disabledSpouse: false,
        qualifyingChildUnits: 0,
        formulaRegime: "NORMAL",
      },
      monthContext: buildPcbMonthContext({
        periodEndIso: "2026-01-31",
        ytd: {
          ySen: 0,
          kSen: 0,
          xSen: 0,
          zSen: 0,
          accumulatedLpSen: 0,
        },
        y1Sen: 0,
        k1Sen: 0,
      }),
    };

    const result = computeLine({
      employee: makeEmployee({
        dob: "1990-01-15",
        baseRateSen: 550_000,
        pcbApplicable: true,
      }),
      inputs: {
        workingDays: 26,
        paidDays: 26,
        hoursWorked: null,
        items: [],
        periodEnd: "2026-01-31",
      },
      payItems: loadPayItems(),
      tables: loadTables(),
      settings: defaultSettings(),
      pcb,
    });

    expect(result.pcbNetSen).not.toBeNull();
    expect(result.pcbNetSen).toBeGreaterThan(0);
    expect(result.netSen).not.toBeNull();
  });
});
