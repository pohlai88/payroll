import type { PayItemDef, ResolvedLineItem } from "./types";

export interface WageBases {
  epfWagesSen: number;
  socsoWagesSen: number;
  eisWagesSen: number;
  hrdWagesSen: number;
}

/**
 * Statutory wage bases from the pay-item inclusion matrix.
 * Never "just gross": EPF excludes overtime but includes bonus; SOCSO/EIS
 * include overtime but exclude annual bonus. HRD is its own scheme (S06);
 * at cutover it mirrors EPF.
 */
export function wageBases(
  earnings: readonly ResolvedLineItem[],
  matrix: ReadonlyMap<string, PayItemDef>
): WageBases {
  let epfWagesSen = 0;
  let socsoWagesSen = 0;
  let eisWagesSen = 0;
  let hrdWagesSen = 0;
  for (const item of earnings) {
    const def = matrix.get(item.payItemCode);
    if (def?.kind !== "EARNING") {
      continue;
    }
    if (def.epfWages) {
      epfWagesSen += item.amountSen;
    }
    if (def.socsoWages) {
      socsoWagesSen += item.amountSen;
    }
    if (def.eisWages) {
      eisWagesSen += item.amountSen;
    }
    const hrd = def.hrdWages ?? def.epfWages;
    if (hrd) {
      hrdWagesSen += item.amountSen;
    }
  }
  return { epfWagesSen, socsoWagesSen, eisWagesSen, hrdWagesSen };
}
