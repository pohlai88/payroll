import type { EmployeeSnapshot, LineInputs } from "./types";

/**
 * Input validation for the calc layer.
 *
 * This is the wall; the `RangeError`s inside `money.ts` are the tripwire behind
 * it. Anything that reaches the arithmetic with a zero divisor or a non-finite
 * multiplier is a bug, and the primitives throw — but a real user should never
 * see that. Validation happens here, at the domain boundary, and produces
 * structured issues with a field path that an API or form can report.
 *
 * When a persistence/transport schema (Zod or equivalent) lands, it should
 * either call this or mirror it; the contract is the field paths below.
 */

export interface ValidationIssue {
  /** Field path within LineInputs, e.g. "workingDays". */
  path: string;
  /** Stable machine-readable code for i18n / API consumers. */
  code:
    | "WORKING_DAYS_REQUIRED"
    | "PAID_DAYS_INVALID"
    | "HOURS_WORKED_INVALID"
    | "MEAL_DAYS_INVALID"
    | "OT_HOURS_INVALID"
    | "OT_RATE_INVALID";
  message: string;
}

function isNonNegativeFinite(v: number): boolean {
  return Number.isFinite(v) && v >= 0;
}

/**
 * Validate the inputs that feed proration arithmetic. Returns [] when valid.
 *
 * `workingDays` must be >= 1 for MONTHLY basis: it is the proration divisor.
 * Note that it describes the wage *period*, not the employee — an employee
 * hired on the last day, or on unpaid leave for the whole month, has
 * `paidDays === 0` with `workingDays` unchanged, which prorates to RM 0.00
 * correctly. There is no legitimate state in which a wage period has zero
 * working days, so a zero here is always a misconfigured period.
 */
export function validateLineInputs(
  employee: EmployeeSnapshot,
  inputs: LineInputs
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (employee.payBasis === "MONTHLY") {
    if (!Number.isFinite(inputs.workingDays) || inputs.workingDays < 1) {
      issues.push({
        path: "workingDays",
        code: "WORKING_DAYS_REQUIRED",
        message: `Working days in the wage period must be at least 1 for monthly-paid employees (got ${inputs.workingDays}).`,
      });
    }
  }

  if (inputs.paidDays !== null && !isNonNegativeFinite(inputs.paidDays)) {
    issues.push({
      path: "paidDays",
      code: "PAID_DAYS_INVALID",
      message: `Days paid must be a number of 0 or more (got ${inputs.paidDays}).`,
    });
  }

  if (employee.payBasis === "HOURLY" && inputs.hoursWorked !== null && !isNonNegativeFinite(inputs.hoursWorked)) {
    issues.push({
      path: "hoursWorked",
      code: "HOURS_WORKED_INVALID",
      message: `Hours worked must be a number of 0 or more (got ${inputs.hoursWorked}).`,
    });
  }

  if (inputs.mealDays !== null && !isNonNegativeFinite(inputs.mealDays)) {
    issues.push({
      path: "mealDays",
      code: "MEAL_DAYS_INVALID",
      message: `Meal days must be a number of 0 or more (got ${inputs.mealDays}).`,
    });
  }

  if (!isNonNegativeFinite(inputs.otHours)) {
    issues.push({
      path: "otHours",
      code: "OT_HOURS_INVALID",
      message: `Overtime hours must be a number of 0 or more (got ${inputs.otHours}).`,
    });
  }

  if (!Number.isSafeInteger(inputs.otRateSen)) {
    issues.push({
      path: "otRateSen",
      code: "OT_RATE_INVALID",
      message: `Overtime rate must be a whole number of sen (got ${inputs.otRateSen}).`,
    });
  }

  return issues;
}
