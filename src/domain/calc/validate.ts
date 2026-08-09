/**
 * @feature pay-run
 * @layer domain
 *
 * Pure statutory calc (no I/O).
 */

import { isIsoDate } from "../date";
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
 * Gate readiness (`src/service/gates.ts`) has overlapping paid-days / hours
 * codes (`PAID_DAYS_MISSING` / `HOURS_MISSING`) for workflow blocking — keep
 * those distinct from these calc `*_INVALID` codes; do not merge the layers.
 *
 * When a persistence/transport schema (Zod or equivalent) lands, it should
 * either call this or mirror it; the contract is the field paths below.
 */

export interface ValidationIssue {
  /**
   * Field path within the validated input — a bare `LineInputs` field such as
   * "workingDays", or an `employee.`-prefixed path such as "employee.dob".
   */
  path: string;
  /** Stable machine-readable code for i18n / API consumers. */
  code:
    | "WORKING_DAYS_REQUIRED"
    | "PAID_DAYS_INVALID"
    | "HOURS_WORKED_INVALID"
    | "DOB_REQUIRED"
    | "DOB_INVALID"
    | "PERIOD_END_INVALID"
    | "EPF_MEMBERSHIP_REQUIRED";
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

  // Date of birth is required exactly when age drives a statutory band, which
  // mirrors the applicability branches in `classify`. An employee with no
  // statutory schemes never has their age consulted (they classify to
  // NONE/NONE/false), and an employee whose EPF part or SOCSO category is set
  // by override bypasses the age band for that scheme — demanding a DOB in
  // either case would be a spurious error. EIS has no override, so it always
  // needs the age. EPF Part F (post-1998 foreign non-member) does not use age.
  const epfNeedsAge =
    employee.epfApplicable &&
    employee.epfPartOverride === null &&
    (employee.isMalaysian ||
      employee.isPermanentResident ||
      employee.epfMemberBeforeAug1998 === true);

  const needsAge =
    epfNeedsAge ||
    (employee.socsoApplicable && employee.socsoCategoryOverride === null) ||
    employee.eisApplicable;

  // Foreign EPF without override: membership must be true or false — null is
  // not Part F (see classify). Malaysians/PR never consult this flag.
  if (
    employee.epfApplicable &&
    employee.epfPartOverride === null &&
    !employee.isMalaysian &&
    !employee.isPermanentResident &&
    employee.epfMemberBeforeAug1998 === null
  ) {
    issues.push({
      path: "employee.epfMemberBeforeAug1998",
      code: "EPF_MEMBERSHIP_REQUIRED",
      message:
        "EPF membership before August 1998 must be set to true or false for non-Malaysian, non-PR employees; unknown cannot choose Part F vs A/C.",
    });
  }

  if (employee.dob === null) {
    if (needsAge) {
      issues.push({
        path: "employee.dob",
        code: "DOB_REQUIRED",
        message:
          "Date of birth is required: it determines the EPF part, SOCSO category and EIS eligibility for this employee.",
      });
    }
  } else if (!isIsoDate(employee.dob)) {
    issues.push({
      path: "employee.dob",
      code: "DOB_INVALID",
      message: `Date of birth must be a real calendar date in yyyy-mm-dd form (got ${JSON.stringify(employee.dob)}).`,
    });
  }

  // `periodEnd` is compared as a raw string against the SKBBK phase window and
  // parsed for the age at period end. A malformed one either throws out of
  // `ageAt` or, when the employee has no DOB to parse, lands on the wrong side
  // of the window and changes the SKBBK deduction with nothing to show for it.
  if (!isIsoDate(inputs.periodEnd)) {
    issues.push({
      path: "periodEnd",
      code: "PERIOD_END_INVALID",
      message: `Period end must be a real calendar date in yyyy-mm-dd form (got ${JSON.stringify(inputs.periodEnd)}).`,
    });
  }

  if (
    employee.payBasis === "MONTHLY" &&
    (!Number.isFinite(inputs.workingDays) || inputs.workingDays < 1)
  ) {
    issues.push({
      path: "workingDays",
      code: "WORKING_DAYS_REQUIRED",
      message: `Working days in the wage period must be at least 1 for monthly-paid employees (got ${inputs.workingDays}).`,
    });
  }

  if (inputs.paidDays !== null && !isNonNegativeFinite(inputs.paidDays)) {
    issues.push({
      path: "paidDays",
      code: "PAID_DAYS_INVALID",
      message: `Days paid must be a number of 0 or more (got ${inputs.paidDays}).`,
    });
  }

  if (
    employee.payBasis === "HOURLY" &&
    inputs.hoursWorked !== null &&
    !isNonNegativeFinite(inputs.hoursWorked)
  ) {
    issues.push({
      path: "hoursWorked",
      code: "HOURS_WORKED_INVALID",
      message: `Hours worked must be a number of 0 or more (got ${inputs.hoursWorked}).`,
    });
  }

  return issues;
}
