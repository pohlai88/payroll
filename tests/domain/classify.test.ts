/**
 * @feature pay-run
 * @layer test
 */

import { describe, expect, it } from "vitest";
import { classify } from "@/domain/calc/classify";
import { defaultSettings, makeEmployee } from "../helpers";

const PERIOD_END = "2026-07-31";
const settings = defaultSettings();

describe("classify — citizenship × age matrix", () => {
  it("Malaysian under retirement → Part A, FIRST, EIS eligible", () => {
    const cls = classify(
      makeEmployee({ dob: "1990-01-15", isMalaysian: true }),
      PERIOD_END,
      settings
    );
    expect(cls).toMatchObject({
      ageAtPeriodEnd: 36,
      epfPart: "A",
      socsoCategory: "FIRST",
      eisEligible: true,
      eisAge57Review: false,
    });
  });

  it("Malaysian at retirement → Part E, SECOND, EIS ineligible", () => {
    const cls = classify(
      makeEmployee({ dob: "1966-01-15", isMalaysian: true }),
      PERIOD_END,
      settings
    );
    expect(cls).toMatchObject({
      ageAtPeriodEnd: 60,
      epfPart: "E",
      socsoCategory: "SECOND",
      eisEligible: false,
    });
  });

  it("PR under retirement → Part A; at retirement → Part C", () => {
    const young = classify(
      makeEmployee({
        dob: "1990-01-15",
        isMalaysian: false,
        isPermanentResident: true,
      }),
      PERIOD_END,
      settings
    );
    expect(young.epfPart).toBe("A");

    const older = classify(
      makeEmployee({
        dob: "1966-01-15",
        isMalaysian: false,
        isPermanentResident: true,
      }),
      PERIOD_END,
      settings
    );
    expect(older.epfPart).toBe("C");
  });

  it("pre-Aug-1998 foreign member uses A/C age bands", () => {
    const young = classify(
      makeEmployee({
        dob: "1990-01-15",
        isMalaysian: false,
        isPermanentResident: false,
        epfMemberBeforeAug1998: true,
      }),
      PERIOD_END,
      settings
    );
    expect(young.epfPart).toBe("A");

    const older = classify(
      makeEmployee({
        dob: "1966-01-15",
        isMalaysian: false,
        isPermanentResident: false,
        epfMemberBeforeAug1998: true,
      }),
      PERIOD_END,
      settings
    );
    expect(older.epfPart).toBe("C");
  });

  it("post-1998 foreign non-member is Part F regardless of age", () => {
    for (const dob of ["1990-01-15", "1966-01-15"] as const) {
      const cls = classify(
        makeEmployee({
          dob,
          isMalaysian: false,
          isPermanentResident: false,
          epfMemberBeforeAug1998: false,
        }),
        PERIOD_END,
        settings
      );
      expect(cls.epfPart).toBe("F");
    }
  });

  it("honours EPF/SOCSO overrides without consulting age", () => {
    const cls = classify(
      makeEmployee({
        dob: null,
        eisApplicable: false,
        epfPartOverride: "C",
        socsoCategoryOverride: "SECOND",
      }),
      PERIOD_END,
      settings
    );
    expect(cls).toMatchObject({
      ageAtPeriodEnd: null,
      epfPart: "C",
      socsoCategory: "SECOND",
      eisEligible: false,
    });
  });

  it("schemes off with null DOB → NONE / ineligible, no throw", () => {
    const cls = classify(
      makeEmployee({
        dob: null,
        epfApplicable: false,
        socsoApplicable: false,
        eisApplicable: false,
      }),
      PERIOD_END,
      settings
    );
    expect(cls).toMatchObject({
      ageAtPeriodEnd: null,
      epfPart: "NONE",
      socsoCategory: "NONE",
      eisEligible: false,
      eisAge57Review: false,
    });
  });
});

describe("classify — EIS 57+ prior-contribution tri-state", () => {
  const age57 = makeEmployee({
    dob: "1969-01-15", // 57 at 2026-07-31
    eisPriorContribution: true,
  });

  it("known prior contribution stays eligible with no review flag", () => {
    const cls = classify(age57, PERIOD_END, settings);
    expect(cls.eisEligible).toBe(true);
    expect(cls.eisAge57Review).toBe(false);
  });

  it("confirmed no prior contribution exempts at 57+", () => {
    const cls = classify(
      makeEmployee({ ...age57, eisPriorContribution: false }),
      PERIOD_END,
      settings
    );
    expect(cls.eisEligible).toBe(false);
    expect(cls.eisAge57Review).toBe(false);
  });

  it("unknown prior contribution stays eligible and flags review", () => {
    const cls = classify(
      makeEmployee({ ...age57, eisPriorContribution: null }),
      PERIOD_END,
      settings
    );
    expect(cls.eisEligible).toBe(true);
    expect(cls.eisAge57Review).toBe(true);
  });
});

describe("classify — crash rather than corrupt", () => {
  it("throws when age is null but an EPF age band is required", () => {
    expect(() =>
      classify(
        makeEmployee({
          dob: null,
          epfApplicable: true,
          epfPartOverride: null,
          socsoApplicable: false,
          eisApplicable: false,
        }),
        PERIOD_END,
        settings
      )
    ).toThrow(/date of birth|age/i);
  });

  it("throws when age is null but SOCSO age band is required", () => {
    expect(() =>
      classify(
        makeEmployee({
          dob: null,
          epfApplicable: false,
          socsoApplicable: true,
          socsoCategoryOverride: null,
          eisApplicable: false,
        }),
        PERIOD_END,
        settings
      )
    ).toThrow(/date of birth|age/i);
  });

  it("throws when age is null but EIS applies", () => {
    expect(() =>
      classify(
        makeEmployee({
          dob: null,
          epfApplicable: false,
          socsoApplicable: false,
          eisApplicable: true,
        }),
        PERIOD_END,
        settings
      )
    ).toThrow(/date of birth|age/i);
  });

  it("throws when foreign EPF membership before Aug 1998 is unknown", () => {
    expect(() =>
      classify(
        makeEmployee({
          dob: "1990-01-15",
          isMalaysian: false,
          isPermanentResident: false,
          epfMemberBeforeAug1998: null,
        }),
        PERIOD_END,
        settings
      )
    ).toThrow(/membership|August 1998|unknown/i);
  });

  it("does not treat unknown membership as Part F", () => {
    expect(() =>
      classify(
        makeEmployee({
          dob: "1990-01-15",
          isMalaysian: false,
          isPermanentResident: false,
          epfMemberBeforeAug1998: null,
        }),
        PERIOD_END,
        settings
      )
    ).toThrow();
    // Explicit: must not return a silent Part F classification.
  });
});
