import { describe, expect, it } from "vitest";
import {
  type ComposeOptions,
  computeLine,
  computeLineChecked,
} from "@/domain/calc/compose";
import type { LineInputs } from "@/domain/calc/types";
import { validateLineInputs } from "@/domain/calc/validate";
import {
  defaultSettings,
  loadPayItems,
  loadTables,
  makeEmployee,
} from "../helpers";

function makeInputs(partial: Partial<LineInputs> = {}): LineInputs {
  return {
    workingDays: 26,
    paidDays: null,
    hoursWorked: null,
    items: [],
    periodEnd: "2026-07-31",
    ...partial,
  };
}

function makeOpts(
  inputs: Partial<LineInputs> = {},
  employee = makeEmployee()
): ComposeOptions {
  return {
    employee,
    inputs: makeInputs(inputs),
    payItems: loadPayItems(),
    tables: loadTables(),
    settings: defaultSettings(),
  };
}

describe("validateLineInputs", () => {
  it("passes a well-formed monthly line", () => {
    expect(validateLineInputs(makeEmployee(), makeInputs())).toEqual([]);
  });

  it("rejects zero working days for MONTHLY basis", () => {
    const issues = validateLineInputs(
      makeEmployee(),
      makeInputs({ workingDays: 0 })
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      path: "workingDays",
      code: "WORKING_DAYS_REQUIRED",
    });
  });

  it("allows zero paid days — full unpaid leave is a legitimate line, not an error", () => {
    expect(
      validateLineInputs(makeEmployee(), makeInputs({ paidDays: 0 }))
    ).toEqual([]);
  });

  it("does not require working days for DAILY or HOURLY basis", () => {
    const daily = makeEmployee({ payBasis: "DAILY" });
    expect(
      validateLineInputs(daily, makeInputs({ workingDays: 0, paidDays: 12 }))
    ).toEqual([]);
    const hourly = makeEmployee({ payBasis: "HOURLY" });
    expect(
      validateLineInputs(
        hourly,
        makeInputs({ workingDays: 0, hoursWorked: 80 })
      )
    ).toEqual([]);
  });

  it("catches non-finite multipliers before they reach the arithmetic", () => {
    const hourly = makeEmployee({ payBasis: "HOURLY" });
    expect(
      validateLineInputs(hourly, makeInputs({ hoursWorked: Number.NaN }))
    ).toMatchObject([{ path: "hoursWorked", code: "HOURS_WORKED_INVALID" }]);
    expect(
      validateLineInputs(makeEmployee(), makeInputs({ paidDays: Number.NaN }))
    ).toMatchObject([{ path: "paidDays", code: "PAID_DAYS_INVALID" }]);
  });

  it("rejects a period end that cannot be compared against the SKBBK window", () => {
    for (const periodEnd of ["2026-7-31", "31/07/2026", "2026-02-30", ""]) {
      expect(
        validateLineInputs(makeEmployee(), makeInputs({ periodEnd }))
      ).toMatchObject([{ path: "periodEnd", code: "PERIOD_END_INVALID" }]);
    }
  });

  it("reports every issue at once rather than stopping at the first", () => {
    const issues = validateLineInputs(
      makeEmployee(),
      makeInputs({ workingDays: 0, paidDays: Number.NaN })
    );
    expect(issues.map((i) => i.path).sort()).toEqual([
      "paidDays",
      "workingDays",
    ]);
  });

  it("rejects a blank date of birth — the empty string used to slip past classify", () => {
    const issues = validateLineInputs(makeEmployee({ dob: "" }), makeInputs());
    expect(issues).toMatchObject([
      { path: "employee.dob", code: "DOB_INVALID" },
    ]);
  });

  it("rejects a malformed or nonexistent date of birth", () => {
    for (const dob of ["15/01/1990", "1990-1-15", "1990-02-30", "not a date"]) {
      expect(
        validateLineInputs(makeEmployee({ dob }), makeInputs())
      ).toMatchObject([{ path: "employee.dob", code: "DOB_INVALID" }]);
    }
  });

  it("requires a date of birth when age drives a statutory band", () => {
    const issues = validateLineInputs(
      makeEmployee({ dob: null }),
      makeInputs()
    );
    expect(issues).toMatchObject([
      { path: "employee.dob", code: "DOB_REQUIRED" },
    ]);
  });

  it("allows a null date of birth when no age band applies", () => {
    // All three schemes off: classify never consults age, so the employee
    // classifies to NONE/NONE/false without guessing anything.
    const noStatutory = makeEmployee({
      dob: null,
      epfApplicable: false,
      socsoApplicable: false,
      eisApplicable: false,
    });
    expect(validateLineInputs(noStatutory, makeInputs())).toEqual([]);
  });

  it("still requires a date of birth if any one scheme needs the age", () => {
    const base = {
      dob: null,
      epfApplicable: false,
      socsoApplicable: false,
      eisApplicable: false,
    };
    for (const on of [
      "epfApplicable",
      "socsoApplicable",
      "eisApplicable",
    ] as const) {
      const issues = validateLineInputs(
        makeEmployee({ ...base, [on]: true }),
        makeInputs()
      );
      expect(issues).toMatchObject([
        { path: "employee.dob", code: "DOB_REQUIRED" },
      ]);
    }
  });

  it("does not demand a date of birth for bands covered by an override", () => {
    // EPF part and SOCSO category set manually bypass the age band; EIS has no
    // override, so it is switched off here.
    const overridden = makeEmployee({
      dob: null,
      eisApplicable: false,
      epfPartOverride: "A",
      socsoCategoryOverride: "FIRST",
    });
    expect(validateLineInputs(overridden, makeInputs())).toEqual([]);
  });
});

