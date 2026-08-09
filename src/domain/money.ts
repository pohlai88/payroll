/**
 * @feature pay-run
 * @layer domain
 *
 * Money utilities. All amounts are integer sen. No floats in stored values;
 * floats appear only transiently inside explicit rounding helpers.
 *
 * Contract: every sen value in and out of this module must be a safe integer.
 * Public functions assert this, so precision loss fails loudly rather than
 * silently producing a wrong ringgit.
 */

const THOUSANDS_SEPARATOR = /,/g;
const RM_PATTERN = /^([+-]?)(\d*)(?:\.(\d{0,2}))?$/;

function assertSen(value: number, what: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `${what}: expected a finite number, got ${value} (NaN and Infinity are not valid monetary amounts)`
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `${what}: expected a safe integer sen value, got ${value}`
    );
  }
}

/**
 * Round a (possibly fractional) sen value to whole sen, half **away from zero**
 * (2.5 → 3, -2.5 → -3). This is the accounting convention: the magnitude of a
 * deduction rounds the same way as the magnitude of a payment.
 */
export function roundHalfUpSen(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `roundHalfUpSen: expected a finite number, got ${value}`
    );
  }
  // Math.round on a non-negative operand is half-up and avoids the `+ 0.5`
  // epsilon trap (Math.floor(0.49999999999999994 + 0.5) === 1).
  const rounded = value < 0 ? -Math.round(-value) : Math.round(value);
  assertSen(rounded, "roundHalfUpSen");
  // Negating a rounded-to-zero magnitude yields -0, which compares equal to 0
  // everywhere except Object.is and Map keys — the places a stored sen value
  // eventually reaches. Settle it as 0.
  return rounded === 0 ? 0 : rounded;
}

/**
 * amount × numerator ÷ denominator, rounded half away from zero to whole sen.
 *
 * When numerator and denominator are both integers the arithmetic is exact
 * (BigInt, no float anywhere). Fractional numerators are supported — proration
 * passes half-days — and take a float path guarded by a safe-integer check on
 * the intermediate product.
 *
 * Throws if denominator is 0: a divide-by-zero proration is a caller bug, not
 * an RM 0.00 payment. Call sites that legitimately want zero must say so.
 */
export function mulDivSen(
  amountSen: number,
  numerator: number,
  denominator: number
): number {
  assertSen(amountSen, "mulDivSen(amountSen)");
  if (denominator === 0) {
    throw new RangeError("mulDivSen: denominator is 0");
  }
  if (!(Number.isFinite(numerator) && Number.isFinite(denominator))) {
    throw new RangeError(
      `mulDivSen: non-finite numerator/denominator (${numerator}/${denominator})`
    );
  }

  if (Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator)) {
    const p = BigInt(amountSen) * BigInt(numerator);
    const d = BigInt(denominator);
    // half away from zero: (2p ± d) / 2d, sign of the bias follows the quotient
    const negative = p < 0n !== d < 0n;
    const q = (2n * p + (negative ? -d : d)) / (2n * d);
    const result = Number(q);
    assertSen(result, "mulDivSen");
    return result;
  }

  const product = amountSen * numerator;
  assertSen(Math.trunc(product), "mulDivSen(intermediate product)");
  return roundHalfUpSen(product / denominator);
}

/**
 * Calculate quantity × rate in sen, with proper rounding.
 *
 * This replaces direct multiplication patterns like `Math.round(quantity * rateSen)`
 * which bypass the money module's contract and can introduce floating-point drift.
 *
 * @param quantity - The quantity (hours, days, units) - may be fractional
 * @param rateSen - The rate per unit in sen (must be a safe integer)
 * @returns The total amount in sen, rounded half away from zero
 */
export function quantityAmountSen(quantity: number, rateSen: number): number {
  if (!Number.isFinite(quantity)) {
    throw new RangeError(
      `quantityAmountSen: quantity must be finite, got ${quantity}`
    );
  }
  assertSen(rateSen, "quantityAmountSen(rateSen)");

  return roundHalfUpSen(quantity * rateSen);
}

/**
 * Percentage of a sen amount, rounded UP to the next whole ringgit (KWSP rule
 * for above-ceiling wages). Exact integer arithmetic: `Math.ceil` on a float
 * quotient amplifies epsilon into a whole extra ringgit at exact boundaries.
 *
 * `pct` must have at most 2 decimal places (statutory rates do). Negative
 * amounts are rejected — "round up" is ambiguous below zero and wages are never
 * negative here.
 */
export function pctRoundUpToRinggitSen(amountSen: number, pct: number): number {
  assertSen(amountSen, "pctRoundUpToRinggitSen(amountSen)");
  if (amountSen < 0) {
    throw new RangeError(
      `pctRoundUpToRinggitSen: amountSen must be >= 0, got ${amountSen}`
    );
  }
  if (!Number.isFinite(pct) || pct < 0) {
    throw new RangeError(
      `pctRoundUpToRinggitSen: pct must be finite and >= 0, got ${pct}`
    );
  }
  const pctBp = Math.round(pct * 100); // pct in basis points; exact for <= 2dp rates
  if (Math.abs(pct * 100 - pctBp) > 1e-6) {
    throw new RangeError(
      `pctRoundUpToRinggitSen: pct must have at most 2 decimals, got ${pct}`
    );
  }
  // amountSen × pct / 100 sen = amountSen × pctBp / 10_000 sen;
  // divide by a further 100 to reach ringgit → denominator 1_000_000.
  const num = BigInt(amountSen) * BigInt(pctBp);
  const den = 1_000_000n;
  const ringgit = (num + den - 1n) / den; // ceil, inputs are non-negative
  const result = Number(ringgit) * 100;
  assertSen(result, "pctRoundUpToRinggitSen");
  return result;
}

