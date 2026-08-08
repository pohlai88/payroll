/**
 * What proves a figure.
 *
 * Two identifiers, not one, because they have different lifetimes:
 *
 *   ruleId    what the system applied. Stable forever. Cross-pack diffing keys
 *             on this — "the EPF band rule" is the same rule in 2026 and 2031.
 *   sourceRef which document proves it, into `rule_pack_sources`. Changes when
 *             KWSP republishes the schedule at a new URL with a new hash.
 *
 * Nodes deliberately do NOT carry issuer/url/retrievedAt/sha256. The engine is
 * DB-free and stays that way, and duplicating a 64-character hash onto every
 * node would add tens of kilobytes per run of pure redundancy. `(rulePackId,
 * sourceRef)` is a foreign key resolved at render time; reproducibility comes
 * from the close manifest snapshotting the source rows verbatim, which is
 * strictly stronger because the manifest hash then covers them.
 */

import type { LabelRef } from "./label";

export type RuleId =
  | "MY.EPF.THIRD_SCHEDULE.BAND"
  | "MY.EPF.ABOVE_CEILING.PCT"
  | "MY.EPF.ABOVE_CEILING.ROUND_UP"
  | "MY.EPF.PART_E.EE_ZERO"
  | "MY.EPF.PART_F.FLAT_PCT"
  | "MY.EPF.NOT_APPLICABLE"
  | "MY.EPF.CLASSIFY.PART"
  | "MY.SOCSO.ACT4.BAND"
  | "MY.SOCSO.CLASSIFY.CATEGORY"
  | "MY.SOCSO.SKBBK.PHASE_WINDOW"
  | "MY.SOCSO.SKBBK.EMPLOYEE_BORNE"
  | "MY.SOCSO.NOT_APPLICABLE"
  | "MY.EIS.ACT800.BAND"
  | "MY.EIS.CLASSIFY.ELIGIBILITY"
  | "MY.EIS.AGE57.HISTORY_REVIEW"
  | "MY.EIS.NOT_APPLICABLE"
  | "MY.PCB.EXTERNAL_ONLY"
  | "MY.PCB.ZAKAT_OFFSET"
  | "MY.EA1955.S18A.PRORATION"
  | "MY.EA1955.REG9.WAGE_STATEMENT"
  | "MY.HRDF.LEVY"
  | "MY.WAGES.PAY_ITEM_MATRIX";

/**
 * Source references as published in the rule pack (`rule-pack-meta.json`):
 * S1 KWSP Third Schedule · S2 PERKESO Act 4 · S2A SKBBK · S3 EIS Act 800 ·
 * S4 LHDN PCB · S5 HRD Corp levy · L1 Employment Act 1955 · L2 EA 1955 wage statement.
 */
export type SourceRef = "S1" | "S2" | "S2A" | "S3" | "S4" | "S5" | "L1" | "L2";

export interface Clause {
  /** e.g. "Third Schedule, Part A" — rendered, so it is a label key not prose. */
  readonly label: LabelRef;
  /** e.g. "row 236" | "s.18A(1)" | "reg. 9" */
  readonly locator?: string;
  /** Deep link into the stored source snapshot, e.g. "#part-a". */
  readonly anchor?: string;
}

export interface Citation {
  readonly rulePackId: string;
  readonly sourceRef: SourceRef;
  readonly ruleId: RuleId;
  readonly clause?: Clause;
}

export const ALL_SOURCE_REFS: readonly SourceRef[] = [
  "S1",
  "S2",
  "S2A",
  "S3",
  "S4",
  "S5",
  "L1",
  "L2",
];
