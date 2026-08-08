/**
 * `resolveRule` turns `(scheme, ruleCode, statutoryDate)` into exactly one
 * approved rule pack, or refuses. These tests provoke every way that can go
 * wrong — nothing found, only unapproved content found, more than one
 * approved candidate found — and prove the historical case the whole model
 * exists for: a date inside a superseded pack's effective range still
 * resolves to that pack, not to whatever replaced it.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { RuleResolutionError, resolveRule } from "@/repo/rule-resolution";
import { ALL_TABLES, connectTestDatabase } from "./harness/database";

const database = connectTestDatabase();
const { db } = database;

const SCHEME = "STATUTORY_CALCULATION" as const;
const RULE_CODE = "MY-TEST-SCHEME";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.truncate(...ALL_TABLES);
});

function insertPack(opts: {
  id: string;
  code?: string;
  layer?: string;
  version?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: string;
  contentHash?: string | null;
  supersededBy?: string | null;
}): Promise<unknown> {
  const everApproved = ["APPROVED", "EFFECTIVE", "SUPERSEDED"].includes(
    opts.status
  );
  const approvedBy = everApproved ? "test-fixture" : null;
  const approvedAt = everApproved ? new Date() : null;

  return db.execute(sql`
    INSERT INTO rule_packs
      (id, name, layer, code, version, effective_from, effective_to,
       content_hash, status, approved_by, approved_at, superseded_by)
    VALUES (
      ${opts.id}, ${opts.id}, ${(opts.layer ?? SCHEME) as string}::rule_pack_layer,
      ${opts.code ?? RULE_CODE}, ${opts.version ?? "1"},
      ${opts.effectiveFrom}, ${opts.effectiveTo ?? null},
      ${opts.contentHash ?? null}, ${opts.status}::rule_pack_status,
      ${approvedBy}, ${approvedAt}, ${opts.supersededBy ?? null})`);
}

describe("resolveRule: the happy path", () => {
  it("resolves the single approved pack in force for scheme + ruleCode + date", async () => {
    await insertPack({
      id: "MY-TEST-SCHEME-2026",
      effectiveFrom: "2026-01-01",
      status: "APPROVED",
      contentHash: HASH_A,
    });

    const resolved = await resolveRule(db, {
      scheme: SCHEME,
      ruleCode: RULE_CODE,
      statutoryDate: "2026-07-31",
    });

    expect(resolved.rulePackId).toBe("MY-TEST-SCHEME-2026");
    expect(resolved.status).toBe("APPROVED");
    expect(resolved.contentHash).toBe(HASH_A);
  });

  it("also resolves an EFFECTIVE pack", async () => {
    await insertPack({
      id: "MY-TEST-SCHEME-EFF",
      effectiveFrom: "2026-01-01",
      status: "EFFECTIVE",
      contentHash: HASH_A,
    });

    const resolved = await resolveRule(db, {
      scheme: SCHEME,
      ruleCode: RULE_CODE,
      statutoryDate: "2026-07-31",
    });
    expect(resolved.rulePackId).toBe("MY-TEST-SCHEME-EFF");
  });
});

describe("resolveRule: statutory dates must be valid", () => {
  it("refuses a malformed date before ever touching the database", async () => {
    await expect(
      resolveRule(db, {
        scheme: SCHEME,
        ruleCode: RULE_CODE,
        statutoryDate: "31-07-2026",
      })
    ).rejects.toThrow(RuleResolutionError);
  });

  it("refuses a date that is not a real calendar day", async () => {
    await expect(
      resolveRule(db, {
        scheme: SCHEME,
        ruleCode: RULE_CODE,
        statutoryDate: "2026-02-30",
      })
    ).rejects.toThrow(/real ISO/);
  });
});

describe("resolveRule: fails on no rule", () => {
  it("refuses when nothing exists for the scheme and rule code at all", async () => {
    await expect(
      resolveRule(db, {
        scheme: SCHEME,
        ruleCode: "NO-SUCH-RULE",
        statutoryDate: "2026-07-31",
      })
    ).rejects.toThrow(/no rule pack covers/);
  });

  it("refuses when the date falls outside every pack's effective range", async () => {
    await insertPack({
      id: "MY-TEST-SCHEME-2026",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-05-31",
      status: "APPROVED",
      contentHash: HASH_A,
    });

    await expect(
      resolveRule(db, {
        scheme: SCHEME,
        ruleCode: RULE_CODE,
        statutoryDate: "2026-07-01",
      })
    ).rejects.toThrow(/no rule pack covers/);
  });

  it("does not match a pack under a different scheme with the same rule code", async () => {
    await insertPack({
      id: "MY-TEST-SCHEME-LAW",
      layer: "EMPLOYMENT_LAW",
      effectiveFrom: "2026-01-01",
      status: "APPROVED",
      contentHash: HASH_A,
    });

    await expect(
      resolveRule(db, {
        scheme: SCHEME,
        ruleCode: RULE_CODE,
        statutoryDate: "2026-07-31",
      })
    ).rejects.toThrow(/no rule pack covers/);
  });
});

describe("resolveRule: fails on an unapproved rule", () => {
  it("refuses when only a DRAFT pack covers the date", async () => {
    await insertPack({
      id: "MY-TEST-SCHEME-DRAFT",
      effectiveFrom: "2026-01-01",
      status: "DRAFT",
    });

    await expect(
      resolveRule(db, {
        scheme: SCHEME,
        ruleCode: RULE_CODE,
        statutoryDate: "2026-07-31",
      })
    ).rejects.toThrow(/none has ever been approved/);
  });

  it("refuses when only a VERIFIED pack covers the date", async () => {
    await insertPack({
      id: "MY-TEST-SCHEME-VERIFIED",
      effectiveFrom: "2026-01-01",
      status: "VERIFIED",
    });

    await expect(
      resolveRule(db, {
        scheme: SCHEME,
        ruleCode: RULE_CODE,
        statutoryDate: "2026-07-31",
      })
    ).rejects.toThrow(RuleResolutionError);
  });

  it("never falls back to a DRAFT pack when no approved pack exists, even if it is the only candidate", async () => {
    await insertPack({
      id: "MY-TEST-SCHEME-ONLY-DRAFT",
      effectiveFrom: "2020-01-01",
      status: "DRAFT",
    });

    const failure = await resolveRule(db, {
      scheme: SCHEME,
      ruleCode: RULE_CODE,
      statutoryDate: "2026-07-31",
    }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(RuleResolutionError);
  });
});

describe("resolveRule: overlapping approved rules cannot resolve silently", () => {
  it("refuses when two approved packs both cover the date", async () => {
    await insertPack({
      id: "MY-TEST-SCHEME-A",
      version: "2026.1",
      effectiveFrom: "2026-01-01",
      status: "APPROVED",
      contentHash: HASH_A,
    });
    await insertPack({
      id: "MY-TEST-SCHEME-B",
      version: "2026.2",
      effectiveFrom: "2026-01-01",
      status: "APPROVED",
      contentHash: HASH_B,
    });

    const failure: unknown = await resolveRule(db, {
      scheme: SCHEME,
      ruleCode: RULE_CODE,
      statutoryDate: "2026-07-31",
    }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(RuleResolutionError);
    expect((failure as Error).message).toMatch(/ambiguous resolution/);
    // Names both conflicting packs — an operator must not have to go hunting.
    expect((failure as Error).message).toMatch(/MY-TEST-SCHEME-A/);
    expect((failure as Error).message).toMatch(/MY-TEST-SCHEME-B/);
  });

  it("never silently prefers the most recently created row when ambiguous", async () => {
    await insertPack({
      id: "MY-TEST-SCHEME-OLDER",
      version: "2026.1",
      effectiveFrom: "2026-01-01",
      status: "APPROVED",
      contentHash: HASH_A,
    });
    await insertPack({
      id: "MY-TEST-SCHEME-NEWER",
      version: "2026.2",
      effectiveFrom: "2026-01-01",
      status: "APPROVED",
      contentHash: HASH_B,
    });

    // A "latest" fallback would return MY-TEST-SCHEME-NEWER. The resolver must
    // throw instead of returning anything at all.
    await expect(
      resolveRule(db, {
        scheme: SCHEME,
        ruleCode: RULE_CODE,
        statutoryDate: "2026-07-31",
      })
    ).rejects.toThrow(RuleResolutionError);
  });
});

describe("resolveRule: historical dates resolve historical rules", () => {
  it("resolves the superseded pack for a date inside its own effective range, and the current one for today", async () => {
    await insertPack({
      id: "MY-TEST-SCHEME-2025",
      version: "2025.1",
      effectiveFrom: "2025-01-01",
      effectiveTo: "2025-12-31",
      status: "SUPERSEDED",
      contentHash: HASH_A,
      supersededBy: "MY-TEST-SCHEME-2026",
    });
    await insertPack({
      id: "MY-TEST-SCHEME-2026",
      version: "2026.1",
      effectiveFrom: "2026-01-01",
      status: "APPROVED",
      contentHash: HASH_B,
    });

    const historical = await resolveRule(db, {
      scheme: SCHEME,
      ruleCode: RULE_CODE,
      statutoryDate: "2025-06-15",
    });
    expect(historical.rulePackId).toBe("MY-TEST-SCHEME-2025");
    expect(historical.status).toBe("SUPERSEDED");

    const current = await resolveRule(db, {
      scheme: SCHEME,
      ruleCode: RULE_CODE,
      statutoryDate: "2026-06-15",
    });
    expect(current.rulePackId).toBe("MY-TEST-SCHEME-2026");
  });

  it("refuses a date that falls in the gap between two non-adjacent packs", async () => {
    await insertPack({
      id: "MY-TEST-SCHEME-EARLY",
      effectiveFrom: "2024-01-01",
      effectiveTo: "2024-06-30",
      status: "SUPERSEDED",
      contentHash: HASH_A,
      supersededBy: "MY-TEST-SCHEME-LATE",
    });
    await insertPack({
      id: "MY-TEST-SCHEME-LATE",
      effectiveFrom: "2025-01-01",
      status: "APPROVED",
      contentHash: HASH_C,
    });

    await expect(
      resolveRule(db, {
        scheme: SCHEME,
        ruleCode: RULE_CODE,
        statutoryDate: "2024-09-01",
      })
    ).rejects.toThrow(/no rule pack covers/);
  });
});
