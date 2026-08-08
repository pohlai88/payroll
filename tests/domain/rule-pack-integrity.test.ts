import { describe, expect, it } from "vitest";
import { eis } from "@/domain/calc/eis";
import { epf } from "@/domain/calc/epf";
import { socso } from "@/domain/calc/socso";
import type { Band5, SocsoBand } from "@/domain/calc/types";
import { defaultSettings, loadTables } from "../helpers";

const tables = loadTables();
const settings = defaultSettings();

/**
 * A band table is data the rule pack supplies, republished by hand each time a
 * statutory rate moves. A wage that matches no band means that data has a hole
 * in it. Zeroing the contribution would put a wrong figure on a payslip and
 * leave nothing behind to find it by, so every lookup miss stops the run.
 */
describe("band lookup refuses to fall through to zero", () => {
  it("throws when the SOCSO table has a gap over the wage", () => {
    const holed: SocsoBand[] = tables.socso.filter(
      (b) => !(b.fromSen <= 300000 && b.toSen >= 300000)
    );
    expect(() => socso(300000, "FIRST", holed, "2026-07-31", settings)).toThrow(
      RangeError
    );
  });

  it("throws when the EIS table has a gap over the wage", () => {
    const holed: Band5[] = tables.eis.filter(
      (b) => !(b.fromSen <= 300000 && b.toSen >= 300000)
    );
    expect(() => eis(300000, true, holed)).toThrow(RangeError);
  });

  it("throws when the EPF Third Schedule has a gap over the wage", () => {
    const holed = {
      ...tables.epf,
      A: tables.epf.A.filter(
        (b) => !(b.fromSen <= 300000 && b.toSen >= 300000)
      ),
    };
    expect(() => epf(300000, "A", holed, settings)).toThrow(RangeError);
  });

  it("still computes normally against the shipped tables", () => {
    expect(() =>
      socso(300000, "FIRST", tables.socso, "2026-07-31", settings)
    ).not.toThrow();
    expect(() => eis(300000, true, tables.eis)).not.toThrow();
    expect(() => epf(300000, "A", tables.epf, settings)).not.toThrow();
  });
});

/**
 * The SKBBK window is decided by comparing ISO date strings directly, which is
 * only sound while they are well formed. An unpadded month sorts above a padded
 * one, so "2026-5-31" reads as later than "2026-06-01" and switches on a
 * supplement for a month that precedes the phase.
 */
describe("SKBBK phase window rejects dates it cannot compare", () => {
  it("throws on an unpadded period end rather than misplacing the window", () => {
    expect(() =>
      socso(300000, "FIRST", tables.socso, "2026-5-31", settings)
    ).toThrow(RangeError);
  });

  it("throws on a malformed phase boundary in the rule pack", () => {
    expect(() =>
      socso(300000, "FIRST", tables.socso, "2026-07-31", {
        ...settings,
        skbbkPhaseFrom: "1 June 2026",
      })
    ).toThrow(RangeError);
  });

  it("applies SKBBK inside the window and withholds it outside", () => {
    const inside = socso(300000, "FIRST", tables.socso, "2026-07-31", settings);
    const before = socso(300000, "FIRST", tables.socso, "2026-05-31", settings);
    const after = socso(300000, "FIRST", tables.socso, "2028-06-01", settings);
    expect(inside.eeSkbbkSen).toBeGreaterThan(0);
    expect(before.eeSkbbkSen).toBe(0);
    expect(after.eeSkbbkSen).toBe(0);
  });
});
