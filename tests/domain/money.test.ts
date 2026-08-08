import { describe, expect, it } from "vitest";
import {
  divTruncateSen,
  formatRM,
  mulDivSen,
  parseRM,
  pctHalfUpSen,
  pctRoundUpToRinggitSen,
  pctTruncateSen,
  quantityAmountSen,
  roundHalfUpSen,
  roundUpToFiveSen,
  truncateSen,
} from "@/domain/money";

describe("parseRM", () => {
  it("parses plain and comma-grouped 2dp input", () => {
    expect(parseRM("1234.56")).toBe(123456);
    expect(parseRM("1,234.56")).toBe(123456);
    expect(parseRM("1234.5")).toBe(123450);
    expect(parseRM("1234")).toBe(123400);
    expect(parseRM(".5")).toBe(50);
    expect(parseRM("0.07")).toBe(7);
    expect(parseRM("-0.50")).toBe(-50);
    expect(parseRM("+12.34")).toBe(1234);
  });

  it("returns null for blank and non-numeric input", () => {
    expect(parseRM("")).toBeNull();
    expect(parseRM("   ")).toBeNull();
    expect(parseRM("abc")).toBeNull();
    expect(parseRM("RM 10")).toBeNull();
    expect(parseRM("-")).toBeNull();
    expect(parseRM(".")).toBeNull();
  });

  it("rejects hex, exponent and Infinity rather than parsing them as money", () => {
    expect(parseRM("0x10")).toBeNull();
    expect(parseRM("1e3")).toBeNull();
    expect(parseRM("Infinity")).toBeNull();
    expect(parseRM("-Infinity")).toBeNull();
  });

  it("accepts exactly 2 decimals and rejects a third", () => {
    // DECISION: 2dp max. RM has no sub-sen legal tender, and parseRM sits at a
    // *user-input* boundary — a third decimal means a typo or a paste from a
    // source with more precision than money. Reject so the user fixes it at the
    // form, rather than silently rounding away a discrepancy they should see.
    // An ingestion boundary (CSV of computed third-party rates, where 3dp is a
    // legitimate intermediate) needs a separate lenient parser, not a looser
    // contract here.
    expect(parseRM("1.00")).toBe(100);
    expect(parseRM("1.005")).toBeNull();

    expect(parseRM("1.234")).toBeNull();
    expect(parseRM("8.575")).toBeNull();
  });

  it("never loses a sen on tie-adjacent 2dp input (no float multiply)", () => {
    // Number("8.57") * 100 === 856.9999999999999 — string parsing sidesteps it.
    expect(parseRM("8.57")).toBe(857);
    expect(parseRM("1.15")).toBe(115);
    expect(parseRM("70.07")).toBe(7007);
    expect(parseRM("1.00")).toBe(100);
  });

  it("tolerates loose comma placement (paste-tolerance, documented)", () => {
    expect(parseRM("1,2,3.45")).toBe(12345);
  });
});

describe("truncateSen / divTruncateSen / pctTruncateSen / roundUpToFiveSen", () => {
  it("truncates toward zero (LHDN 2dp omit)", () => {
    expect(truncateSen(123.4534)).toBe(123);
    expect(truncateSen(-1.9)).toBe(-1);
  });

  it("divides and applies percent with truncate toward zero", () => {
    expect(divTruncateSen(339_500, 11)).toBe(30_863);
    expect(pctTruncateSen(1_200_007, 6)).toBe(72_000);
    expect(pctTruncateSen(-1_200_007, 6)).toBe(-72_000);
  });

  it("rounds up to the next 5 sen", () => {
    expect(roundUpToFiveSen(28_702)).toBe(28_705);
    expect(roundUpToFiveSen(15_206)).toBe(15_210);
    expect(roundUpToFiveSen(0)).toBe(0);
    expect(() => roundUpToFiveSen(-1)).toThrow(RangeError);
  });
});

