/**
 * PCB month-context builders: `n`, YTD merge, remuneration split from line items.
 */

import type {
  PayItemDef,
  PcbMonthContext,
  PcbRemunerationClass,
  PcbTaxProfile,
  ResolvedLineItem,
} from "./types";

/**
 * @deprecated Prefer `pcbRemunerationClass` on {@link PayItemDef}. Kept as the
 * default ADDITIONAL set when a matrix entry omits class.
 */
export const PCB_ADDITIONAL_ITEM_CODES: ReadonlySet<string> = new Set([
  "BONUS",
]);

export function pcbClassForItem(
  code: string,
  def?: Pick<PayItemDef, "kind" | "pcbRemunerationClass"> | null
): PcbRemunerationClass {
  if (def?.pcbRemunerationClass) {
    return def.pcbRemunerationClass;
  }
  if (def?.kind === "DEDUCTION") {
    return "EXCLUDED";
  }
  if (PCB_ADDITIONAL_ITEM_CODES.has(code)) {
    return "ADDITIONAL";
  }
  return "NORMAL";
}

/**
 * Months remaining after the calendar month of `periodEndIso` (YYYY-MM-DD).
 * January → 11, December → 0.
 */
export function monthsRemainingAfter(periodEndIso: string): number {
  const month = Number(periodEndIso.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(
      `monthsRemainingAfter: expected YYYY-MM-DD with month 01–12, got ${periodEndIso}`
    );
  }
  return 12 - month;
}

export interface PcbYtdAccumulators {
  readonly ySen: number;
  readonly kSen: number;
  readonly xSen: number;
  readonly zSen: number;
  readonly accumulatedLpSen: number;
}

export interface RemunerationSplit {
  readonly y1Sen: number;
  readonly ytSen: number;
}

/**
 * Split resolved earnings into normal (`Y1`) vs additional (`Yt`).
 * EXCLUDED and DEDUCTION lines are omitted. Matrix class wins over the
 * legacy BONUS code set.
 */
export function splitRemunerationSen(
  items: readonly ResolvedLineItem[],
  matrix?: ReadonlyMap<string, PayItemDef>
): RemunerationSplit {
  let y1Sen = 0;
  let ytSen = 0;
  for (const item of items) {
    const def = matrix?.get(item.payItemCode);
    if (def?.kind === "DEDUCTION") {
      continue;
    }
    const cls = pcbClassForItem(item.payItemCode, def);
    if (cls === "EXCLUDED") {
      continue;
    }
    if (cls === "ADDITIONAL") {
      ytSen += item.amountSen;
    } else {
      y1Sen += item.amountSen;
    }
  }
  return { y1Sen, ytSen };
}

export interface BuildMonthContextInput {
  readonly periodEndIso: string;
  readonly ytd: PcbYtdAccumulators;
  readonly y1Sen: number;
  readonly k1Sen: number;
  readonly ytSen?: number;
  readonly ktSen?: number;
  readonly lp1Sen?: number;
  /** Override estimated future remuneration; default Y1. */
  readonly y2Sen?: number;
  readonly electDeductBelowRm10?: boolean;
  /** Override `n`; default from period end. */
  readonly n?: number;
}

/** Assemble a complete {@link PcbMonthContext} from YTD + current-month figures. */
export function buildPcbMonthContext(
  input: BuildMonthContextInput
): PcbMonthContext {
  return {
    ySen: input.ytd.ySen,
    kSen: input.ytd.kSen,
    xSen: input.ytd.xSen,
    zSen: input.ytd.zSen,
    accumulatedLpSen: input.ytd.accumulatedLpSen,
    y1Sen: input.y1Sen,
    k1Sen: input.k1Sen,
    ytSen: input.ytSen ?? 0,
    ktSen: input.ktSen ?? 0,
    lp1Sen: input.lp1Sen ?? 0,
    y2Sen: input.y2Sen,
    n: input.n ?? monthsRemainingAfter(input.periodEndIso),
    electDeductBelowRm10: input.electDeductBelowRm10,
  };
}

export type { PcbTaxProfile };
