/**
 * @feature pay-run
 * @layer test
 *
 * MY-STAT-S03 — overlapping approved packs are refused at the database.
 *
 * resolveRule() still reports ambiguity if such rows ever exist (defence in
 * depth), but approval itself must fail so the conflict never reaches payroll.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ALL_TABLES,
  connectTestDatabase,
  expectRejected,
} from "./harness/database";

const database = connectTestDatabase();
const { db } = database;

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.truncate(...ALL_TABLES);
});

function insertApproved(opts: {
  id: string;
  code?: string;
  layer?: string;
  jurisdiction?: string;
  version?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  contentHash: string;
  status?: "APPROVED" | "EFFECTIVE" | "SUPERSEDED";
  supersededBy?: string | null;
}): Promise<unknown> {
  const status = opts.status ?? "APPROVED";
  return db.execute(sql`
    INSERT INTO rule_packs
      (id, name, layer, jurisdiction, code, version, effective_from, effective_to,
       content_hash, status, approved_by, approved_at, superseded_by)
    VALUES (
      ${opts.id}, ${opts.id},
      ${(opts.layer ?? "STATUTORY_CALCULATION") as string}::rule_pack_layer,
      ${opts.jurisdiction ?? "MY"},
      ${opts.code ?? "MY-OVERLAP"},
      ${opts.version ?? "1"},
      ${opts.effectiveFrom}, ${opts.effectiveTo ?? null},
      ${opts.contentHash}, ${status}::rule_pack_status,
      ${"test-fixture"}, ${new Date()}, ${opts.supersededBy ?? null})`);
}

describe("rule_packs_no_overlapping_approved_ranges", () => {
  it("refuses a second APPROVED pack whose range overlaps the first", async () => {
    await insertApproved({
      id: "MY-OVERLAP-A",
      effectiveFrom: "2026-01-01",
      contentHash: HASH_A,
    });

    await expectRejected(
      insertApproved({
        id: "MY-OVERLAP-B",
        version: "2",
        effectiveFrom: "2026-01-01",
        contentHash: HASH_B,
      }),
      /rule_packs_no_overlapping_approved_ranges|overlapping|exclude/i
    );
  });

  it("allows adjacent (non-overlapping) approved ranges for the same code", async () => {
    await insertApproved({
      id: "MY-OVERLAP-EARLY",
      effectiveFrom: "2025-01-01",
      effectiveTo: "2025-12-31",
      status: "SUPERSEDED",
      contentHash: HASH_A,
      supersededBy: "MY-OVERLAP-LATE",
    });

    await expect(
      insertApproved({
        id: "MY-OVERLAP-LATE",
        version: "2",
        effectiveFrom: "2026-01-01",
        contentHash: HASH_B,
      })
    ).resolves.toBeDefined();
  });

  it("allows the same dates and code under a different jurisdiction", async () => {
    await insertApproved({
      id: "MY-OVERLAP-NATIONAL",
      jurisdiction: "MY",
      effectiveFrom: "2026-01-01",
      contentHash: HASH_A,
    });

    await expect(
      insertApproved({
        id: "MY-OVERLAP-SABAH",
        jurisdiction: "MY-SBH",
        version: "1",
        effectiveFrom: "2026-01-01",
        contentHash: HASH_B,
      })
    ).resolves.toBeDefined();
  });

  it("allows the same dates under a different rule code", async () => {
    await insertApproved({
      id: "MY-OVERLAP-EPF",
      code: "MY-EPF",
      effectiveFrom: "2026-01-01",
      contentHash: HASH_A,
    });

    await expect(
      insertApproved({
        id: "MY-OVERLAP-SOCSO",
        code: "MY-SOCSO",
        version: "1",
        effectiveFrom: "2026-01-01",
        contentHash: HASH_B,
      })
    ).resolves.toBeDefined();
  });

  it("does not constrain DRAFT packs — conflict is an approval-time problem", async () => {
    await db.execute(sql`
      INSERT INTO rule_packs
        (id, name, layer, code, version, effective_from, status)
      VALUES
        ('MY-OVERLAP-DRAFT-A', 'a', 'STATUTORY_CALCULATION', 'MY-OVERLAP',
         '1', '2026-01-01', 'DRAFT'),
        ('MY-OVERLAP-DRAFT-B', 'b', 'STATUTORY_CALCULATION', 'MY-OVERLAP',
         '2', '2026-01-01', 'DRAFT')`);

    const count = await db.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM rule_packs WHERE code = 'MY-OVERLAP'`
    );
    expect(Number(count.rows[0]?.count)).toBe(2);
  });

  it("still allows open-ended supersession when the old range is closed first", async () => {
    await insertApproved({
      id: "MY-OVERLAP-OLD",
      effectiveFrom: "2025-01-01",
      contentHash: HASH_A,
    });

    // Close the old pack's range before (or as) it is superseded, then approve
    // the successor. effective_to is mutable on an approved pack; identity is not.
    await db.execute(sql`
      UPDATE rule_packs
         SET effective_to = '2025-12-31',
             status = 'SUPERSEDED',
             superseded_by = 'MY-OVERLAP-NEW'
       WHERE id = 'MY-OVERLAP-OLD'`);

    await expect(
      insertApproved({
        id: "MY-OVERLAP-NEW",
        version: "2",
        effectiveFrom: "2026-01-01",
        contentHash: HASH_C,
      })
    ).resolves.toBeDefined();
  });
});