describe("computeLineChecked — the wall in front of the tripwire", () => {
  it("returns a structured validation error for zero working days, not a RangeError", () => {
    const outcome = computeLineChecked(makeOpts({ workingDays: 0 }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      throw new Error("expected validation failure");
    }
    expect(outcome.issues).toMatchObject([
      { path: "workingDays", code: "WORKING_DAYS_REQUIRED" },
    ]);
  });

  it("keeps the RangeError as defence in depth when the wall is bypassed", () => {
    // computeLine is the unvalidated path — a future caller that skips
    // validation must still fail loudly rather than emit an RM 0.00 payslip.
    expect(() => computeLine(makeOpts({ workingDays: 0 }))).toThrow(RangeError);
  });

  it("computes normally when inputs are valid", () => {
    const outcome = computeLineChecked(makeOpts());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      throw new Error(JSON.stringify(outcome.issues));
    }
    expect(outcome.result.grossSen).toBe(350000);
  });

  it("returns a validation error for a blank DOB rather than a computed line", () => {
    const outcome = computeLineChecked(makeOpts({}, makeEmployee({ dob: "" })));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      throw new Error("expected validation failure");
    }
    expect(outcome.issues).toMatchObject([
      { path: "employee.dob", code: "DOB_INVALID" },
    ]);
  });

  it("throws rather than silently classifying when a blank DOB bypasses the wall", () => {
    // The old `emp.dob ? …` falsy guard turned "" into a null age, which fell
    // through every `age >= 60` band and produced under-60 statutory rates on a
    // normal-looking payslip. The empty string must now reach ageAt and throw.
    expect(() => computeLine(makeOpts({}, makeEmployee({ dob: "" })))).toThrow(
      RangeError
    );
  });

  it("computes a null-DOB employee with no statutory schemes instead of guessing", () => {
    const outcome = computeLineChecked(
      makeOpts(
        {},
        makeEmployee({
          dob: null,
          epfApplicable: false,
          socsoApplicable: false,
          eisApplicable: false,
        })
      )
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      throw new Error(JSON.stringify(outcome.issues));
    }
    expect(outcome.result.epfEeSen).toBe(0);
    expect(outcome.result.socsoEeCoreSen).toBe(0);
    expect(outcome.result.socsoErSen).toBe(0);
    expect(outcome.result.eisEeSen).toBe(0);
  });

  it("prorates a zero-paid-days line to RM 0.00 basic instead of erroring", () => {
    const outcome = computeLineChecked(makeOpts({ paidDays: 0 }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      throw new Error(JSON.stringify(outcome.issues));
    }
    expect(
      outcome.result.items.find((i) => i.payItemCode === "BASIC")?.amountSen
    ).toBe(0);
  });
});
