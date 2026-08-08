import { describe, expect, it } from "vitest";
import {
  sumTp1ClaimsSen,
  TP1_ANNUAL_CAP_SEN,
  TP1_CODE_META,
  TP1_GROUP_CAP_SEN,
} from "@/domain/calc/pcb-tp1";

describe("TP1 catalog metadata", () => {
  it("exposes derived flat caps from TP1_CODE_META", () => {
    expect(TP1_ANNUAL_CAP_SEN.VOLUNTARY_EPF).toBe(400_000);
    expect(TP1_ANNUAL_CAP_SEN.BOOKS).toBeNull();
    expect(TP1_CODE_META.VOLUNTARY_EPF.group).toBe("EPF_LIFE_INSURANCE");
  });

  it("defines the four combined-envelope group caps", () => {
    expect(TP1_GROUP_CAP_SEN).toEqual({
      EPF_LIFE_INSURANCE: 700_000,
      LIFESTYLE_CORE: 250_000,
      LIFESTYLE_SPORT: 100_000,
      LIFESTYLE_ECO: 250_000,
    });
  });
});

describe("sumTp1ClaimsSen", () => {
  it("enforces per-code cap for a non-grouped code", () => {
    expect(
      sumTp1ClaimsSen([
        { code: "SSPN", amountSen: 500_000 },
        { code: "SSPN", amountSen: 500_000 },
      ])
    ).toBe(800_000);
  });

  it("EPF_LIFE_INSURANCE: individual caps sum to the group cap of RM7,000", () => {
    expect(
      sumTp1ClaimsSen([
        { code: "VOLUNTARY_EPF", amountSen: 500_000 },
        { code: "LIFE_INSURANCE_TAKAFUL", amountSen: 400_000 },
      ])
    ).toBe(700_000);
  });

  it("EPF_LIFE_INSURANCE: life alone cannot exceed RM3,000", () => {
    expect(
      sumTp1ClaimsSen([{ code: "LIFE_INSURANCE_TAKAFUL", amountSen: 400_000 }])
    ).toBe(300_000);
  });

  it("EPF_LIFE_INSURANCE: voluntary EPF alone cannot exceed RM4,000", () => {
    expect(
      sumTp1ClaimsSen([{ code: "VOLUNTARY_EPF", amountSen: 500_000 }])
    ).toBe(400_000);
  });

  it("LIFESTYLE_CORE: books + PC + internet capped at RM2,500 combined", () => {
    expect(
      sumTp1ClaimsSen([
        { code: "BOOKS", amountSen: 150_000 },
        { code: "PERSONAL_COMPUTER", amountSen: 150_000 },
        { code: "INTERNET", amountSen: 100_000 },
      ])
    ).toBe(250_000);
  });

  it("LIFESTYLE_SPORT: sport equipment + gym capped at RM1,000 combined", () => {
    expect(
      sumTp1ClaimsSen([
        { code: "SPORT_EQUIPMENT", amountSen: 80_000 },
        { code: "GYM", amountSen: 80_000 },
      ])
    ).toBe(100_000);
  });

  it("LIFESTYLE_ECO: CCTV + grinder + EV charging capped at RM2,500 combined", () => {
    expect(
      sumTp1ClaimsSen([
        { code: "CCTV", amountSen: 120_000 },
        { code: "FOOD_WASTE_GRINDER", amountSen: 100_000 },
        { code: "EV_CHARGING_FACILITY", amountSen: 100_000 },
      ])
    ).toBe(250_000);
  });

  it("lifestyle core and sport envelopes are independent", () => {
    expect(
      sumTp1ClaimsSen([
        { code: "BOOKS", amountSen: 250_000 },
        { code: "SPORT_EQUIPMENT", amountSen: 100_000 },
      ])
    ).toBe(350_000);
  });

  it("caps new SOCSO_CONTRIBUTION at RM350", () => {
    expect(
      sumTp1ClaimsSen([{ code: "SOCSO_CONTRIBUTION", amountSen: 50_000 }])
    ).toBe(35_000);
  });

  it("caps new BREASTFEEDING_EQUIPMENT at RM1,000", () => {
    expect(
      sumTp1ClaimsSen([{ code: "BREASTFEEDING_EQUIPMENT", amountSen: 150_000 }])
    ).toBe(100_000);
  });

  it("caps HOUSING_LOAN_INTEREST_HIGH_VALUE_HOME at RM5,000", () => {
    expect(
      sumTp1ClaimsSen([
        {
          code: "HOUSING_LOAN_INTEREST_HIGH_VALUE_HOME",
          amountSen: 600_000,
        },
      ])
    ).toBe(500_000);
  });

  it("rejects negative amounts", () => {
    expect(() => sumTp1ClaimsSen([{ code: "SSPN", amountSen: -1 }])).toThrow(
      RangeError
    );
  });
});
