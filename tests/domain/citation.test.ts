import { describe, expect, it } from "vitest";
import {
  ALL_RULE_IDS,
  ALL_SOURCE_REFS,
  RULE_SOURCE,
  type RuleId,
} from "@/domain/derive/citation";

/**
 * `RuleId` and `SourceRef` are a wire format: they are serialized into stored
 * audit data and into the close manifest, so a shipped member has historical
 * instances in payslips that must stay explainable.
 *
 * A rename passes typecheck silently — nothing in the codebase refers to the old
 * string once it is gone — so these snapshots are the only thing that makes a
 * rename fail loudly. Adding a member is fine and expected; removing or renaming
 * one orphans stored citations. If a change here is deliberate, it needs a
 * migration for existing manifests, not just an updated snapshot.
 */

describe("Citation identifiers are an append-only wire format", () => {
  it("has not renamed or removed a rule id", () => {
    expect([...ALL_RULE_IDS]).toEqual([
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
      "MY.PCB.COMPUTERIZED",
      "MY.PCB.ZAKAT_OFFSET",
      "MY.EA1955.S18A.PRORATION",
      "MY.EA1955.REG9.WAGE_STATEMENT",
      "MY.HRDF.LEVY",
      "MY.WAGES.PAY_ITEM_MATRIX",
    ]);
  });

  it("has not renamed or removed a source reference", () => {
    expect([...ALL_SOURCE_REFS]).toEqual([
      "S1",
      "S2",
      "S2A",
      "S3",
      "S4",
      "S5",
      "L1",
      "L2",
    ]);
  });

  it("names a proving source for every rule", () => {
    for (const id of ALL_RULE_IDS) {
      expect(RULE_SOURCE[id], `${id} has no proving source`).toBeDefined();
      expect(ALL_SOURCE_REFS).toContain(RULE_SOURCE[id]);
    }
  });

  it("contains no duplicate ids", () => {
    expect(new Set(ALL_RULE_IDS).size).toBe(ALL_RULE_IDS.length);
    expect(new Set(ALL_SOURCE_REFS).size).toBe(ALL_SOURCE_REFS.length);
  });

  it("bakes no rule-pack values into the identifiers", () => {
    // An id like "AGE57" becomes a lie the moment the pack revises that number,
    // and the pack is versioned precisely so numbers can change.
    //
    // Digits are allowed only where they name a statute rather than a policy
    // value: Act 4, Act 800, EA 1955, s.18A, reg. 9 do not change when a rate or
    // an age threshold does.
    const STATUTE_NUMBERED = new Set<string>([
      "MY.SOCSO.ACT4.BAND",
      "MY.EIS.ACT800.BAND",
      "MY.EA1955.S18A.PRORATION",
      "MY.EA1955.REG9.WAGE_STATEMENT",
    ]);
    for (const id of ALL_RULE_IDS) {
      if (STATUTE_NUMBERED.has(id)) {
        continue;
      }
      expect(
        id,
        `${id} embeds a number that belongs in the rule pack`
      ).not.toMatch(/\d/);
    }
  });

  it("pairs each statutory family with its own issuer", () => {
    const familyOf = (id: RuleId): string => id.split(".")[1] ?? "";
    const expected: Record<string, string> = {
      EPF: "S1",
      SOCSO: "S2",
      EIS: "S3",
      PCB: "S4",
      HRDF: "S5",
    };
    for (const id of ALL_RULE_IDS) {
      const want = expected[familyOf(id)];
      if (want === undefined) {
        continue; // EA 1955 and the wage matrix are handled separately
      }
      // SKBBK is a PERKESO sub-scheme with its own published source.
      const got = RULE_SOURCE[id];
      const acceptable = id.includes("SKBBK") ? ["S2", "S2A"] : [want];
      expect(acceptable, `${id} is proved by ${got}`).toContain(got);
    }
  });
});
