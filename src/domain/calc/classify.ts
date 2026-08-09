/**
 * @feature pay-run
 * @layer domain
 *
 * Pure statutory calc (no I/O).
 */

import { ageAt } from "../ic";
import type { Classification, EmployeeSnapshot, RuleSettings } from "./types";

/**
 * Age-driven statutory classification, evaluated at the payroll period end.
 * EPF part: A (<60 citizen/PR), E (Malaysian 60+, employee share 0),
 * C (PR 60+ or pre-Aug-1998 non-citizen member 60+), F (post-1998 non-Malaysian).
 * SOCSO: FIRST (<60), SECOND (60+). EIS: 18 to <60; first-time 57+ needs review.
 */

function requireAgeForBand(age: number | null, band: string): number {
  if (age === null) {
    throw new Error(
      `Date of birth is required to resolve ${band}; age at period end is missing.`
    );
  }
  return age;
}

function resolveEpfPart(
  emp: EmployeeSnapshot,
  age: number | null,
  retirementAge: number
): Classification["epfPart"] {
  if (!emp.epfApplicable) {
    return "NONE";
  }
  if (emp.epfPartOverride) {
    return emp.epfPartOverride;
  }
  if (emp.isMalaysian) {
    const years = requireAgeForBand(age, "EPF Part A/E");
    return years >= retirementAge ? "E" : "A";
  }
  if (emp.isPermanentResident) {
    const years = requireAgeForBand(age, "EPF Part A/C");
    return years >= retirementAge ? "C" : "A";
  }
  // Non-Malaysian, non-PR: Part F vs A/C depends on pre-Aug-1998 membership.
  // null means unknown — never collapse to F (that under-contributes vs A/C).
  if (emp.epfMemberBeforeAug1998 === null) {
    throw new Error(
      "EPF membership before August 1998 must be known (true or false) for non-Malaysian, non-PR employees; unknown is not Part F."
    );
  }
  if (emp.epfMemberBeforeAug1998) {
    const years = requireAgeForBand(age, "EPF Part A/C");
    return years >= retirementAge ? "C" : "A";
  }
  return "F";
}

function resolveSocsoCategory(
  emp: EmployeeSnapshot,
  age: number | null,
  retirementAge: number
): Classification["socsoCategory"] {
  if (!emp.socsoApplicable) {
    return "NONE";
  }
  if (emp.socsoCategoryOverride) {
    return emp.socsoCategoryOverride;
  }
  const years = requireAgeForBand(age, "SOCSO category");
  return years >= retirementAge ? "SECOND" : "FIRST";
}

function resolveEis(
  emp: EmployeeSnapshot,
  age: number | null,
  settings: RuleSettings
): { eisEligible: boolean; eisAge57Review: boolean } {
  if (!emp.eisApplicable) {
    return { eisEligible: false, eisAge57Review: false };
  }
  // EIS has no override: a missing age must not soft-zero eligibility (that
  // under-deducts). Wall should reject first; this is the tripwire.
  const years = requireAgeForBand(age, "EIS eligibility");

  let eisEligible =
    years >= settings.eisMinAge && years < settings.eisMaxAgeExclusive;
  let eisAge57Review = false;

  if (eisEligible && years >= settings.eisFirstTimeReviewAge) {
    if (emp.eisPriorContribution === false) {
      // Age 57+ with confirmed NO prior contribution history: exempt.
      eisEligible = false;
    } else if (emp.eisPriorContribution === null) {
      // Unknown history at 57+: keep contributing but flag for review.
      eisAge57Review = true;
    }
  }

  return { eisEligible, eisAge57Review };
}

export function classify(
  emp: EmployeeSnapshot,
  periodEnd: string,
  settings: RuleSettings
): Classification {
  // `=== null` rather than a falsy check: `dob: ""` is garbage that should have
  // been stopped at the wall, and routing it to `age = null` here would hide it
  // from `ageAt`'s throw and silently produce an under-60 classification. Only a
  // genuinely absent DOB yields a null age, and validation guarantees that only
  // happens when no age band applies.
  const age = emp.dob === null ? null : ageAt(emp.dob, periodEnd);
  const retirementAge = settings.epfSocsoRetirementAge;

  const epfPart = resolveEpfPart(emp, age, retirementAge);
  const socsoCategory = resolveSocsoCategory(emp, age, retirementAge);
  const { eisEligible, eisAge57Review } = resolveEis(emp, age, settings);

  return {
    ageAtPeriodEnd: age,
    epfPart,
    socsoCategory,
    eisEligible,
    eisAge57Review,
  };
}
