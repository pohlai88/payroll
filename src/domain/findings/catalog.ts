/**
 * Anomaly rule pack — workspace §4.3 catalog (code-owned constants).
 */

import type { FindingSeverity, GateName } from "./types";

export const ANOMALY_PACK_VERSION = "MY-PAYROLL-ANOMALY-V1" as const;

export interface AnomalyRuleDef {
  readonly ruleId: string;
  readonly severity: FindingSeverity;
  readonly blocks: readonly GateName[];
  readonly title: string;
}

/** Thresholds named as constants (not settings UI). */
export const NET_VARIANCE_ABS_SEN = 30_000; // RM 300
export const NET_VARIANCE_PCT = 0.2;
export const OT_HOURS_OUTLIER = 72;
export const OT_PAY_VS_BASIC_RATIO = 0.5;
export const VARIABLE_ITEM_SPIKE_SEN = 200_000; // RM 2,000

/** Workspace §4.3 — scanned by Phase 6 `scanRunFindings`. */
export const PAYRUN_ANOMALY_RULES: readonly AnomalyRuleDef[] = [
  {
    ruleId: "NET_VARIANCE_VS_PRIOR",
    severity: "WARNING",
    blocks: ["APPROVAL"],
    title: "Net pay variance vs prior run",
  },
  {
    ruleId: "NET_ZERO",
    severity: "WARNING",
    blocks: ["APPROVAL"],
    title: "Zero net pay",
  },
  {
    ruleId: "NET_NEGATIVE",
    severity: "BLOCKING",
    blocks: ["APPROVAL"],
    title: "Negative net pay",
  },
  {
    ruleId: "PCB_UNVERIFIED",
    severity: "BLOCKING",
    blocks: ["APPROVAL"],
    title: "PCB unverified",
  },
  {
    ruleId: "EIS_AGE_HISTORY_UNRESOLVED",
    severity: "BLOCKING",
    blocks: ["APPROVAL"],
    title: "EIS age history unresolved",
  },
  {
    ruleId: "STATUTORY_STEP_SHIFT",
    severity: "REVIEW",
    blocks: ["APPROVAL"],
    title: "Statutory band step shift",
  },
  {
    ruleId: "STATUTORY_ZERO_WITH_WAGES",
    severity: "WARNING",
    blocks: ["APPROVAL"],
    title: "Statutory zero with wages",
  },
  {
    ruleId: "EMPLOYEE_OMITTED",
    severity: "WARNING",
    blocks: ["APPROVAL"],
    title: "Employee omitted from run",
  },
  {
    ruleId: "EMPLOYEE_IN_OVERLAPPING_RUNS",
    severity: "REVIEW",
    blocks: ["APPROVAL"],
    title: "Employee in overlapping runs",
  },
  {
    ruleId: "OT_OUTLIER",
    severity: "WARNING",
    blocks: ["APPROVAL"],
    title: "Overtime outlier",
  },
  {
    ruleId: "VARIABLE_ITEM_SPIKE",
    severity: "REVIEW",
    blocks: ["APPROVAL"],
    title: "Variable item spike",
  },
  {
    ruleId: "NEW_EMPLOYEE",
    severity: "INFO",
    blocks: [],
    title: "New employee",
  },
  {
    ruleId: "MISSING_STATUTORY_NO",
    severity: "REVIEW",
    blocks: ["APPROVAL"],
    title: "Missing statutory number",
  },
  {
    ruleId: "BANK_DETAILS_MISSING",
    severity: "BLOCKING",
    blocks: ["RELEASE"],
    title: "Bank details missing",
  },
  {
    ruleId: "BANK_DETAILS_CHANGED",
    severity: "REVIEW",
    blocks: ["RELEASE"],
    title: "Bank details changed",
  },
] as const;

/** §8.6 — emitted on transfer commit; not part of pay-run scan stamp. */
export const TRANSFER_ANOMALY_RULES: readonly AnomalyRuleDef[] = [
  {
    ruleId: "TRANSFER_OVERLAP_DATES",
    severity: "BLOCKING",
    blocks: ["APPROVAL"],
    title: "Transfer employment dates overlap",
  },
  {
    ruleId: "PERSON_IN_BOTH_EMPLOYERS",
    severity: "WARNING",
    blocks: ["APPROVAL"],
    title: "Person in two employers without transfer",
  },
  {
    ruleId: "TRANSFER_FINAL_PAY_MISSING",
    severity: "WARNING",
    blocks: ["APPROVAL"],
    title: "Transfer final pay missing",
  },
  {
    ruleId: "TRANSFER_PRIOR_TAX_MISSING",
    severity: "REVIEW",
    blocks: ["APPROVAL"],
    title: "Prior-employer tax YTD missing",
  },
  {
    ruleId: "SERVICE_DATES_INCONSISTENT",
    severity: "REVIEW",
    blocks: ["APPROVAL"],
    title: "Service dates inconsistent with transfer",
  },
  {
    ruleId: "RECEIVING_REGISTRATION_INVALID",
    severity: "REVIEW",
    blocks: ["APPROVAL"],
    title: "Receiving employment registration invalid",
  },
] as const;

export const ANOMALY_RULES: readonly AnomalyRuleDef[] = [
  ...PAYRUN_ANOMALY_RULES,
  ...TRANSFER_ANOMALY_RULES,
];

export function ruleDef(ruleId: string): AnomalyRuleDef {
  const found = ANOMALY_RULES.find((r) => r.ruleId === ruleId);
  if (found === undefined) {
    throw new Error(`unknown anomaly rule: ${ruleId}`);
  }
  return found;
}