describe("roundHalfUpSen", () => {
  it("rounds half away from zero", () => {
    expect(roundHalfUpSen(2.5)).toBe(3);
    expect(roundHalfUpSen(-2.5)).toBe(-3); // pinned decision: not -2
    expect(roundHalfUpSen(2.4)).toBe(2);
    expect(roundHalfUpSen(-2.4)).toBe(-2);
    expect(roundHalfUpSen(0)).toBe(0);
  });

  it("is not fooled by the +0.5 epsilon trap", () => {
    expect(roundHalfUpSen(0.49999999999999994)).toBe(0);
    // Normalised to +0: a stored sen value must not carry a negative zero,
    // which would compare unequal under Object.is and split Map keys.
    expect(roundHalfUpSen(-0.49999999999999994)).toBe(0);
  });

  it("throws on non-finite input", () => {
    expect(() => roundHalfUpSen(Number.NaN)).toThrow(RangeError);
    expect(() => roundHalfUpSen(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => roundHalfUpSen(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("mulDivSen", () => {
  it("prorates exactly with integer day counts", () => {
    expect(mulDivSen(300000, 26, 26)).toBe(300000);
    expect(mulDivSen(300000, 13, 26)).toBe(150000);
    expect(mulDivSen(250000, 17, 22)).toBe(193182); // 193181.81… → half-up
  });

  it("rounds half away from zero", () => {
    expect(mulDivSen(101, 1, 2)).toBe(51); // 50.5
    expect(mulDivSen(-101, 1, 2)).toBe(-51);
    expect(mulDivSen(101, -1, 2)).toBe(-51);
    expect(mulDivSen(101, 1, -2)).toBe(-51);
  });

  it("throws on a zero denominator instead of returning RM 0.00", () => {
    expect(() => mulDivSen(300000, 10, 0)).toThrow(RangeError);
  });

  it("supports fractional numerators (half-days)", () => {
    expect(mulDivSen(300000, 15.5, 26)).toBe(178846); // 178846.15…
    expect(mulDivSen(300000, 0.5, 1)).toBe(150000);
  });

  it("is exact where float multiplication would overflow safe integers", () => {
    // 1e15 sen × 999 exceeds MAX_SAFE_INTEGER as a float product.
    expect(mulDivSen(1_000_000_000_000_000, 999, 1000)).toBe(
      999_000_000_000_000
    );
  });

  it("rejects non-integer sen amounts", () => {
    expect(() => mulDivSen(100.5, 1, 2)).toThrow(RangeError);
  });

  it("throws on non-finite numerator or denominator", () => {
    expect(() => mulDivSen(100000, Number.NaN, 2)).toThrow(RangeError);
    expect(() => mulDivSen(100000, 1, Number.NaN)).toThrow(RangeError);
    expect(() => mulDivSen(100000, Number.POSITIVE_INFINITY, 2)).toThrow(
      RangeError
    );
    expect(() => mulDivSen(100000, 1, Number.NEGATIVE_INFINITY)).toThrow(
      RangeError
    );
  });

  it("throws on NaN or Infinity in sen amounts", () => {
    expect(() => mulDivSen(Number.NaN, 1, 2)).toThrow(RangeError);
    expect(() => mulDivSen(Number.POSITIVE_INFINITY, 1, 2)).toThrow(RangeError);
  });
});

describe("pctRoundUpToRinggitSen", () => {
  it("rounds up to the next whole ringgit", () => {
    expect(pctRoundUpToRinggitSen(2_500_000, 11)).toBe(275000); // exactly RM2,750
    expect(pctRoundUpToRinggitSen(2_500_100, 11)).toBe(275100); // RM2,750.11 → RM2,751
    expect(pctRoundUpToRinggitSen(2_100_000, 13)).toBe(273000);
  });

  it("does not charge an extra ringgit on exact boundaries", () => {
    // (amountSen × pct) landing exactly on a ringgit must stay put.
    expect(pctRoundUpToRinggitSen(10_000, 11)).toBe(1100); // RM100 × 11% = RM11.00
    expect(pctRoundUpToRinggitSen(100_000, 12)).toBe(12000); // RM1,000 × 12% = RM120.00
    expect(pctRoundUpToRinggitSen(300_000, 11)).toBe(33000); // RM3,000 × 11% = RM330.00
  });

  it("handles 1dp statutory rates exactly", () => {
    expect(pctRoundUpToRinggitSen(2_000_000, 6.5)).toBe(130000); // RM20,000 × 6.5% = RM1,300
    expect(pctRoundUpToRinggitSen(2_000_100, 6.5)).toBe(130100);
  });

  it("returns zero for a zero amount", () => {
    expect(pctRoundUpToRinggitSen(0, 11)).toBe(0);
  });

  it("rejects negative amounts and >2dp rates", () => {
    expect(() => pctRoundUpToRinggitSen(-100, 11)).toThrow(RangeError);
    expect(() => pctRoundUpToRinggitSen(100, 11.234)).toThrow(RangeError);
  });

  it("rejects non-finite amounts and rates", () => {
    expect(() => pctRoundUpToRinggitSen(Number.NaN, 11)).toThrow(RangeError);
    expect(() => pctRoundUpToRinggitSen(Number.POSITIVE_INFINITY, 11)).toThrow(
      RangeError
    );
    expect(() => pctRoundUpToRinggitSen(100000, Number.NaN)).toThrow(
      RangeError
    );
    expect(() =>
      pctRoundUpToRinggitSen(100000, Number.NEGATIVE_INFINITY)
    ).toThrow(RangeError);
  });
});

describe("formatRM", () => {
  it("formats with grouping and 2dp", () => {
    expect(formatRM(123456)).toBe("1,234.56");
    expect(formatRM(0)).toBe("0.00");
    expect(formatRM(7)).toBe("0.07");
    expect(formatRM(-50)).toBe("-0.50");
    expect(formatRM(-123456)).toBe("-1,234.56");
  });

  it("round-trips with parseRM", () => {
    for (const sen of [0, 7, 50, 100, 123456, -123456, 999999999]) {
      expect(parseRM(formatRM(sen))).toBe(sen);
    }
  });

  it("throws on non-integer sen", () => {
    expect(() => formatRM(100.5)).toThrow(RangeError);
  });

  it("throws on NaN and Infinity at boundary", () => {
    expect(() => formatRM(Number.NaN)).toThrow(RangeError);
    expect(() => formatRM(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => formatRM(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("quantityAmountSen", () => {
  it("calculates quantity × rate properly", () => {
    expect(quantityAmountSen(40, 2500)).toBe(100000); // 40 hours × RM25.00/hour = RM1000
    expect(quantityAmountSen(22.5, 30000)).toBe(675000); // 22.5 days × RM300/day = RM6750
    expect(quantityAmountSen(0.5, 5000)).toBe(2500); // 0.5 units × RM50/unit = RM25
  });

  it("rounds half away from zero", () => {
    expect(quantityAmountSen(1.5, 167)).toBe(251); // 1.5 × 167 = 250.5 → 251
    expect(quantityAmountSen(2.5, 101)).toBe(253); // 2.5 × 101 = 252.5 → 253
    expect(quantityAmountSen(-1.5, 167)).toBe(-251); // -1.5 × 167 = -250.5 → -251
  });

  it("handles zero quantities and rates", () => {
    expect(quantityAmountSen(0, 2500)).toBe(0);
    expect(quantityAmountSen(40, 0)).toBe(0);
    expect(quantityAmountSen(0, 0)).toBe(0);
  });

  it("rejects non-finite quantities", () => {
    expect(() => quantityAmountSen(Number.NaN, 2500)).toThrow(RangeError);
    expect(() => quantityAmountSen(Number.POSITIVE_INFINITY, 2500)).toThrow(
      RangeError
    );
  });

  it("rejects non-integer rate sen", () => {
    expect(() => quantityAmountSen(40, 2500.5)).toThrow(RangeError);
    expect(() => quantityAmountSen(40, Number.NaN)).toThrow(RangeError);
  });
});

describe("pctHalfUpSen", () => {
  it("calculates percentages with half-up rounding", () => {
    expect(pctHalfUpSen(100000, 0.25)).toBe(250); // RM1000 × 0.25% = RM2.50
    expect(pctHalfUpSen(500000, 1.75)).toBe(8750); // RM5000 × 1.75% = RM87.50
    expect(pctHalfUpSen(275000, 0.5)).toBe(1375); // RM2750 × 0.5% = RM13.75
  });

  it("rounds half away from zero on boundaries", () => {
    expect(pctHalfUpSen(100000, 0.255)).toBe(255); // RM1000 × 0.255% = 255.0 → 255
    expect(pctHalfUpSen(200001, 0.25)).toBe(500); // RM2000.01 × 0.25% = 500.0025 → 500 (not a half boundary)
    expect(pctHalfUpSen(200200, 0.25)).toBe(501); // RM2002.00 × 0.25% = 500.5 → 501 (half up)
  });

  it("handles zero amounts and percentages", () => {
    expect(pctHalfUpSen(0, 0.25)).toBe(0);
    expect(pctHalfUpSen(100000, 0)).toBe(0);
  });

  it("rejects negative amounts and invalid percentages", () => {
    expect(() => pctHalfUpSen(-100000, 0.25)).toThrow(RangeError);
    expect(() => pctHalfUpSen(100000, -0.25)).toThrow(RangeError);
    expect(() => pctHalfUpSen(100000, Number.NaN)).toThrow(RangeError);
    expect(() => pctHalfUpSen(100000, Number.POSITIVE_INFINITY)).toThrow(
      RangeError
    );
  });

  it("rejects non-integer sen amounts", () => {
    expect(() => pctHalfUpSen(100000.5, 0.25)).toThrow(RangeError);
    expect(() => pctHalfUpSen(Number.NaN, 0.25)).toThrow(RangeError);
  });
});
