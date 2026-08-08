/**
 * Additional Remuneration PCB (bonus, commission, director’s fees, etc.).
 *
 * Spec steps 1–5: normal MTD for the month + additional MTD = total payable.
 */

import {
  annualTaxTable1Sen,
  applyBelowRm10Rule,
  chargeableIncomePSen,
  finalizeMtdSen,
  monthKtSen,
  monthYtSen,
  type PcbComputeResult,
} from "./pcb-core";
import { computePcbNormal } from "./pcb-normal";
import type { PcbMonthContext, PcbTaxProfile } from "./types";

/**
 * Full Additional Remuneration MTD for the current month (gross, before
 * current-month zakat offset applied by `pcbNet`).
 */
export function computePcbAdditional(
  profile: PcbTaxProfile,
  month: PcbMonthContext
): PcbComputeResult {
  if (profile.residence === "NON_RESIDENT") {
    return computePcbNormal(profile, month);
  }

  const yt = monthYtSen(month);
  const kt = monthKtSen(month);
  if (yt <= 0 && kt <= 0) {
    return computePcbNormal(profile, month);
  }

  // Step 1 — normal MTD excluding current-month additional
  const step1 = computePcbNormal(profile, month);
  const normalMtdSen = step1.mtdSen;

  // Step 1[E] — projected annual MTD from current normal figure
  const totalMtdYearSen = month.xSen + normalMtdSen * (month.n + 1);

  // Step 2 — P including additional
  const withAdd = chargeableIncomePSen(profile, month, true);
  const annualTaxWithAdd = annualTaxTable1Sen(withAdd.pSen, profile.category);
  if (annualTaxWithAdd === null) {
    return {
      mtdSen: normalMtdSen,
      pSen: step1.pSen,
      k2Sen: step1.k2Sen,
      path: "ADDITIONAL",
      normalMtdSen,
      additionalMtdSen: 0,
      pWithAdditionalSen: withAdd.pSen,
    };
  }

  // Step 4 — additional MTD = annual tax − total MTD for year + Z paid
  let additionalRaw = annualTaxWithAdd - totalMtdYearSen + month.zSen;
  if (additionalRaw < 0) {
    additionalRaw = 0;
  }
  const additionalMtdSen = finalizeMtdSen(
    additionalRaw,
    month.electDeductBelowRm10 ?? false
  );

  // Step 5 — total payable before current-month zakat
  const mtdSen = applyBelowRm10Rule(
    normalMtdSen + additionalMtdSen,
    month.electDeductBelowRm10 ?? false
  );

  return {
    mtdSen,
    pSen: step1.pSen,
    k2Sen: step1.k2Sen,
    path: "ADDITIONAL",
    normalMtdSen,
    additionalMtdSen,
    pWithAdditionalSen: withAdd.pSen,
  };
}
