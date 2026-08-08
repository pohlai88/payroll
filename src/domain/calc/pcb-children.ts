/**
 * Qualifying child units `C` for PCB compulsory relief (YA 2026).
 *
 * Spec EXHIBIT relief notes: a disabled child or higher-education child is
 * treated as multiple units of the RM2,000 child relief (e.g. disabled = 4 →
 * RM8,000; disabled + diploma/higher = 8 → RM16,000).
 */

export type PcbChildKind =
  | "STANDARD"
  | "HIGHER_ED"
  | "DISABLED"
  | "DISABLED_HIGHER_ED";

export interface PcbChildClaim {
  readonly kind: PcbChildKind;
  /** Number of children of this kind. */
  readonly count: number;
}

/** Units of RM2,000 relief per child kind (spec EXHIBIT 5 relief table). */
export function childUnitsForKind(kind: PcbChildKind): number {
  switch (kind) {
    case "STANDARD":
      return 1;
    case "HIGHER_ED":
      return 4;
    case "DISABLED":
      return 4;
    case "DISABLED_HIGHER_ED":
      return 8;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Total qualifying child units `C` for `QC = Q × C`. */
export function qualifyingChildUnits(claims: readonly PcbChildClaim[]): number {
  let total = 0;
  for (const claim of claims) {
    if (claim.count < 0 || !Number.isSafeInteger(claim.count)) {
      throw new RangeError(
        `qualifyingChildUnits: count must be a non-negative safe integer, got ${claim.count}`
      );
    }
    total += childUnitsForKind(claim.kind) * claim.count;
  }
  return total;
}