/**
 * Calculate percentage of a sen amount, rounded half away from zero.
 *
 * This is for standard percentage calculations (like HRDF levy) where the result
 * stays in sen, distinct from pctRoundUpToRinggitSen which rounds UP to ringgit.
 *
 * @param amountSen - Base amount in sen (must be a safe integer, >= 0)
 * @param pct - Percentage rate (e.g. 0.25 for 0.25%)
 * @returns The percentage amount in sen, rounded half away from zero
 */
export function pctHalfUpSen(amountSen: number, pct: number): number {
  assertSen(amountSen, "pctHalfUpSen(amountSen)");
  if (amountSen < 0) {
    throw new RangeError(
      `pctHalfUpSen: amountSen must be >= 0, got ${amountSen}`
    );
  }
  if (!Number.isFinite(pct) || pct < 0) {
    throw new RangeError(
      `pctHalfUpSen: pct must be finite and >= 0, got ${pct}`
    );
  }

  return roundHalfUpSen((amountSen * pct) / 100);
}

/**
 * Truncate a (possibly fractional) sen value toward zero to whole sen.
 *
 * LHDN MTD computerized spec: calculations are limited to two decimal points
 * and subsequent figures are omitted (e.g. 123.4534 → 123.45).
 */
export function truncateSen(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`truncateSen: expected a finite number, got ${value}`);
  }
  const truncated = value < 0 ? Math.ceil(value) : Math.floor(value);
  assertSen(truncated, "truncateSen");
  return truncated === 0 ? 0 : truncated;
}

/**
 * Integer division of a sen amount by a safe-integer divisor, truncating toward
 * zero. Used for K2 = (cap − accum) / n and MTD = annual / (n + 1).
 */
export function divTruncateSen(amountSen: number, divisor: number): number {
  assertSen(amountSen, "divTruncateSen(amountSen)");
  if (!Number.isSafeInteger(divisor) || divisor === 0) {
    throw new RangeError(
      `divTruncateSen: divisor must be a non-zero safe integer, got ${divisor}`
    );
  }
  const result = Number(BigInt(amountSen) / BigInt(divisor));
  assertSen(result, "divTruncateSen");
  return result === 0 ? 0 : result;
}

/**
 * `amountSen × pct / 100`, truncated toward zero to whole sen (LHDN 2dp omit).
 * `pct` must be an integer percentage (Table 1 rates are whole numbers).
 */
export function pctTruncateSen(amountSen: number, pct: number): number {
  assertSen(amountSen, "pctTruncateSen(amountSen)");
  if (!Number.isSafeInteger(pct)) {
    throw new RangeError(
      `pctTruncateSen: pct must be a safe integer percentage, got ${pct}`
    );
  }
  const result = Number((BigInt(amountSen) * BigInt(pct)) / 100n);
  assertSen(result, "pctTruncateSen");
  return result === 0 ? 0 : result;
}

/**
 * Round a non-negative sen amount **up** to the next multiple of 5 sen.
 *
 * LHDN MTD computerized spec: 1–4 sen → 5; 6–9 sen → 10
 * (e.g. 287.02 → 287.05, 152.06 → 152.10).
 */
export function roundUpToFiveSen(amountSen: number): number {
  assertSen(amountSen, "roundUpToFiveSen");
  if (amountSen < 0) {
    throw new RangeError(
      `roundUpToFiveSen: amountSen must be >= 0, got ${amountSen}`
    );
  }
  const rem = amountSen % 5;
  if (rem === 0) {
    return amountSen;
  }
  const result = amountSen + (5 - rem);
  assertSen(result, "roundUpToFiveSen");
  return result;
}

/**
 * Compute delta as basis points (delta / previous × 10 000), rounded to the
 * nearest integer. Returns null when previousSen is 0 (undefined ratio).
 *
 * Kept here so that all Math.round calls that settle a monetary ratio live
 * inside this module (MY-STAT-S02 boundary rule).
 */
export function roundBps(deltaSen: number, previousSen: number): number | null {
  return previousSen === 0
    ? null
    : Math.round((deltaSen / previousSen) * 10_000);
}

/** Format sen as "1,234.56" (no currency symbol). */
export function formatRM(sen: number): string {
  assertSen(sen, "formatRM");
  const sign = sen < 0 ? "-" : "";
  const abs = Math.abs(sen);
  const ringgit = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}${ringgit.toLocaleString("en-MY")}.${cents.toString().padStart(2, "0")}`;
}

/**
 * Parse "1,234.56" / "1234.5" / "" → sen. Returns null for blank/invalid.
 *
 * Parsed as a string, never through `Number()`: float multiplication drops a
 * sen on tie-adjacent input, and `Number()` would silently accept "0x10" (16),
 * "1e3" (1000) and "Infinity" as money. At most 2 decimals are accepted —
 * "1.234" is rejected rather than silently truncated to RM 1.23.
 *
 * Commas are stripped without position validation, so "1,2,3.45" parses; that
 * is deliberate paste-tolerance.
 */
export function parseRM(input: string): number | null {
  const t = input.replace(THOUSANDS_SEPARATOR, "").trim();
  const m = RM_PATTERN.exec(t);
  if (!m) {
    return null;
  }
  const [, signPart, digitPart, frac] = m;
  const digits = digitPart ?? "";
  if (digits === "" && (frac === undefined || frac === "")) {
    return null;
  }
  const sign = signPart === "-" ? -1 : 1;
  const ringgit = digits === "" ? 0 : Number.parseInt(digits, 10);
  const cents =
    frac === undefined || frac === ""
      ? 0
      : Number.parseInt(frac.padEnd(2, "0"), 10);
  const sen = sign * (ringgit * 100 + cents);
  return Number.isSafeInteger(sen) ? sen : null;
}
