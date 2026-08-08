/**
 * Rounding, explained without being reimplemented.
 *
 * The settled figure is ALWAYS whatever `money.ts` returns. The exact rational is
 * computed alongside it, for display only. There is exactly one implementation of
 * Malaysian rounding in this codebase and it is the one the golden master pins —
 * if these helpers ever disagreed with it, the sen figures would drift and the
 * whole rebuild would be worthless.
 */

import { mulDivSen, pctRoundUpToRinggitSen, roundHalfUpSen } from "../money";
import type { Exact } from "./value";

export interface Rounded {
  /** The value before rounding, held exactly. */
  readonly exact: Exact;
  /** The settled value, from money.ts. */
  readonly sen: number;
  /** How much the rounding moved it. Zero is common and still worth showing. */
  readonly deltaSen: number;
}

const exactValue = (e: Exact): number => e.num / e.den;

function rounded(exact: Exact, sen: number): Rounded {
  return { exact, sen, deltaSen: sen - exactValue(exact) };
}

/** Proration: amount × num / den, half up to the sen. */
export function explainMulDiv(amountSen: number, num: number, den: number): Rounded {
  const sen = mulDivSen(amountSen, num, den);
  const exact: Exact = den === 0 ? { num: 0, den: 1 } : { num: amountSen * num, den };
  return rounded(exact, sen);
}

/** The KWSP above-ceiling rule: a percentage of wages, rounded UP to the whole ringgit. */
export function explainPctCeilRinggit(amountSen: number, pct: number): Rounded {
  const sen = pctRoundUpToRinggitSen(amountSen, pct);
  return rounded({ num: amountSen * pct, den: 100 }, sen);
}

/** A percentage of an amount, half up to the sen. Used by the HRD Corp levy. */
export function explainPctHalfUp(amountSen: number, pct: number): Rounded {
  const raw = (amountSen * pct) / 100;
  return rounded({ num: amountSen * pct, den: 100 }, roundHalfUpSen(raw));
}

/** A bare product, half up to the sen. Used by meal allowance and overtime. */
export function explainMulHalfUp(amountSen: number, qty: number): Rounded {
  const raw = amountSen * qty;
  return rounded({ num: raw, den: 1 }, roundHalfUpSen(raw));
}

/** True when the exact value was already a whole number of sen. */
export function isExactlyWhole(e: Exact): boolean {
  return Number.isInteger(exactValue(e));
}
