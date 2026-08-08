import { describe, it, expect } from "vitest";
import {
  roundHalfUpSen,
  mulDivSen,
  pctRoundUpToRinggitSen,
  formatRM,
  parseRM,
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

  it("rejects more than 2 decimals instead of silently truncating", () => {
    // Policy: loud rejection. "1.234" must not become RM 1.23.
    expect(parseRM("1.234")).toBeNull();
    expect(parseRM("1.005")).toBeNull();
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
    expect(roundHalfUpSen(-0.49999999999999994)).toBe(-0);
  });

  it("throws on non-finite input", () => {
    expect(() => roundHalfUpSen(NaN)).toThrow(RangeError);
    expect(() => roundHalfUpSen(Infinity)).toThrow(RangeError);
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
    expect(mulDivSen(1_000_000_000_000_000, 999, 1000)).toBe(999_000_000_000_000);
  });

  it("rejects non-integer sen amounts", () => {
    expect(() => mulDivSen(100.5, 1, 2)).toThrow(RangeError);
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
});
