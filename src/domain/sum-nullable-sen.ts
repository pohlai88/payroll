/**
 * Sum nullable sen amounts without coercing unknown (`null`) to zero.
 * Callers surface `incomplete` when any contributor was missing.
 */
export function sumNullableSen(
  values: readonly (number | null | undefined)[]
): {
  readonly sum: number;
  readonly missing: number;
  readonly incomplete: boolean;
} {
  let sum = 0;
  let missing = 0;
  for (const v of values) {
    if (v == null) {
      missing += 1;
    } else {
      sum += v;
    }
  }
  return { sum, missing, incomplete: missing > 0 };
}
