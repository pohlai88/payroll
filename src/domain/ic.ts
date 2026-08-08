/**
 * Malaysian NRIC utilities: derive date of birth from the first six digits
 * (YYMMDD) and compute age in completed years at a reference date.
 */

/** Century pivot: two-digit years greater than the current two-digit year are 19xx. */
export function dobFromIc(ic: string, today: Date = new Date()): string | null {
  const digits = ic.replace(/\D/g, "");
  if (digits.length < 6) return null;
  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const currentYY = today.getFullYear() % 100;
  const century = yy > currentYY ? 1900 : 2000;
  const year = century + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) {
    return null; // e.g. 31 Feb
  }
  return `${year.toString().padStart(4, "0")}-${mm.toString().padStart(2, "0")}-${dd
    .toString()
    .padStart(2, "0")}`;
}

/** Age in completed years at `atDate` (both ISO yyyy-mm-dd strings). */
export function ageAt(dobIso: string, atDateIso: string): number {
  const b = dobIso.split("-").map(Number);
  const a = atDateIso.split("-").map(Number);
  const by = b[0] ?? NaN;
  const bm = b[1] ?? NaN;
  const bd = b[2] ?? NaN;
  const ay = a[0] ?? NaN;
  const am = a[1] ?? NaN;
  const ad = a[2] ?? NaN;
  let age = ay - by;
  if (am < bm || (am === bm && ad < bd)) age--;
  return age;
}
