import { ageAt } from "../ic";
import type { Classification, EmployeeSnapshot, RuleSettings } from "./types";

/**
 * Age-driven statutory classification, evaluated at the payroll period end.
 * EPF part: A (<60 citizen/PR), E (Malaysian 60+, employee share 0),
 * C (PR 60+ or pre-Aug-1998 non-citizen member 60+), F (post-1998 non-Malaysian).
 * SOCSO: FIRST (<60), SECOND (60+). EIS: 18 to <60; first-time 57+ needs review.
 */

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
    return age !== null && age >= retirementAge ? "E" : "A";
  }
  if (emp.isPermanentResident) {
    return age !== null && age >= retirementAge ? "C" : "A";
  }
  if (emp.epfMemberBeforeAug1998) {
    // non-Malaysian, non-PR
    return age !== null && age >= retirementAge ? "C" : "A";
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
  return age !== null && age >= retirementAge ? "SECOND" : "FIRST";
}

function resolveEis(
  emp: EmployeeSnapshot,
  age: number | null,
  settings: RuleSettings
): { eisEligible: boolean; eisAge57Review: boolean } {
  if (!emp.eisApplicable || age === null) {
    return { eisEligible: false, eisAge57Review: false };
  }

  let eisEligible =
    age >= settings.eisMinAge && age < settings.eisMaxAgeExclusive;
  let eisAge57Review = false;

  if (eisEligible && age >= settings.eisFirstTimeReviewAge) {
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
