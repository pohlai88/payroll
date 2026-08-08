/**
 * Money utilities. All amounts are integer sen. No floats in stored values;
 * floats appear only transiently inside explicit rounding helpers.
 */

/** Round a (possibly fractional) sen value half-up to whole sen. */
export function roundHalfUpSen(value: number): number {
  return Math.floor(value + 0.5);
}

/** amount × numerator ÷ denominator, rounded half-up to sen (2dp of RM). */
export function mulDivSen(amountSen: number, numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return roundHalfUpSen((amountSen * numerator) / denominator);
}

/** Percentage of a sen amount, rounded UP to the next whole ringgit (KWSP rule for above-ceiling wages). */
export function pctRoundUpToRinggitSen(amountSen: number, pct: number): number {
  const raw = (amountSen * pct) / 100; // in sen
  return Math.ceil(raw / 100) * 100;
}

/** Format sen as "1,234.56" (no currency symbol). */
export function formatRM(sen: number): string {
  const sign = sen < 0 ? "-" : "";
  const abs = Math.abs(sen);
  const ringgit = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}${ringgit.toLocaleString("en-MY")}.${cents.toString().padStart(2, "0")}`;
}

/** Parse "1,234.56" / "1234.5" / "" → sen. Returns null for blank/invalid. */
export function parseRM(input: string): number | null {
  const t = input.replace(/,/g, "").trim();
  if (t === "") return null;
  const v = Number(t);
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 100);
}
