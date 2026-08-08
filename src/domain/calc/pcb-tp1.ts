/**
 * TP1 / Form TP1 allowable deduction catalog (YA 2026).
 *
 * Callers accumulate claims into `∑LP` / `LP1`. This module caps each claim at
 * its per-code annual limit and, where the LHDN schedule defines a combined
 * envelope, at the group limit as well.
 *
 * Authority: P-SPEC-2026 relief schedules (items a–q / Form TP1 notes).
 */

export type Tp1ReliefGroup =
  | "EPF_LIFE_INSURANCE" // item h, combined RM7,000
  | "LIFESTYLE_CORE" // item l, combined RM2,500
  | "LIFESTYLE_SPORT" // item o, combined RM1,000
  | "LIFESTYLE_ECO"; // item p, combined RM2,500

export type Tp1ReliefCode =
  | "MEDICAL_PARENTS"
  | "BASIC_SUPPORTING_EQUIPMENT"
  | "HIGHER_EDUCATION_SELF"
  | "TOURIST_CULTURAL_FEES"
  | "SERIOUS_DISEASE_MEDICAL"
  | "COMPLETE_MEDICAL_EXAM"
  | "VACCINATION"
  | "LEARNING_DISABILITY"
  | "DENTAL"
  | "SSPN"
  | "ALIMONY"
  | "LIFE_INSURANCE_TAKAFUL"
  | "VOLUNTARY_EPF"
  | "PRS_DEFERRED_ANNUITY"
  | "EDUCATION_MEDICAL_INSURANCE"
  | "HOUSING_LOAN_INTEREST"
  | "HOUSING_LOAN_INTEREST_HIGH_VALUE_HOME"
  | "SPORT_EQUIPMENT"
  | "BOOKS"
  | "CHILDCARE_FEES"
  | "LIFESTYLE"
  | "INTERNET"
  | "GYM"
  | "SKILL_COURSE"
  | "PERSONAL_COMPUTER"
  | "CCTV"
  | "FOOD_WASTE_GRINDER"
  | "EV_CHARGING_FACILITY"
  | "SOCSO_CONTRIBUTION"
  | "BREASTFEEDING_EQUIPMENT"
  | "OTHER";

export interface Tp1CodeMeta {
  /** Per-code annual cap in sen. `null` means only a group (or no) cap binds. */
  readonly capSen: number | null;
  readonly group?: Tp1ReliefGroup;
}

/** Combined-envelope caps from P-SPEC-2026 items h / l / o / p. */
export const TP1_GROUP_CAP_SEN: Readonly<Record<Tp1ReliefGroup, number>> = {
  EPF_LIFE_INSURANCE: 700_000,
  LIFESTYLE_CORE: 250_000,
  LIFESTYLE_SPORT: 100_000,
  LIFESTYLE_ECO: 250_000,
};

/**
 * Catalog metadata. Source of truth for per-code and group membership.
 *
 * Housing loan interest: `HOUSING_LOAN_INTEREST` (≤ RM500k home, RM7,000) and
 * `HOUSING_LOAN_INTEREST_HIGH_VALUE_HOME` (RM500,001–750,000 home, RM5,000)
 * are mutually exclusive per loan — not additive. Caller selects the tier.
 */
