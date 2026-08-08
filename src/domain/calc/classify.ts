import { ageAt } from "../ic";
import type { Classification, EmployeeSnapshot, RuleSettings } from "./types";

/**
 * Age-driven statutory classification, evaluated at the payroll period end.
 * EPF part: A (<60 citizen/PR), E (Malaysian 60+, employee share 0),
 * C (PR 60+ or pre-Aug-1998 non-citizen member 60+), F (post-1998 non-Malaysian).
 * SOCSO: FIRST (<60), SECOND (60+). EIS: 18 to <60; first-time 57+ needs review.
 */
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

  let epfPart: Classification["epfPart"] = "NONE";
  if (emp.epfApplicable) {
    if (emp.epfPartOverride) {
      epfPart = emp.epfPartOverride;
    } else if (emp.isMalaysian) {
      epfPart = age !== null && age >= retirementAge ? "E" : "A";
    } else if (emp.isPermanentResident) {
      epfPart = age !== null && age >= retirementAge ? "C" : "A";
    } else if (emp.epfMemberBeforeAug1998) {
      // non-Malaysian, non-PR
      epfPart = age !== null && age >= retirementAge ? "C" : "A";
    } else {
      epfPart = "F";
    }
  }

  let socsoCategory: Classification["socsoCategory"] = "NONE";
  if (emp.socsoApplicable) {
    if (emp.socsoCategoryOverride) {
      socsoCategory = emp.socsoCategoryOverride;
    } else {
      socsoCategory = age !== null && age >= retirementAge ? "SECOND" : "FIRST";
    }
  }

  let eisEligible = false;
  let eisAge57Review = false;
  if (emp.eisApplicable && age !== null) {
    eisEligible =
      age >= settings.eisMinAge && age < settings.eisMaxAgeExclusive;
    if (
      eisEligible &&
      age >= settings.eisFirstTimeReviewAge &&
      emp.eisPriorContribution === false
    ) {
      // Age 57+ with confirmed NO prior contribution history: exempt.
      eisEligible = false;
    } else if (
      eisEligible &&
      age >= settings.eisFirstTimeReviewAge &&
      emp.eisPriorContribution === null
    ) {
      // Unknown history at 57+: keep contributing but flag for review.
      eisAge57Review = true;
    }
  }

  return {
    ageAtPeriodEnd: age,
    epfPart,
    socsoCategory,
    eisEligible,
    eisAge57Review,
  };
}
