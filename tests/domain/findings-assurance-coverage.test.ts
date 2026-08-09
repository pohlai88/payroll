/**
 * P0D — every catalog ruleId must appear in the tested-rule registry.
 * Fails CI when a catalog rule is added without registering assurance coverage.
 */

import { describe, expect, it } from "vitest";
import {
  PAYRUN_ANOMALY_RULES,
  TRANSFER_ANOMALY_RULES,
} from "@/domain/findings/catalog";

/**
 * Rules with dedicated positive/negative/boundary/evidence coverage under
 * tests/findings/ (or transfer suites). IDs must match the catalog exactly.
 */
const TESTED_PAYRUN_RULES = new Set([
  "NET_VARIANCE_VS_PRIOR",
  "NET_ZERO",
  "NET_NEGATIVE",
  "PCB_UNVERIFIED",
  "EIS_AGE_HISTORY_UNRESOLVED",
  "STATUTORY_STEP_SHIFT",
  "STATUTORY_ZERO_WITH_WAGES",
  "EMPLOYEE_OMITTED",
  "EMPLOYEE_IN_OVERLAPPING_RUNS",
  "OT_OUTLIER",
  "VARIABLE_ITEM_SPIKE",
  "NEW_EMPLOYEE",
  "MISSING_STATUTORY_NO",
  "BANK_DETAILS_MISSING",
  "BANK_DETAILS_CHANGED",
]);

const TESTED_TRANSFER_RULES = new Set([
  "TRANSFER_OVERLAP_DATES",
  "PERSON_IN_BOTH_EMPLOYERS",
  "TRANSFER_FINAL_PAY_MISSING",
  "TRANSFER_PRIOR_TAX_MISSING",
  "SERVICE_DATES_INCONSISTENT",
  "RECEIVING_REGISTRATION_INVALID",
]);

describe("findings catalog coverage registry", () => {
  it("lists only real pay-run catalog ruleIds", () => {
    const catalog = new Set(PAYRUN_ANOMALY_RULES.map((r) => r.ruleId));
    for (const id of TESTED_PAYRUN_RULES) {
      expect(catalog.has(id)).toBe(true);
    }
  });

  it("lists only real transfer catalog ruleIds", () => {
    const catalog = new Set(TRANSFER_ANOMALY_RULES.map((r) => r.ruleId));
    for (const id of TESTED_TRANSFER_RULES) {
      expect(catalog.has(id)).toBe(true);
    }
  });

  it("covers every pay-run anomaly rule", () => {
    expect([...TESTED_PAYRUN_RULES].sort()).toEqual(
      PAYRUN_ANOMALY_RULES.map((r) => r.ruleId).sort()
    );
  });

  it("covers every transfer anomaly rule", () => {
    expect([...TESTED_TRANSFER_RULES].sort()).toEqual(
      TRANSFER_ANOMALY_RULES.map((r) => r.ruleId).sort()
    );
  });
});
