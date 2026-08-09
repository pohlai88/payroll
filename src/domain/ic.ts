/**
 * @feature pay-run
 * @layer domain
 *
 * Malaysian NRIC utilities: derive date of birth from the first six digits
 * (YYMMDD) and compute age in completed years at a reference date.
 */

import { isRealDate, parseIsoDate } from "./date";

const NON_DIGITS = /\D/g;
const TWELVE_DIGITS = /^\d{12}$/;

/**
 * Derive date of birth (ISO yyyy-mm-dd) from a 12-digit NRIC, or null if the
 * input is not a well-formed NRIC with a real birth date.
 *
 * **Derive once, then store.** The century pivot (`yy > currentYY ? 19xx : 20xx`)
 * resolves an inherently ambiguous 2-digit year against *the date it runs*, so
 * the same IC yields a different birth year in different calendar years: IC
 * `30…` reads as 1930 in 2026 and as 2030 in 2031. Re-deriving in a recompute
 * job, migration, or back-dated report would shift a birth year by a century and
 * with it every age-banded statutory rate. So: this is an input-boundary
 * convenience for form autofill. The derived DOB becomes the stored source of
 * truth, and nothing downstream calls this again — the calc layer reads
 * `employee.dob`, never the IC.
 *
 * Assumes the person is under 100 at derivation time (true of any employee).
 * IC `25…` in 2026 reads as 2025, not 1925, so this is not valid for populations
 * that include centenarians (e.g. beneficiary or nominee records).
 *
 * Non-digits are stripped first, so `850312-08-1234` is accepted — the same
 * paste-tolerance rationale as `parseRM`'s comma handling.
 *
 * `today` is injectable so the derivation date is explicit and reproducible;
 * callers on the storage path should pass the timestamp they record alongside
 * the result rather than relying on the `new Date()` default.
 */
export function dobFromIc(ic: string, today: Date = new Date()): string | null {
  const digits = ic.replace(NON_DIGITS, "");
  // A Malaysian NRIC is exactly 12 digits. Accepting a shorter prefix would let
  // free text pasted into the wrong field yield six digits that happen to parse.
  if (!TWELVE_DIGITS.test(digits)) {
    return null;
  }
  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  const currentYY = today.getFullYear() % 100;
  // Tie (yy === currentYY) goes to the 2000s: born this year. Rejecting an
  // implausibly young age is the schema's job, not the pivot's.
  const century = yy > currentYY ? 1900 : 2000;
  const year = century + yy;
  if (!isRealDate(year, mm, dd)) {
    return null;
  }
  return `${year.toString().padStart(4, "0")}-${mm.toString().padStart(2, "0")}-${dd
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Age in completed years at `atDateIso` (both ISO yyyy-mm-dd strings).
 *
 * Throws on malformed or nonexistent dates. Returning `NaN` would be silently
 * catastrophic: every comparison against `NaN` is false, so a bad DOB would fall
 * through all the `age >= 60` / `age >= 55` branches in `classify` and quietly
 * select the younger employee's EPF/SOCSO/EIS rates.
 *
 * Feb 29 birthdays tick over on Mar 1 in non-leap years — someone born
 * 2000-02-29 is 59 on 2060-02-28 and 60 on 2060-03-01.
 */
export function ageAt(dobIso: string, atDateIso: string): number {
  const b = parseIsoDate(dobIso, "ageAt(dobIso)");
  const a = parseIsoDate(atDateIso, "ageAt(atDateIso)");
  let age = a.y - b.y;
  if (a.m < b.m || (a.m === b.m && a.d < b.d)) {
    age -= 1;
  }
  return age;
}
