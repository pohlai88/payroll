import { describe, it, expect } from "vitest";
import { computeLine, computeLineChecked, type ComposeOptions } from "@/domain/calc/compose";
import { validateLineInputs } from "@/domain/calc/validate";
import type { LineInputs } from "@/domain/calc/types";
import { loadTables, loadPayItems, defaultSettings, makeEmployee } from "../helpers";

function makeInputs(partial: Partial<LineInputs> = {}): LineInputs {
  return {
    workingDays: 26,
    paidDays: null,
    mealDays: null,
    hoursWorked: null,
    otHours: 0,
    otRateSen: 0,
    items: [],
    periodEnd: "2026-07-31",
    ...partial,
  };
}

function makeOpts(inputs: Partial<LineInputs> = {}, employee = makeEmployee()): ComposeOptions {
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
    const issues = validateLineInputs(makeEmployee(), makeInputs({ workingDays: 0 }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ path: "workingDays", code: "WORKING_DAYS_REQUIRED" });
  });

  it("allows zero paid days — full unpaid leave is a legitimate line, not an error", () => {
    expect(validateLineInputs(makeEmployee(), makeInputs({ paidDays: 0 }))).toEqual([]);
  });

  it("does not require working days for DAILY or HOURLY basis", () => {
    const daily = makeEmployee({ payBasis: "DAILY" });
    expect(validateLineInputs(daily, makeInputs({ workingDays: 0, paidDays: 12 }))).toEqual([]);
    const hourly = makeEmployee({ payBasis: "HOURLY" });
    expect(validateLineInputs(hourly, makeInputs({ workingDays: 0, hoursWorked: 80 }))).toEqual([]);
  });

  it("catches non-finite multipliers before they reach the arithmetic", () => {
    const hourly = makeEmployee({ payBasis: "HOURLY" });
    expect(validateLineInputs(hourly, makeInputs({ hoursWorked: NaN })))
      .toMatchObject([{ path: "hoursWorked", code: "HOURS_WORKED_INVALID" }]);
    expect(validateLineInputs(makeEmployee(), makeInputs({ otHours: Infinity })))
      .toMatchObject([{ path: "otHours", code: "OT_HOURS_INVALID" }]);
    expect(validateLineInputs(makeEmployee(), makeInputs({ paidDays: NaN })))
      .toMatchObject([{ path: "paidDays", code: "PAID_DAYS_INVALID" }]);
  });

  it("reports every issue at once rather than stopping at the first", () => {
    const issues = validateLineInputs(makeEmployee(), makeInputs({ workingDays: 0, otHours: -1 }));
    expect(issues.map((i) => i.path).sort()).toEqual(["otHours", "workingDays"]);
  });
});

describe("computeLineChecked — the wall in front of the tripwire", () => {
  it("returns a structured validation error for zero working days, not a RangeError", () => {
    const outcome = computeLineChecked(makeOpts({ workingDays: 0 }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected validation failure");
    expect(outcome.issues).toMatchObject([{ path: "workingDays", code: "WORKING_DAYS_REQUIRED" }]);
  });

  it("keeps the RangeError as defence in depth when the wall is bypassed", () => {
    // computeLine is the unvalidated path — a future caller that skips
    // validation must still fail loudly rather than emit an RM 0.00 payslip.
    expect(() => computeLine(makeOpts({ workingDays: 0 }))).toThrow(RangeError);
  });

  it("computes normally when inputs are valid", () => {
    const outcome = computeLineChecked(makeOpts());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
    expect(outcome.result.grossSen).toBe(350000);
  });

  it("prorates a zero-paid-days line to RM 0.00 basic instead of erroring", () => {
    const outcome = computeLineChecked(makeOpts({ paidDays: 0 }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
    expect(outcome.result.items.find((i) => i.payItemCode === "BASIC")?.amountSen).toBe(0);
  });
});
