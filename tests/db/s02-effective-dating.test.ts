/**
 * @feature pay-run
 * @layer test
 *
 * S02 Effective Dating Tests
 *
 * These tests prove that statutory rules resolve using the relevant
 * payroll/statutory date, never using "latest" or today's date as fallback.
 * Historical payroll must continue using historical rules.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { RuleResolutionError, resolveRule } from "@/repo/rule-resolution";
import {
  ALL_TABLES,
  connectTestDatabase,
  expectRejected,
} from "./harness/database";

const database = connectTestDatabase();
const { db } = database;

const SCHEME = "STATUTORY_CALCULATION" as const;
const RULE_CODE = "MY-EPF-RATES";

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.truncate(...ALL_TABLES);
});

function insertRulePack(opts: {
  id: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: string;
  contentHash: string;
  supersededBy?: string | null;
}): Promise<unknown> {
  const everApproved = ["APPROVED", "EFFECTIVE", "SUPERSEDED"].includes(
    opts.status
  );
  const approvedBy = everApproved ? "statutory-authority" : null;
  const approvedAt = everApproved ? new Date("2024-01-01") : null;

  // Convert content hash to valid hex - create SHA256-like hex from input
  const hexHash = Array.from(opts.contentHash)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
    .padEnd(64, "0")
    .slice(0, 64);

  return db.execute(sql`
    INSERT INTO rule_packs
      (id, name, layer, code, version, effective_from, effective_to,
       content_hash, status, approved_by, approved_at, superseded_by)
    VALUES (
      ${opts.id}, ${opts.id}, ${SCHEME}::rule_pack_layer,
      ${RULE_CODE}, ${opts.version},
      ${opts.effectiveFrom}, ${opts.effectiveTo ?? null},
      ${hexHash}, ${opts.status}::rule_pack_status,
      ${approvedBy}, ${approvedAt}, ${opts.supersededBy ?? null})`);
}

describe("S02 Effective Dating: Historical Rule Resolution", () => {
  it("resolves historical dates to historical rules, never to latest", async () => {
    // Set up historical rule (2023) and current rule (2024)
    await insertRulePack({
      id: "MY-EPF-2023",
      version: "2023.1",
      effectiveFrom: "2023-01-01",
      effectiveTo: "2023-12-31",
      status: "SUPERSEDED",
      contentHash: "historical-rule-2023",
      supersededBy: "MY-EPF-2024",
    });

    await insertRulePack({
      id: "MY-EPF-2024",
      version: "2024.1",
      effectiveFrom: "2024-01-01",
      effectiveTo: "2024-12-31",
      status: "SUPERSEDED",
      contentHash: "rule-2024",
      supersededBy: "MY-EPF-2025",
    });

    await insertRulePack({
      id: "MY-EPF-2025",
      version: "2025.1",
      effectiveFrom: "2025-01-01",
      status: "APPROVED",
      contentHash: "current-rule-2025",
    });

    // Historical payroll date must resolve to historical rule
    const historical2023 = await resolveRule(db, {
      scheme: SCHEME,
      ruleCode: RULE_CODE,
      statutoryDate: "2023-06-15", // June 2023 payroll
    });
    expect(historical2023.rulePackId).toBe("MY-EPF-2023");
    expect(historical2023.status).toBe("SUPERSEDED");
    expect(historical2023.contentHash).toBeDefined();

    // 2024 payroll date must resolve to 2024 rule
    const historical2024 = await resolveRule(db, {
      scheme: SCHEME,
      ruleCode: RULE_CODE,
      statutoryDate: "2024-08-31", // August 2024 payroll
    });
    expect(historical2024.rulePackId).toBe("MY-EPF-2024");
    expect(historical2024.status).toBe("SUPERSEDED");
    expect(historical2024.contentHash).toBeDefined();

    // Current payroll date resolves to current rule
    const current2025 = await resolveRule(db, {
      scheme: SCHEME,
      ruleCode: RULE_CODE,
      statutoryDate: "2025-03-15", // March 2025 payroll
    });
    expect(current2025.rulePackId).toBe("MY-EPF-2025");
    expect(current2025.status).toBe("APPROVED");
    expect(current2025.contentHash).toBeDefined();
  });

  it("never uses today's date or 'latest' as implicit fallback", async () => {
    // Set up only a future rule
    await insertRulePack({
      id: "MY-EPF-FUTURE",
      version: "2027.1",
      effectiveFrom: "2027-01-01",
      status: "APPROVED",
      contentHash: "future-rule-2027",
    });

    // Historical date before any rule was effective must fail
    // It must NOT fall back to the "latest" or current rule
    await expect(
      resolveRule(db, {
        scheme: SCHEME,
        ruleCode: RULE_CODE,
        statutoryDate: "2026-06-15", // Before 2027 rule
      })
    ).rejects.toThrow(RuleResolutionError);

    // The error message should be explicit about no coverage
    await expect(
      resolveRule(db, {
        scheme: SCHEME,
        ruleCode: RULE_CODE,
        statutoryDate: "2026-06-15",
      })
    ).rejects.toThrow(/no rule pack covers/);
  });

  it("refuses to create overlapping approved rules (S03 exclusion)", async () => {
    // Conflicting approved rules for the same period cannot be stored —
    // MY-STAT-S03's EXCLUDE constraint is the non-silent failure mode.
    await insertRulePack({
      id: "MY-EPF-CONFLICT-A",
      version: "2024.1",
      effectiveFrom: "2024-01-01",
      effectiveTo: "2024-12-31",
      status: "APPROVED",
      contentHash: "conflicting-rule-a",
    });

    await expectRejected(
      insertRulePack({
        id: "MY-EPF-CONFLICT-B",
        version: "2024.2",
        effectiveFrom: "2024-01-01",
        effectiveTo: "2024-12-31",
        status: "APPROVED",
        contentHash: "conflicting-rule-b",
      }),
      /rule_packs_no_overlapping_approved_ranges|overlapping|exclude/i
    );
  });

  it("rejects invalid or malformed statutory dates", async () => {
    const invalidDates = [
      "2024-13-01", // Invalid month
      "2024-02-30", // Invalid day
      "24-06-15", // Wrong format
      "2024/06/15", // Wrong separator
      "latest", // String fallback
      "current", // Another fallback
      "", // Empty
    ];

    for (const invalidDate of invalidDates) {
      await expect(
        resolveRule(db, {
          scheme: SCHEME,
          ruleCode: RULE_CODE,
          statutoryDate: invalidDate,
        })
      ).rejects.toThrow(RuleResolutionError);
    }
  });

  it("ensures historical recalculation is unaffected by today's date", async () => {
    // This test simulates running historical payroll recalculation
    // The result must be identical regardless of when the recalculation runs

    await insertRulePack({
      id: "MY-EPF-HISTORICAL",
      version: "2020.1",
      effectiveFrom: "2020-01-01",
      effectiveTo: "2020-12-31",
      status: "SUPERSEDED",
      contentHash: "old-epf-rates-2020",
      supersededBy: "MY-EPF-2021",
    });

    await insertRulePack({
      id: "MY-EPF-2021",
      version: "2021.1",
      effectiveFrom: "2021-01-01",
      status: "APPROVED",
      contentHash: "current-epf-rates-2021",
    });

    // Historical payroll for March 2020 must always resolve to 2020 rule
    // regardless of whether we run this test in 2021, 2025, or 2030
    const historicalResolution = await resolveRule(db, {
      scheme: SCHEME,
      ruleCode: RULE_CODE,
      statutoryDate: "2020-03-31",
    });

    expect(historicalResolution.rulePackId).toBe("MY-EPF-HISTORICAL");
    expect(historicalResolution.status).toBe("SUPERSEDED");
    expect(historicalResolution.effectiveFrom).toBe("2020-01-01");
    expect(historicalResolution.effectiveTo).toBe("2020-12-31");
    expect(historicalResolution.contentHash).toBeDefined();

    // The resolution must be completely deterministic
    // Running it multiple times must yield identical results
    const secondResolution = await resolveRule(db, {
      scheme: SCHEME,
      ruleCode: RULE_CODE,
      statutoryDate: "2020-03-31",
    });

    expect(secondResolution).toEqual(historicalResolution);
  });

  it("handles rule transitions correctly at boundary dates", async () => {
    await insertRulePack({
      id: "MY-EPF-OLD",
      version: "1.0",
      effectiveFrom: "2023-01-01",
      effectiveTo: "2023-06-30", // Ends June 30
      status: "SUPERSEDED",
      contentHash: "old-rates",
      supersededBy: "MY-EPF-NEW",
    });

    await insertRulePack({
      id: "MY-EPF-NEW",
      version: "2.0",
      effectiveFrom: "2023-07-01", // Starts July 1
      status: "APPROVED",
      contentHash: "new-rates",
    });

    // Last day of old rule
    const lastDayOld = await resolveRule(db, {
      scheme: SCHEME,
      ruleCode: RULE_CODE,
      statutoryDate: "2023-06-30",
    });
    expect(lastDayOld.rulePackId).toBe("MY-EPF-OLD");

    // First day of new rule
    const firstDayNew = await resolveRule(db, {
      scheme: SCHEME,
      ruleCode: RULE_CODE,
      statutoryDate: "2023-07-01",
    });
    expect(firstDayNew.rulePackId).toBe("MY-EPF-NEW");
  });
});

describe("S02 Effective Dating: ISO Date Validation", () => {
  it("requires real calendar dates in ISO format", async () => {
    await insertRulePack({
      id: "MY-EPF-TEST",
      version: "1.0",
      effectiveFrom: "2024-01-01",
      status: "APPROVED",
      contentHash: "test-rule",
    });

    // Valid dates should work
    const validDates = [
      "2024-01-01",
      "2024-02-29", // Leap year
      "2024-12-31",
    ];

    for (const validDate of validDates) {
      const resolution = await resolveRule(db, {
        scheme: SCHEME,
        ruleCode: RULE_CODE,
        statutoryDate: validDate,
      });
      expect(resolution.rulePackId).toBe("MY-EPF-TEST");
    }

    // Invalid dates should be rejected
    const invalidDates = [
      "2023-02-29", // Not a leap year
      "2024-04-31", // April has 30 days
      "2024-00-01", // Month 0
      "2024-01-00", // Day 0
    ];

    for (const invalidDate of invalidDates) {
      await expect(
        resolveRule(db, {
          scheme: SCHEME,
          ruleCode: RULE_CODE,
          statutoryDate: invalidDate,
        })
      ).rejects.toThrow(/real ISO/);
    }
  });
});
