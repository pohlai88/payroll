/**
 * Pure calculation engine types. The engine never touches the database —
 * band tables, settings and employee snapshots are passed in.
 */

export type EpfPart = "A" | "C" | "E" | "F" | "NONE";
export type SocsoCategory = "FIRST" | "SECOND" | "NONE";
export type PayBasis = "MONTHLY" | "DAILY" | "HOURLY";

export interface Band5 {
  fromSen: number;
  toSen: number;
  erSen: number;
  eeSen: number;
}

export interface SocsoBand {
  fromSen: number;
  toSen: number;
  cat1ErSen: number;
  cat1EeCoreSen: number;
  cat1EeSkbbkSen: number;
  cat2ErSen: number;
  cat2EeSkbbkSen: number;
}

export interface StatutoryTables {
  epf: Record<"A" | "C" | "E", Band5[]>;
  socso: SocsoBand[];
  eis: Band5[];
}

export interface RuleSettings {
  epfTableCeilingSen: number; // 2,000,000 (RM20,000)
  epfAboveEePct: number; // 11
  epfAboveErPctLeThreshold: number; // 13
  epfAboveErPctGtThreshold: number; // 12
  epfErThresholdSen: number; // 500,000 (RM5,000)
  epfPartCAboveEePct: number; // 5.5
  epfPartCAboveErPct: number; // 6
  epfPartEAboveEePct: number; // 0
  epfPartEAboveErPct: number; // 4
  epfPartFEePct: number; // 2
  epfPartFErPct: number; // 2
  socsoCeilingSen: number; // 600,000
  skbbkPhaseFrom: string; // 2026-06-01
  skbbkPhaseTo: string; // 2028-05-31
  eisCeilingSen: number; // 600,000
  eisMinAge: number; // 18
  eisMaxAgeExclusive: number; // 60
  eisFirstTimeReviewAge: number; // 57
  hrdfLevyPct: number; // 1
}

export interface EmployeeSnapshot {
  id: string;
  name: string;
  isMalaysian: boolean;
  isPermanentResident: boolean;
  dob: string | null; // ISO
  payBasis: PayBasis;
  baseRateSen: number; // monthly basic / daily rate / hourly rate
  epfApplicable: boolean;
  socsoApplicable: boolean;
  eisApplicable: boolean;
  pcbApplicable: boolean;
  epfMemberBeforeAug1998: boolean | null;
  eisPriorContribution: boolean | null;
  epfPartOverride: EpfPart | null;
  socsoCategoryOverride: SocsoCategory | null;
}

/**
 * How a pay item's amount is arrived at.
 *
 * This lives on the item, not in code. Meal used to be "days × rate" and
 * overtime "hours × rate" because the engine said so, which meant adding a
 * per-day allowance required a code change. Any item can now take any basis.
 */
export type RateBasis =
  | "FIXED_MONTHLY"
  | "PER_DAY"
  | "PER_HOUR"
  | "PER_UNIT"
  | "AMOUNT";

/** Bases whose amount is a quantity times a rate. */
export const QUANTITY_BASES = ["PER_DAY", "PER_HOUR", "PER_UNIT"] as const;
export type QuantityBasis = (typeof QUANTITY_BASES)[number];

export function isQuantityBasis(basis: RateBasis): basis is QuantityBasis {
  return (QUANTITY_BASES as readonly RateBasis[]).includes(basis);
}

export interface PayItemDef {
  code: string;
  kind: "EARNING" | "DEDUCTION";
  rateBasis: RateBasis;
  epfWages: boolean;
  socsoWages: boolean;
  eisWages: boolean;
  /** MONTHLY-basis pay is reduced by days paid; most allowances are not. */
  prorates?: boolean;
}

/**
 * One entered line item.
 *
 * A discriminated union rather than an optional `qty`/`rateSen` beside a
 * required `amountSen`: with all three present and independent, a stored amount
 * could disagree with the quantity and rate that supposedly produced it, and the
 * derivation would be describing arithmetic that never happened. Here a
 * quantity-based item carries no amount at all — the engine computes it.
 */
export type LineItemInput =
  | {
      payItemCode: string;
      basis: "AMOUNT" | "FIXED_MONTHLY";
      amountSen: number;
    }
  | {
      payItemCode: string;
      basis: QuantityBasis;
      qty: number;
      /** Defaulted from the employee's pay item record, editable for this run. */
      rateSen: number;
    };

/** A line item entered against a quantity basis: it carries `qty` and `rateSen`. */
export type QuantityLineItem = Extract<LineItemInput, { qty: number }>;

/**
 * Narrows an entry to its quantity-based variant.
 *
 * A guard over `item.basis` narrows the field, not the union that owns it, and
 * TypeScript will not eliminate a variant whose discriminant is itself a union
 * of literals from a chain of `||` comparisons. The guard therefore has to be
 * over the item.
 */
export function isQuantityItem(item: LineItemInput): item is QuantityLineItem {
  return isQuantityBasis(item.basis);
}

/** A line item after the engine has resolved its amount. */
export interface ResolvedLineItem {
  payItemCode: string;
  basis: RateBasis;
  qty: number | null;
  rateSen: number | null;
  amountSen: number;
  /** True for BASIC, which the engine derives from the employee's base rate. */
  computed: boolean;
}

export interface LineInputs {
  workingDays: number; // days in wage period
  paidDays: number | null; // MONTHLY proration + DAILY basis
  hoursWorked: number | null; // HOURLY basis
  /** Every earning and deduction other than BASIC, including overtime. */
  items: LineItemInput[];
  periodEnd: string; // ISO — drives age classification and SKBBK phase
}

export interface OverrideInput {
  field:
    | "EPF_EE"
    | "EPF_ER"
    | "SOCSO_EE_CORE"
    | "SOCSO_EE_SKBBK"
    | "SOCSO_ER"
    | "EIS_EE"
    | "EIS_ER"
    | "EPF_WAGES"
    | "SOCSO_WAGES"
    | "EIS_WAGES";
  overrideSen: number;
}

export interface PcbInput {
  // null = not entered (NEVER zero)
  pcbAmountSen: number | null;
  zakatOffsetSen: number;
  cp38Sen: number;
  verified: boolean;
}

export interface Classification {
  ageAtPeriodEnd: number | null;
  epfPart: EpfPart;
  socsoCategory: SocsoCategory;
  eisEligible: boolean;
  eisAge57Review: boolean;
}

export interface TraceStep {
  label: string;
  detail: string;
  amountSen?: number;
}

export interface LineResult {
  classification: Classification;
  items: ResolvedLineItem[];
  grossSen: number;
  epfWagesSen: number;
  socsoWagesSen: number;
  eisWagesSen: number;
  epfEeSen: number;
  epfErSen: number;
  socsoEeCoreSen: number;
  socsoEeSkbbkSen: number;
  socsoErSen: number;
  eisEeSen: number;
  eisErSen: number;
  pcbNetSen: number | null; // null when PCB not entered
  cp38Sen: number;
  zakatSen: number;
  otherDeductionsSen: number;
  deductionsTotalSen: number | null; // null when PCB applicable but missing
  netSen: number | null;
  hrdfLevySen: number;
  employerCostSen: number;
  trace: TraceStep[];
}