export const TP1_CODE_META: Readonly<Record<Tp1ReliefCode, Tp1CodeMeta>> = {
  MEDICAL_PARENTS: { capSen: 800_000 },
  BASIC_SUPPORTING_EQUIPMENT: { capSen: 600_000 },
  HIGHER_EDUCATION_SELF: { capSen: 700_000 },
  TOURIST_CULTURAL_FEES: { capSen: 100_000 },
  SERIOUS_DISEASE_MEDICAL: { capSen: 1_000_000 },
  COMPLETE_MEDICAL_EXAM: { capSen: 100_000 },
  VACCINATION: { capSen: 100_000 },
  LEARNING_DISABILITY: { capSen: 1_000_000 },
  DENTAL: { capSen: 100_000 },
  SSPN: { capSen: 800_000 },
  ALIMONY: { capSen: 400_000 },
  LIFE_INSURANCE_TAKAFUL: {
    capSen: 300_000,
    group: "EPF_LIFE_INSURANCE",
  },
  VOLUNTARY_EPF: {
    capSen: 400_000,
    group: "EPF_LIFE_INSURANCE",
  },
  PRS_DEFERRED_ANNUITY: { capSen: 300_000 },
  EDUCATION_MEDICAL_INSURANCE: { capSen: 400_000 },
  HOUSING_LOAN_INTEREST: { capSen: 700_000 },
  HOUSING_LOAN_INTEREST_HIGH_VALUE_HOME: { capSen: 500_000 },
  CHILDCARE_FEES: { capSen: 300_000 },
  SOCSO_CONTRIBUTION: { capSen: 35_000 },
  BREASTFEEDING_EQUIPMENT: { capSen: 100_000 },
  // Item l — Lifestyle core: only the RM2,500 group cap binds.
  BOOKS: { capSen: null, group: "LIFESTYLE_CORE" },
  PERSONAL_COMPUTER: { capSen: null, group: "LIFESTYLE_CORE" },
  INTERNET: { capSen: null, group: "LIFESTYLE_CORE" },
  SKILL_COURSE: { capSen: null, group: "LIFESTYLE_CORE" },
  LIFESTYLE: { capSen: null, group: "LIFESTYLE_CORE" },
  // Item o — Additional lifestyle (sport): RM1,000 group.
  SPORT_EQUIPMENT: { capSen: null, group: "LIFESTYLE_SPORT" },
  GYM: { capSen: null, group: "LIFESTYLE_SPORT" },
  // Item p — EV / composting / CCTV: RM2,500 group.
  CCTV: { capSen: null, group: "LIFESTYLE_ECO" },
  FOOD_WASTE_GRINDER: { capSen: null, group: "LIFESTYLE_ECO" },
  EV_CHARGING_FACILITY: { capSen: null, group: "LIFESTYLE_ECO" },
  OTHER: { capSen: null },
};

/** Flat per-code cap view derived from {@link TP1_CODE_META}. */
export const TP1_ANNUAL_CAP_SEN: Readonly<
  Record<Tp1ReliefCode, number | null>
> = Object.fromEntries(
  (Object.keys(TP1_CODE_META) as Tp1ReliefCode[]).map((code) => [
    code,
    TP1_CODE_META[code].capSen,
  ])
) as Readonly<Record<Tp1ReliefCode, number | null>>;

export interface Tp1Claim {
  readonly code: Tp1ReliefCode;
  readonly amountSen: number;
}

/**
 * Sum claims, capping each at its per-code annual limit and (when applicable)
 * at its combined-envelope group limit. Overflow is discarded in claim order.
 */
export function sumTp1ClaimsSen(claims: readonly Tp1Claim[]): number {
  const usedByCode = new Map<Tp1ReliefCode, number>();
  const usedByGroup = new Map<Tp1ReliefGroup, number>();
  let total = 0;
  for (const claim of claims) {
    if (!Number.isSafeInteger(claim.amountSen) || claim.amountSen < 0) {
      throw new RangeError(
        `sumTp1ClaimsSen: amountSen must be a non-negative safe integer, got ${claim.amountSen}`
      );
    }
    const meta = TP1_CODE_META[claim.code];
    const alreadyCode = usedByCode.get(claim.code) ?? 0;
    const codeRoom =
      meta.capSen === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, meta.capSen - alreadyCode);
    const alreadyGroup = meta.group ? (usedByGroup.get(meta.group) ?? 0) : 0;
    const groupRoom = meta.group
      ? Math.max(0, TP1_GROUP_CAP_SEN[meta.group] - alreadyGroup)
      : Number.POSITIVE_INFINITY;
    const room = Math.min(codeRoom, groupRoom);
    const take = claim.amountSen < room ? claim.amountSen : room;
    usedByCode.set(claim.code, alreadyCode + take);
    if (meta.group) {
      usedByGroup.set(meta.group, alreadyGroup + take);
    }
    total += take;
  }
  return total;
}
