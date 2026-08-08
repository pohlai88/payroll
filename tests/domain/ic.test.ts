import { describe, it, expect } from "vitest";
import { dobFromIc, ageAt } from "@/domain/ic";

const IN_2026 = new Date("2026-08-08");
const IN_2031 = new Date("2031-08-08");

describe("dobFromIc", () => {
  it("derives the birth date from the leading YYMMDD", () => {
    expect(dobFromIc("850312081234", IN_2026)).toBe("1985-03-12");
    expect(dobFromIc("011231146789", IN_2026)).toBe("2001-12-31");
  });

  it("tolerates the dashed presentation format", () => {
    expect(dobFromIc("850312-08-1234", IN_2026)).toBe("1985-03-12");
  });

  it("resolves the century pivot, with the tie year going to the 2000s", () => {
    expect(dobFromIc("260101081234", IN_2026)).toBe("2026-01-01"); // yy === currentYY
    expect(dobFromIc("270101081234", IN_2026)).toBe("1927-01-01"); // yy > currentYY
    expect(dobFromIc("300101081234", IN_2026)).toBe("1930-01-01");
  });

  it("is time-unstable by construction: same IC, different derivation year", () => {
    // Documented behaviour, not a defect — this is why the derived DOB is stored
    // once and never re-derived. If this test ever "fails", the pivot changed.
    expect(dobFromIc("300101081234", IN_2026)).toBe("1930-01-01");
    expect(dobFromIc("300101081234", IN_2031)).toBe("2030-01-01");
  });

  it("rejects dates that do not exist", () => {
    expect(dobFromIc("990231081234", IN_2026)).toBeNull(); // 31 Feb
    expect(dobFromIc("990001081234", IN_2026)).toBeNull(); // month 00
    expect(dobFromIc("991301081234", IN_2026)).toBeNull(); // month 13
    expect(dobFromIc("990132081234", IN_2026)).toBeNull(); // day 32
  });

  it("accepts Feb 29 only in a leap year", () => {
    expect(dobFromIc("000229081234", IN_2026)).toBe("2000-02-29");
    expect(dobFromIc("010229081234", IN_2026)).toBeNull();
  });

  it("requires exactly 12 digits", () => {
    expect(dobFromIc("123456", IN_2026)).toBeNull();
    expect(dobFromIc("85031208123", IN_2026)).toBeNull(); // 11
    expect(dobFromIc("8503120812345", IN_2026)).toBeNull(); // 13
    expect(dobFromIc("", IN_2026)).toBeNull();
    expect(dobFromIc("born 12 Mar 1985, IC ends 4321", IN_2026)).toBeNull();
  });
});

describe("ageAt", () => {
  it("counts completed years", () => {
    expect(ageAt("1985-03-12", "2026-08-08")).toBe(41);
    expect(ageAt("2000-01-01", "2026-01-01")).toBe(26);
  });

  it("ticks over on the birthday, not before", () => {
    expect(ageAt("1966-08-07", "2026-08-08")).toBe(60);
    expect(ageAt("1966-08-08", "2026-08-08")).toBe(60);
    expect(ageAt("1966-08-09", "2026-08-08")).toBe(59);
  });

  it("moves a Feb 29 birthday to Mar 1 in non-leap years", () => {
    expect(ageAt("2000-02-29", "2060-02-28")).toBe(59);
    expect(ageAt("2000-02-29", "2060-03-01")).toBe(60);
    expect(ageAt("2000-02-29", "2064-02-29")).toBe(64);
  });

  it("throws on malformed input instead of returning NaN", () => {
    // NaN would compare false against every `age >= 60` band and silently
    // select the under-60 statutory rates.
    expect(() => ageAt("garbage", "2026-08-08")).toThrow(RangeError);
    expect(() => ageAt("", "2026-08-08")).toThrow(RangeError);
    expect(() => ageAt("12/03/1985", "2026-08-08")).toThrow(RangeError);
    expect(() => ageAt("1985-3-12", "2026-08-08")).toThrow(RangeError);
    expect(() => ageAt("1985-03-12", "not-a-date")).toThrow(RangeError);
  });

  it("throws on dates that do not exist", () => {
    expect(() => ageAt("2024-02-31", "2026-01-01")).toThrow(RangeError);
    expect(() => ageAt("2023-02-29", "2026-01-01")).toThrow(RangeError);
    expect(() => ageAt("1985-03-12", "2026-13-01")).toThrow(RangeError);
  });
});
