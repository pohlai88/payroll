/**
 * @feature findings
 * @layer test
 */

import { describe, expect, it } from "vitest";
import { fingerprintOf } from "@/domain/findings/fingerprint";
import {
  collectTransferCommitFindings,
  detectPersonInBothEmployers,
  detectReceivingRegistrationInvalid,
  detectTransferFinalPayMissing,
  detectTransferPriorTaxMissing,
} from "@/domain/findings/transfer-rules";

describe("§8.6 transfer rule detectors", () => {
  it("TRANSFER_OVERLAP_DATES when A end >= B start", () => {
    const found = collectTransferCommitFindings({
      transferId: "t1",
      personId: "p1",
      fromEmploymentId: "a",
      toEmploymentId: "b",
      fromTerminationDate: "2026-09-01",
      toJoinDate: "2026-09-01",
      groupServiceContinuity: "CONTINUOUS",
      groupServiceDate: "2020-01-01",
      finalPayRunId: null,
      commencementRunId: null,
    });
    expect(found.map((f) => f.ruleId)).toContain("TRANSFER_OVERLAP_DATES");
  });

  it("SERVICE_DATES_INCONSISTENT on CONTINUOUS with postdated group date", () => {
    const found = collectTransferCommitFindings({
      transferId: "t1",
      personId: "p1",
      fromEmploymentId: "a",
      toEmploymentId: "b",
      fromTerminationDate: "2026-08-31",
      toJoinDate: "2026-09-01",
      groupServiceContinuity: "CONTINUOUS",
      groupServiceDate: "2026-10-01",
      finalPayRunId: null,
      commencementRunId: null,
    });
    expect(found.map((f) => f.ruleId)).toContain("SERVICE_DATES_INCONSISTENT");
  });

  it("PERSON_IN_BOTH_EMPLOYERS without explaining transfer", () => {
    const f = detectPersonInBothEmployers({
      runId: "R1",
      personId: "p1",
      companyIds: ["c1", "c2"],
      explainingTransferId: null,
    });
    expect(f?.ruleId).toBe("PERSON_IN_BOTH_EMPLOYERS");
  });

  it("TRANSFER_FINAL_PAY_MISSING on commencement run", () => {
    const f = detectTransferFinalPayMissing({
      runId: "B-START",
      transferId: "t1",
      commencementRunId: "B-START",
      hasFinalPayCoveringLastPeriod: false,
    });
    expect(f?.ruleId).toBe("TRANSFER_FINAL_PAY_MISSING");
  });

  it("TRANSFER_PRIOR_TAX_MISSING when PCB applicable and unverified", () => {
    const f = detectTransferPriorTaxMissing({
      runId: "R1",
      transferId: "t1",
      employmentId: "b",
      pcbApplicable: true,
      calendarYear: 2026,
      priorYtdVerified: false,
    });
    expect(f?.ruleId).toBe("TRANSFER_PRIOR_TAX_MISSING");
  });

  it("RECEIVING_REGISTRATION_INVALID when epfNo missing", () => {
    const f = detectReceivingRegistrationInvalid({
      runId: "R1",
      lineId: "l1",
      employmentId: "b",
      epfApplicable: true,
      socsoApplicable: false,
      eisApplicable: false,
      epfNo: null,
      socsoNo: null,
    });
    expect(f?.ruleId).toBe("RECEIVING_REGISTRATION_INVALID");
  });

  it("fingerprintOf is stable under key reorder", () => {
    expect(fingerprintOf({ b: 1, a: 2 })).toBe(fingerprintOf({ a: 2, b: 1 }));
  });
});
