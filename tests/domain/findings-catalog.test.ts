import { describe, expect, it } from "vitest";
import {
  ANOMALY_PACK_VERSION,
  ANOMALY_RULES,
  PAYRUN_ANOMALY_RULES,
  ruleDef,
  TRANSFER_ANOMALY_RULES,
} from "@/domain/findings/catalog";
import { fingerprintOf } from "@/domain/findings/fingerprint";

describe("anomaly catalog", () => {
  it("separates §4.3 pay-run rules from §8.6 transfer rules", () => {
    expect(ANOMALY_PACK_VERSION).toBe("MY-PAYROLL-ANOMALY-V1");
    expect(PAYRUN_ANOMALY_RULES).toHaveLength(15);
    expect(TRANSFER_ANOMALY_RULES.length).toBeGreaterThan(0);
    expect(ANOMALY_RULES).toHaveLength(
      PAYRUN_ANOMALY_RULES.length + TRANSFER_ANOMALY_RULES.length
    );
    expect(new Set(ANOMALY_RULES.map((r) => r.ruleId)).size).toBe(
      ANOMALY_RULES.length
    );
  });

  it("looks up rule metadata", () => {
    expect(ruleDef("NET_NEGATIVE").severity).toBe("BLOCKING");
    expect(ruleDef("BANK_DETAILS_MISSING").blocks).toContain("RELEASE");
    expect(ruleDef("NEW_EMPLOYEE").blocks).toEqual([]);
  });
});

describe("fingerprintOf", () => {
  it("is stable under key order", () => {
    const a = fingerprintOf({ netSen: 1, baseline: 2 });
    const b = fingerprintOf({ baseline: 2, netSen: 1 });
    expect(a).toBe(b);
  });

  it("changes when evidence changes", () => {
    expect(fingerprintOf({ netSen: 1 })).not.toBe(fingerprintOf({ netSen: 2 }));
  });
});
