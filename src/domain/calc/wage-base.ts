import type { PayItemDef, ResolvedLineItem } from "./types";

export interface WageBases {
  epfWagesSen: number;
  socsoWagesSen: number;
  eisWagesSen: number;
}

/**
 * Three separate statutory wage bases from the pay-item inclusion matrix.
 * Never "just gross": EPF excludes overtime but includes bonus; SOCSO/EIS
 * include overtime but exclude annual bonus.
 */
export function wageBases(
  earnings: readonly ResolvedLineItem[],
  matrix: ReadonlyMap<string, PayItemDef>
): WageBases {
  let epfWagesSen = 0;
  let socsoWagesSen = 0;
  let eisWagesSen = 0;
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
  }
  return { epfWagesSen, socsoWagesSen, eisWagesSen };
}
