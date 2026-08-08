/**
 * Flat 15% PCB regimes: REP, Knowledge Worker (IRDA), and C-Suite.
 *
 * REP / KW: MTD = [(P×R − T) − (Z+X)] / (n+1) with Table 2/3 rebate T.
 * C-Suite: MTD = [(P×R) − (Z+X)] / (n+1) — no self/spouse rebate.
 */

import { divTruncateSen, pctTruncateSen } from "../money";
import {
  chargeableIncomePSen,
  finalizeMtdSen,
  flat15RebateTSen,
  monthYtSen,
  type PcbComputeResult,
} from "./pcb-core";
import { computePcbNonResident } from "./pcb-normal";
import type { PcbMonthContext, PcbTaxProfile } from "./types";

const FLAT_R_PCT = 15;

function computeFlat15(
  profile: PcbTaxProfile,
  month: PcbMonthContext,
  path: "REP" | "KNOWLEDGE_WORKER" | "C_SUITE",
  withRebate: boolean
): PcbComputeResult {
  if (profile.residence === "NON_RESIDENT") {
    return computePcbNonResident(
      month.y1Sen,
      month.electDeductBelowRm10 ?? false,
      monthYtSen(month)
    );
  }

  // Include current-month additional in P when present (spec variable Yt−Kt).
  const includeAdditional = monthYtSen(month) > 0 || (month.ktSen ?? 0) > 0;
  const { pSen, k2Sen } = chargeableIncomePSen(
    profile,
    month,
    includeAdditional
  );

  if (pSen <= 0) {
    return { mtdSen: 0, pSen, k2Sen, path };
  }

  const taxOnP = pctTruncateSen(pSen, FLAT_R_PCT);
  const tSen = withRebate ? flat15RebateTSen(pSen, profile.category) : 0;
  const afterRebate = taxOnP - tSen;
  const afterPaid = afterRebate - (month.zSen + month.xSen);
  if (afterPaid <= 0) {
    return { mtdSen: 0, pSen, k2Sen, path };
  }

  const truncated = divTruncateSen(afterPaid, month.n + 1);
  return {
    mtdSen: finalizeMtdSen(truncated, month.electDeductBelowRm10 ?? false),
    pSen,
    k2Sen,
    path,
  };
}

export function computePcbRep(
  profile: PcbTaxProfile,
  month: PcbMonthContext
): PcbComputeResult {
  return computeFlat15(profile, month, "REP", true);
}

export function computePcbKnowledgeWorker(
  profile: PcbTaxProfile,
  month: PcbMonthContext
): PcbComputeResult {
  return computeFlat15(profile, month, "KNOWLEDGE_WORKER", true);
}

export function computePcbCSuite(
  profile: PcbTaxProfile,
  month: PcbMonthContext
): PcbComputeResult {
  return computeFlat15(profile, month, "C_SUITE", false);
}
