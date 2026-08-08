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

export interface PayItemDef {
  code: string;
  kind: "EARNING" | "DEDUCTION";
  epfWages: boolean;
  socsoWages: boolean;
  eisWages: boolean;
}

export interface LineItemInput {
  payItemCode: string;
  qty?: number | null;
  rateSen?: number | null;
  amountSen: number;
}

export interface LineInputs {
  workingDays: number; // days in wage period
  paidDays: number | null; // MONTHLY proration + DAILY basis
  mealDays: number | null;
  hoursWorked: number | null; // HOURLY basis
  otHours: number;
  otRateSen: number;
  items: LineItemInput[]; // allowances, bonus, other earnings/deductions (excl BASIC & OT which are computed)
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
  items: Array<LineItemInput & { computed: boolean }>;
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
