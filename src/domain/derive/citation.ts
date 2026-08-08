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
 *
 * ---------------------------------------------------------------------------
 * COMPATIBILITY CONTRACT — these unions are a wire format, not just code.
 *
 * `RuleId` and `SourceRef` are serialized into run output and the close
 * manifest, so shipped members have historical instances in stored audit data.
 *
 *   ADDITIVE ONLY. A member may be added. A member may NEVER be renamed or
 *   removed — that orphans every stored citation that used it, and a rename
 *   passes typecheck silently because nothing in the codebase still refers to
 *   the old string. `tests/domain/citation.test.ts` snapshots both member lists
 *   so a rename fails CI loudly instead.
 *
 *   Prefer parameter-free ids. An id that bakes in a number ("AGE57") becomes a
 *   lie when the rule pack revises that number, and the pack is versioned
 *   precisely so numbers can change. The id names the concept; the value lives
 *   in the pack.
 *
 *   READING FOREIGN DATA: a build that reads a manifest written by a different
 *   build may meet an id it does not know (older pack, or a rollback past an
 *   addition). The decision for audit data is STRICT REJECT — a deserializer
 *   must validate against `ALL_RULE_IDS` / `ALL_SOURCE_REFS` and raise a clear
 *   error naming the unknown id. It must not silently drop the citation, and it
 *   must not `as RuleId` an unvalidated string. Reproducing a payslip with an
 *   unexplained figure is worse than refusing to reproduce it.
 * ---------------------------------------------------------------------------
 */

import type { LabelRef } from "./label";

/**
 * The single source of truth for rule ids. `RuleId` is derived from it, so the
 * union and the enumerable list cannot drift: adding a member here adds it to
 * the type, and anything iterating the list sees it immediately.
 */
export const ALL_RULE_IDS = [
  "MY.EPF.THIRD_SCHEDULE.BAND",
  "MY.EPF.ABOVE_CEILING.PCT",
  "MY.EPF.ABOVE_CEILING.ROUND_UP",
  "MY.EPF.PART_E.EE_ZERO",
  "MY.EPF.PART_F.FLAT_PCT",
  "MY.EPF.NOT_APPLICABLE",
  "MY.EPF.CLASSIFY.PART",
  "MY.SOCSO.ACT4.BAND",
  "MY.SOCSO.CLASSIFY.CATEGORY",
  "MY.SOCSO.SKBBK.PHASE_WINDOW",
  "MY.SOCSO.SKBBK.EMPLOYEE_BORNE",
  "MY.SOCSO.NOT_APPLICABLE",
  "MY.EIS.ACT800.BAND",
  "MY.EIS.CLASSIFY.ELIGIBILITY",
  "MY.EIS.FIRST_TIME_REVIEW.HISTORY_UNKNOWN",
  "MY.EIS.NOT_APPLICABLE",
  "MY.PCB.EXTERNAL_ONLY",
  "MY.PCB.ZAKAT_OFFSET",
  "MY.EA1955.S18A.PRORATION",
  "MY.EA1955.REG9.WAGE_STATEMENT",
  "MY.HRDF.LEVY",
  "MY.WAGES.PAY_ITEM_MATRIX",
] as const;

export type RuleId = (typeof ALL_RULE_IDS)[number];

/**
 * Source references as published in the rule pack (`rule-pack-meta.json`):
 * S1 KWSP Third Schedule · S2 PERKESO Act 4 · S2A SKBBK · S3 EIS Act 800 ·
 * S4 LHDN PCB · S5 HRD Corp levy · L1 Employment Act 1955 · L2 EA 1955 wage statement.
 *
 * Same derivation as `ALL_RULE_IDS`: the array is authoritative, the union
 * follows. Typing the array as `readonly SourceRef[]` instead would catch an
 * invalid member but not a missing one, so a newly added source could be
 * silently skipped by every loop over it.
 */
