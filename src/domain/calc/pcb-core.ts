/**
 * @feature pay-run
 * @layer domain
 *
 * Shared PCB computerized-calculation primitives (YA 2026).
 * Authority: LHDN MTD Computerized Calculation Spec 2026 (`P-SPEC-2026`).
 */

import { divTruncateSen, pctTruncateSen, roundUpToFiveSen } from "../money";
import {
  lookupTable1,
  PCB_EPF_ANNUAL_CAP_SEN,
  PCB_MIN_DEDUCT_SEN,
  PCB_RELIEFS_2026,
  table1B,
} from "./pcb-tables";
import type { PcbMonthContext, PcbTaxProfile } from "./types";

export type PcbComputePath =
  | "NORMAL_RESIDENT"
  | "NON_RESIDENT"
  | "ADDITIONAL"
  | "REP"
  | "KNOWLEDGE_WORKER"
  | "C_SUITE";

export interface PcbComputeResult {
  /** Gross MTD for the month before current-month zakat (sen). */
  mtdSen: number;
  /** Chargeable income P used for the primary path (sen); null for non-resident. */
  pSen: number | null;
  k2Sen: number | null;
  path: PcbComputePath;
  /** Step-1 normal MTD when path is ADDITIONAL. */
  normalMtdSen?: number;
  /** Step-4 additional MTD when path is ADDITIONAL. */
  additionalMtdSen?: number;
  /** Step-2 P including additional remuneration. */
  pWithAdditionalSen?: number;
}

/** First Table 1 band starts at RM5,001.00. */
export const PCB_TABLE1_FIRST_FROM_SEN = 500_100;

/** Flat 15% rebate threshold (RM35,000). */
export const PCB_FLAT15_REBATE_THRESHOLD_SEN = 3_500_000;

export function compulsoryReliefsSen(profile: PcbTaxProfile): number {
  const r = PCB_RELIEFS_2026;
  let total = r.individualSen;
  if (profile.category === 2) {
    total += r.spouseSen;
  }
  if (profile.disabledIndividual) {
    total += r.disabledIndividualSen;
  }
  if (profile.disabledSpouse) {
    total += r.disabledSpouseSen;
  }
  total += r.childSen * profile.qualifyingChildUnits;
  return total;
}

/**
 * K2 = min( (EPF_CAP − (K + K1 + Kt)) / n , K1 ), truncated to sen.
 * When n = 0 there are no remaining months — K2 is 0.
 */
export function estimateK2Sen(
  kSen: number,
  k1Sen: number,
  n: number,
  epfCapSen: number = PCB_EPF_ANNUAL_CAP_SEN,
  ktSen = 0
): number {
  if (n <= 0) {
    return 0;
  }
  const remaining = epfCapSen - (kSen + k1Sen + ktSen);
  if (remaining <= 0) {
    return 0;
  }
  const estimated = divTruncateSen(remaining, n);
  return estimated < k1Sen ? estimated : k1Sen;
}

export function applyBelowRm10Rule(
  mtdSen: number,
  electDeductBelowRm10: boolean
): number {
  if (mtdSen > 0 && mtdSen < PCB_MIN_DEDUCT_SEN && !electDeductBelowRm10) {
    return 0;
  }
  return mtdSen;
}

export function finalizeMtdSen(
  rawMtdSen: number,
  electDeductBelowRm10: boolean
): number {
  if (rawMtdSen <= 0) {
    return 0;
  }
  const rounded = roundUpToFiveSen(rawMtdSen);
  return applyBelowRm10Rule(rounded, electDeductBelowRm10);
}

export function monthYtSen(month: PcbMonthContext): number {
  return month.ytSen ?? 0;
}

export function monthKtSen(month: PcbMonthContext): number {
  return month.ktSen ?? 0;
}

/**
 * Chargeable income P.
 * When `includeAdditional` is false, Yt/Kt are excluded and K2 ignores Kt
 * (Additional Remuneration Step 1).
 */
export function chargeableIncomePSen(
  profile: PcbTaxProfile,
  month: PcbMonthContext,
  includeAdditional: boolean
): { pSen: number; k2Sen: number } {
  const yt = includeAdditional ? monthYtSen(month) : 0;
  const kt = includeAdditional ? monthKtSen(month) : 0;
  const k2Sen = estimateK2Sen(
    month.kSen,
    month.k1Sen,
    month.n,
    PCB_EPF_ANNUAL_CAP_SEN,
    kt
  );
  const y2Sen = month.y2Sen ?? month.y1Sen;
  const netPrior = month.ySen - month.kSen;
  const netCurrent = month.y1Sen - month.k1Sen;
  const netFuture = (y2Sen - k2Sen) * month.n;
  const netAdditional = yt - kt;
  const reliefs =
    compulsoryReliefsSen(profile) + month.accumulatedLpSen + month.lp1Sen;
  const pSen = netPrior + netCurrent + netFuture + netAdditional - reliefs;
  return { pSen, k2Sen };
}

/** Annual tax from Table 1: (P − M) × R/100 + B, truncated. */
export function annualTaxTable1Sen(
  pSen: number,
  category: 1 | 2 | 3
): number | null {
  if (pSen < PCB_TABLE1_FIRST_FROM_SEN) {
    return null;
  }
  const row = lookupTable1(pSen);
  if (row === null) {
    return null;
  }
  const bSen = table1B(row, category);
  const taxPortion = pctTruncateSen(pSen - row.mSen, row.rPct);
  return taxPortion + bSen;
}

/**
 * Rebate T for REP / Knowledge Worker.
 *
 * Verified against the primary source (`P-SPEC-2026`, `db/evidence/pcb-spec-2026.pdf`):
 * Table 2 (REP, p.15) and Table 3 (Knowledge Worker, p.16) are byte-for-byte
 * identical — both give R=15%, T=RM400 (category 1 & 3) / RM800 (category 2)
 * for P ≤ RM35,000, and T=0 above that. One shared function is therefore
 * correct, not a shortcut.
 */
export function flat15RebateTSen(pSen: number, category: 1 | 2 | 3): number {
  if (pSen > PCB_FLAT15_REBATE_THRESHOLD_SEN) {
    return 0;
  }
  return category === 2 ? 80_000 : 40_000;
}
