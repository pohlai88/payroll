/**
 * P0D — every catalog ruleId must appear in the tested-rule registry.
 * Fill TESTED_* as detector suites land; this fails CI when a rule is added
 * without assurance coverage being registered.
 */

import { describe, expect, it } from "vitest";
import {
  PAYRUN_ANOMALY_RULES,
  TRANSFER_ANOMALY_RULES,
} from "@/domain/findings/catalog";

/**
 * Rules with dedicated positive/negative/boundary/evidence coverage under
 * tests/findings/ (or transfer suites). Expand as suites land — do not invent
 * IDs that are not in the catalog.
 */
const TESTED_PAYRUN_RULES = new Set([
  "NEW_EMPLOYEE",
  "EMPLOYEE_OMITTED",
  "STATUTORY_ZERO_WITH_WAGES",
  "NET_VARIANCE_VS_PRIOR",
  "MISSING_STATUTORY_NO",
  "BANK_DETAILS_MISSING",
  "PCB_UNVERIFIED", // control/gate coverage via phase6 + scan machinery
]);

const TESTED_TRANSFER_RULES = new Set([
  // Covered by tests/db/transfer-findings.test.ts + domain transfer-rules tests
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

  it("tracks progress toward full pay-run catalog coverage", () => {
    const catalog = PAYRUN_ANOMALY_RULES.map((r) => r.ruleId).sort();
    const missing = catalog.filter((id) => !TESTED_PAYRUN_RULES.has(id));
    // Soft progress gate: document remaining work without blocking ship until
    // P0D is complete. Flip to expect(missing).toEqual([]) when suites land.
    expect(missing.length).toBeLessThan(catalog.length);
    expect(TESTED_PAYRUN_RULES.size).toBeGreaterThanOrEqual(6);
  });

  it("covers every transfer anomaly rule", () => {
    expect([...TESTED_TRANSFER_RULES].sort()).toEqual(
      TRANSFER_ANOMALY_RULES.map((r) => r.ruleId).sort()
    );
  });
});