export const ALL_SOURCE_REFS = [
  "S1",
  "S2",
  "S2A",
  "S3",
  "S4",
  "S5",
  "L1",
  "L2",
] as const;

export type SourceRef = (typeof ALL_SOURCE_REFS)[number];

/**
 * Which source proves which rule. A `Record<RuleId, SourceRef>` is total by
 * construction, so a new rule id will not compile until its source is named.
 *
 * This closes the pairing gap: the `Citation` shape alone permits an EPF rule
 * citing the LHDN source. Citations are validated against this table rather
 * than deriving `sourceRef` from `ruleId` outright — dropping the field from
 * `Citation` would also shrink the node payload, but that is a change to the
 * emit path and its ~40 call sites, so it is deliberately left for later.
 */
export const RULE_SOURCE: Record<RuleId, SourceRef> = {
  "MY.EPF.THIRD_SCHEDULE.BAND": "S1",
  "MY.EPF.ABOVE_CEILING.PCT": "S1",
  "MY.EPF.ABOVE_CEILING.ROUND_UP": "S1",
  "MY.EPF.PART_E.EE_ZERO": "S1",
  "MY.EPF.PART_F.FLAT_PCT": "S1",
  "MY.EPF.NOT_APPLICABLE": "S1",
  "MY.EPF.CLASSIFY.PART": "S1",
  "MY.SOCSO.ACT4.BAND": "S2",
  "MY.SOCSO.CLASSIFY.CATEGORY": "S2",
  "MY.SOCSO.SKBBK.PHASE_WINDOW": "S2A",
  "MY.SOCSO.SKBBK.EMPLOYEE_BORNE": "S2A",
  "MY.SOCSO.NOT_APPLICABLE": "S2",
  "MY.EIS.ACT800.BAND": "S3",
  "MY.EIS.CLASSIFY.ELIGIBILITY": "S3",
  "MY.EIS.FIRST_TIME_REVIEW.HISTORY_UNKNOWN": "S3",
  "MY.EIS.NOT_APPLICABLE": "S3",
  "MY.PCB.EXTERNAL_ONLY": "S4",
  "MY.PCB.ZAKAT_OFFSET": "S4",
  "MY.EA1955.S18A.PRORATION": "L1",
  "MY.EA1955.REG9.WAGE_STATEMENT": "L2",
  "MY.HRDF.LEVY": "S5",
  // The pay-item matrix decides which earnings are EPF wages, so KWSP is what
  // proves it; there is no separate published matrix document.
  "MY.WAGES.PAY_ITEM_MATRIX": "S1",
};

export interface Clause {
  /**
   * e.g. "Third Schedule, Part A" — rendered, so it is a label key not prose.
   *
   * Optional because a locator alone is often the whole answer: "row 236" needs
   * no heading above it. An earlier version required this and call sites passed
   * an arbitrary key to satisfy the type, which put the wrong words next to
   * every citation — worse than no words.
   */
  readonly label?: LabelRef;
  /**
   * e.g. "row 236" | "s.18A(1)" | "reg. 9"
   *
   * DISPLAY-ONLY: never parsed, never compared between packs. Cross-pack
   * diffing keys on `ruleId`. If locators ever become an input to diffing,
   * they need a per-source grammar first — free text will have drifted into
   * "Row 236" / "row236" / "third schedule row 236" by then.
   */
  readonly locator?: string;
  /** Deep link into the stored source snapshot, e.g. "#part-a". */
  readonly anchor?: string;
}

export interface Citation {
  /**
   * All citations in one graph resolve against one pack — `assertCitationsResolve`
   * enforces equality with `graph.rulePackId`, so this field is currently
   * redundant per-node. It is kept until it is decided whether a period that
   * straddles a mid-year rule change may cite two packs in one run.
   */
  readonly rulePackId: string;
  readonly sourceRef: SourceRef;
  readonly ruleId: RuleId;
  readonly clause?: Clause;
}
