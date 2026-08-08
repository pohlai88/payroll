/**
 * Normal Remuneration (+ non-resident 30%) PCB engine for YA 2026.
 */

import { divTruncateSen, pctTruncateSen } from "../money";
import {
  annualTaxTable1Sen,
  chargeableIncomePSen,
  finalizeMtdSen,
  monthYtSen,
  type PcbComputeResult,
} from "./pcb-core";
import type { PcbMonthContext, PcbTaxProfile } from "./types";

export type { PcbComputeResult } from "./pcb-core";
// biome-ignore lint/performance/noBarrelFile: re-exports pcb-core helpers so pcb.ts's public surface is one import, not a reach into pcb-core internals.
export {
  applyBelowRm10Rule,
  compulsoryReliefsSen,
  estimateK2Sen,
} from "./pcb-core";

export function computePcbNonResident(
  y1Sen: number,
  electDeductBelowRm10 = false,
  ytSen = 0
): PcbComputeResult {
  const raw = pctTruncateSen(y1Sen + ytSen, 30);
  return {
    mtdSen: finalizeMtdSen(raw, electDeductBelowRm10),
    pSen: null,
    k2Sen: null,
    path: "NON_RESIDENT",
  };
}

/**
 * Resident Normal Remuneration MTD (excludes current-month additional Yt).
 */
export function computePcbNormal(
  profile: PcbTaxProfile,
  month: PcbMonthContext
): PcbComputeResult {
  if (profile.residence === "NON_RESIDENT") {
    return computePcbNonResident(
      month.y1Sen,
      month.electDeductBelowRm10 ?? false,
      monthYtSen(month)
    );
  }

  const { pSen, k2Sen } = chargeableIncomePSen(profile, month, false);
  const annualTax = annualTaxTable1Sen(pSen, profile.category);
  if (annualTax === null) {
    return { mtdSen: 0, pSen, k2Sen, path: "NORMAL_RESIDENT" };
  }

  const afterPaid = annualTax - (month.zSen + month.xSen);
  if (afterPaid <= 0) {
    return { mtdSen: 0, pSen, k2Sen, path: "NORMAL_RESIDENT" };
  }

  const truncated = divTruncateSen(afterPaid, month.n + 1);
  return {
    mtdSen: finalizeMtdSen(truncated, month.electDeductBelowRm10 ?? false),
    pSen,
    k2Sen,
    path: "NORMAL_RESIDENT",
  };
}
