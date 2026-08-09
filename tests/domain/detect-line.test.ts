/**
 * Pure detector unit tests — P2 independently testable line findings.
 */

import { describe, expect, it } from "vitest";
import {
  NET_VARIANCE_ABS_SEN,
  OT_HOURS_OUTLIER,
  VARIABLE_ITEM_SPIKE_SEN,
} from "@/domain/findings/catalog";
import {
  detectBankDetailsMissing,
  detectEisAgeHistoryUnresolved,
  detectMissingStatutoryNo,
  detectNetNegative,
  detectNetVarianceVsPrior,
  detectNetZero,
  detectOtOutlier,
  detectPcbUnverified,
  detectStatutoryZeroWithWages,
  detectVariableItemSpike,
  type LineFindingInput,
} from "@/domain/findings/detect-line";

const RUN = "run-1";

function line(
  overrides: Partial<LineFindingInput> & {
    employeeSnapshot?: Record<string, unknown>;
  } = {}
): LineFindingInput {
  const { employeeSnapshot, ...rest } = overrides;
  return {
    lineId: "line-1",
    employmentId: "emp-1",
    netSen: 400_000,
    epfEeSen: 40_000,
    socsoEeCoreSen: 2000,
    socsoErSen: 3000,
    eisEeSen: 500,
    eisErSen: 500,
    epfWagesSen: 400_000,
    socsoWagesSen: 400_000,
    eisWagesSen: 400_000,
    employeeSnapshot: {
      pcbApplicable: false,
      epfApplicable: true,
      socsoApplicable: true,
      eisApplicable: false,
      baseRateSen: 400_000,
      dob: "1990-01-01",
      ...employeeSnapshot,
    },
    ...rest,
  };
}

describe("detectPcbUnverified", () => {
  it("fires when PCB applicable and entry missing", () => {
    const f = detectPcbUnverified(
      line({ employeeSnapshot: { pcbApplicable: true } }),
      undefined,
      RUN
    );
    expect(f?.ruleId).toBe("PCB_UNVERIFIED");
    expect(f?.evidence).toEqual({ pcbAmountSen: null, verified: false });
  });

  it("does not fire when PCB not applicable", () => {
    expect(detectPcbUnverified(line(), undefined, RUN)).toBeNull();
  });

  it("does not fire when verified", () => {
    expect(
      detectPcbUnverified(
        line({ employeeSnapshot: { pcbApplicable: true } }),
        { pcbAmountSen: 100, verified: true },
        RUN
      )
    ).toBeNull();
  });
});

describe("detectNetNegative / detectNetZero", () => {
  it("detects negative and zero nets", () => {
    expect(detectNetNegative(line({ netSen: -1 }), RUN)?.ruleId).toBe(
      "NET_NEGATIVE"
    );
    expect(detectNetZero(line({ netSen: 0 }), RUN)?.ruleId).toBe("NET_ZERO");
    expect(detectNetNegative(line({ netSen: 1 }), RUN)).toBeNull();
    expect(detectNetZero(line({ netSen: 1 }), RUN)).toBeNull();
  });
});

describe("detectNetVarianceVsPrior", () => {
  it("fires above abs and pct thresholds", () => {
    const baseline = {
      netSen: 100_000,
      epfEeSen: 10_000,
      socsoEeCoreSen: 1000,
      eisEeSen: 0,
    };
    const f = detectNetVarianceVsPrior(
      line({ netSen: 100_000 + NET_VARIANCE_ABS_SEN + 1 }),
      baseline,
      "prior-run",
      RUN
    );
    expect(f?.ruleId).toBe("NET_VARIANCE_VS_PRIOR");
    expect(f?.evidence).toMatchObject({
      baselineRunId: "prior-run",
      baselineNetSen: 100_000,
    });
  });

  it("does not fire for small variance", () => {
    expect(
      detectNetVarianceVsPrior(
        line({ netSen: 105_000 }),
        {
          netSen: 100_000,
          epfEeSen: 10_000,
          socsoEeCoreSen: 1000,
          eisEeSen: 0,
        },
        "prior-run",
        RUN
      )
    ).toBeNull();
  });
});

describe("detectStatutoryZeroWithWages", () => {
  it("uses scheme wages and skips employer-only SOCSO zero EE", () => {
    const f = detectStatutoryZeroWithWages(
      line({
        epfEeSen: 0,
        epfWagesSen: 400_000,
        socsoEeCoreSen: 0,
        socsoErSen: 3500,
        socsoWagesSen: 400_000,
        employeeSnapshot: {
          epfApplicable: true,
          socsoApplicable: true,
          eisApplicable: false,
          pcbApplicable: false,
        },
      }),
      RUN
    );
    expect(f?.evidence).toMatchObject({ schemes: ["epf"] });
    expect(f?.evidence.schemes as string[]).not.toContain("socso");
  });
});

describe("detectEisAgeHistoryUnresolved", () => {
  it("fires only when prior contribution is explicitly null", () => {
    const senior = line({
      employeeSnapshot: {
        eisApplicable: true,
        dob: "1965-01-01",
        pcbApplicable: false,
        epfApplicable: false,
        socsoApplicable: false,
      },
    });
    expect(
      detectEisAgeHistoryUnresolved(senior, null, "2026-07-31", RUN)?.ruleId
    ).toBe("EIS_AGE_HISTORY_UNRESOLVED");
    expect(
      detectEisAgeHistoryUnresolved(senior, undefined, "2026-07-31", RUN)
    ).toBeNull();
    expect(
      detectEisAgeHistoryUnresolved(senior, true, "2026-07-31", RUN)
    ).toBeNull();
  });
});

describe("detectOtOutlier / detectVariableItemSpike", () => {
  it("detects OT hours above threshold", () => {
    const f = detectOtOutlier(
      line(),
      {
        itemCodeSnap: "OT",
        quantity: String(OT_HOURS_OUTLIER + 1),
        resolvedAmountSen: 10_000,
      },
      RUN
    );
    expect(f?.ruleId).toBe("OT_OUTLIER");
  });

  it("detects variable spike above threshold", () => {
    const f = detectVariableItemSpike(
      line(),
      {
        itemCodeSnap: "BONUS",
        quantity: null,
        resolvedAmountSen: VARIABLE_ITEM_SPIKE_SEN + 1,
      },
      RUN
    );
    expect(f?.ruleId).toBe("VARIABLE_ITEM_SPIKE");
    expect(f?.evidence).toEqual({
      itemCode: "BONUS",
      amountSen: VARIABLE_ITEM_SPIKE_SEN + 1,
    });
  });
});

describe("detectMissingStatutoryNo / detectBankDetailsMissing", () => {
  it("reports missing EPF number when applicable", () => {
    const f = detectMissingStatutoryNo(
      line(),
      {
        epfNo: null,
        socsoNo: "S1",
        tin: null,
        bankName: "OCBC",
        bankAccountNo: "1",
        eisPriorContribution: null,
      },
      RUN
    );
    expect(f?.evidence).toEqual({ missing: ["epfNo"] });
  });

  it("detects blank bank details", () => {
    const f = detectBankDetailsMissing(
      line(),
      {
        epfNo: "E1",
        socsoNo: "S1",
        tin: null,
        bankName: "  ",
        bankAccountNo: "1",
        eisPriorContribution: null,
      },
      RUN
    );
    expect(f?.ruleId).toBe("BANK_DETAILS_MISSING");
  });
});
