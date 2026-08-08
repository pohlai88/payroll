/**
 * Seed data is content-addressed, and this is what makes that mean something.
 *
 * The band tables are transcribed statutory figures. An accidental edit — a
 * stray keystroke in a 1,203-row EPF schedule — would change a payroll silently
 * and forever. Hashing every seed file as it loads and re-checking the hash here
 * turns that from an undetectable event into a failing test.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPayItems, loadStatutoryTables } from "@/repo/rule-pack";
import { parseRuleSettings } from "@/repo/rule-pack-schema";
import { seed } from "../../scripts/seed";
import {
  ALL_TABLES,
  connectTestDatabase,
  expectRejected,
} from "./harness/database";

const SEED_DIR = path.join(process.cwd(), "db", "seed");
const database = connectTestDatabase();
const { db } = database;

let rulePackId: string;

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);
});

afterAll(async () => {
  await database.close();
});

describe("seed files are content-addressed", () => {
  it("records a hash for every file it loaded", async () => {
    const rows = await db.execute<{ file_name: string; sha256: string }>(
      sql`SELECT file_name, sha256 FROM seed_files ORDER BY file_name`
    );
    expect(rows.rows.length).toBeGreaterThan(0);

    for (const row of rows.rows) {
      const onDisk = fs.readFileSync(path.join(SEED_DIR, row.file_name));
      const actual = createHash("sha256").update(onDisk).digest("hex");
      expect(
        actual,
        `${row.file_name} has been edited since it was seeded`
      ).toBe(row.sha256);
    }
  });

  it("covers every seed file in the directory", async () => {
    const onDisk = fs
      .readdirSync(SEED_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
    const rows = await db.execute<{ file_name: string }>(
      sql`SELECT file_name FROM seed_files ORDER BY file_name`
    );
    expect(rows.rows.map((r) => r.file_name)).toEqual(onDisk);
  });
});

/**
 * The rule pack's content hash must be a pure function of the seed files: the
 * same bytes on disk always fold to the same hash, and running the seed again
 * against a database that already carries that pack must be a no-op, not a
 * second attempt to insert it. `seed()`'s own idempotency check — compare the
 * freshly computed hash against the one already stored — is what MY-STAT-S01
 * calls "seed remains idempotent" and "rule-pack hash is deterministic";
 * this proves both from the outside, against the real seed files, rather than
 * against a hand-built fixture.
 */
describe("the rule pack is idempotent and its hash is deterministic", () => {
  it("re-seeding an already-approved pack is a no-op with the same content hash", async () => {
    const before = await db.execute<{ content_hash: string; status: string }>(
      sql`SELECT content_hash, status FROM rule_packs WHERE id = ${rulePackId}`
    );
    expect(before.rows[0]?.status).toBe("APPROVED");

    const again = await seed(db);
    expect(again).toBe(rulePackId);

    const after = await db.execute<{ content_hash: string }>(
      sql`SELECT content_hash FROM rule_packs WHERE id = ${rulePackId}`
    );
    expect(after.rows[0]?.content_hash).toBe(before.rows[0]?.content_hash);

    const rowCount = await db.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM rule_packs WHERE id = ${rulePackId}`
    );
    expect(Number(rowCount.rows[0]?.count)).toBe(1);
  });

  it("does not duplicate seed_files rows or band tables on re-seed", async () => {
    await seed(db);
    await seed(db);

    const seedFileRows = await db.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM seed_files`
    );
    const onDiskCount = fs
      .readdirSync(SEED_DIR)
      .filter((f) => f.endsWith(".json")).length;
    expect(Number(seedFileRows.rows[0]?.count)).toBe(onDiskCount);

    const epfRowCount = await db.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM epf_bands WHERE rule_pack_id = ${rulePackId}`
    );
    const before = await loadStatutoryTables(db, rulePackId);
    expect(Number(epfRowCount.rows[0]?.count)).toBe(
      before.epf.A.length + before.epf.C.length + before.epf.E.length
    );
  });
});

describe("band tables are well formed", () => {
  it("is contiguous and non-overlapping in every table", async () => {
    const tables = await loadStatutoryTables(db, rulePackId);
    const check = (
      bands: ReadonlyArray<{ fromSen: number; toSen: number }>,
      what: string
    ): void => {
      expect(bands.length, `${what} has bands`).toBeGreaterThan(0);
      let previousTo: number | null = null;
      for (const band of bands) {
        expect(
          band.toSen,
          `${what} band ${band.fromSen} is ordered`
        ).toBeGreaterThanOrEqual(band.fromSen);
        if (previousTo !== null) {
          expect(
            band.fromSen,
            `${what} has a gap or overlap at ${band.fromSen}`
          ).toBe(previousTo + 1);
        }
        previousTo = band.toSen;
      }
    };

    check(tables.epf.A, "EPF Part A");
    check(tables.epf.C, "EPF Part C");
    check(tables.epf.E, "EPF Part E");
    check(tables.socso, "SOCSO");
    check(tables.eis, "EIS");
  });

  /**
   * The schedules do not agree on where they start, and that is the published
   * position, not a transcription slip: the EPF Third Schedule's first row is
   * "RM0.01 to RM10.00", so it begins at 1 sen, while the SOCSO and EIS tables
   * begin at 0. Asserting a uniform 0 would have been asserting a tidier world
   * than the one the payroll runs in.
   */
  it("covers wages from the bottom of each published schedule", async () => {
    const tables = await loadStatutoryTables(db, rulePackId);
    expect(tables.epf.A[0]?.fromSen).toBe(1);
    expect(tables.epf.C[0]?.fromSen).toBe(1);
    expect(tables.epf.E[0]?.fromSen).toBe(1);
    expect(tables.socso[0]?.fromSen).toBe(0);
    expect(tables.eis[0]?.fromSen).toBe(0);
  });
});

describe("rule pack settings", () => {
  it("parses through the Zod boundary", async () => {
    const rows = await db.execute<{ settings: unknown }>(
      sql`SELECT settings FROM rule_settings WHERE rule_pack_id = ${rulePackId}`
    );
    const parsed = parseRuleSettings(rows.rows[0]?.settings, rulePackId);
    expect(parsed.socsoCeilingSen).toBeGreaterThan(0);
    expect(parsed.skbbkPhaseFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  /**
   * Recorded as an explicit expectation rather than left implicit: the block is
   * absent because its figures have not been verified against the instruments
   * that set them, and an unverified pack must be honest about that rather than
   * carry confident-looking numbers.
   */
  it("carries no statutory limits until they are verified", async () => {
    const rows = await db.execute<{ settings: unknown }>(
      sql`SELECT settings FROM rule_settings WHERE rule_pack_id = ${rulePackId}`
    );
    const parsed = parseRuleSettings(rows.rows[0]?.settings, rulePackId);
    expect(parsed.statutoryLimits).toBeUndefined();
  });

  it("cites a source for every figure it can hash", async () => {
    const rows = await db.execute<{ ref: string; sha256: string | null }>(
      sql`SELECT ref, sha256 FROM rule_sources WHERE rule_pack_id = ${rulePackId} ORDER BY ref`
    );
    expect(rows.rows.length).toBe(8);
    // The band tables' own sources are fixed documents and must be hashed.
    for (const ref of ["S1", "S2", "S3"]) {
      const source = rows.rows.find((r) => r.ref === ref);
      expect(
        source?.sha256,
        `${ref} is a document and must carry a hash`
      ).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

/**
 * The instruments whose figures have not been read yet.
 *
 * Capturing a source is not the same as knowing what it says. These packs name
 * what a reviewer must read; they hold no values, and the database will not let
 * a payroll near them until someone has read the instrument and approved them.
 */
describe("source-capture packs", () => {
  it("registers the employment-law and PCB instruments without approving them", async () => {
    const rows = await db.execute<{
      id: string;
      layer: string;
      status: string;
    }>(
      sql`SELECT id, layer::text AS layer, status::text AS status
          FROM rule_packs WHERE status = 'SOURCE_CAPTURED' ORDER BY id`
    );
    expect(rows.rows.map((r) => r.id)).toEqual([
      "MY-EMPLOYMENT-LAW-2026",
      "MY-PCB-2026",
    ]);
  });

  it("holds no employment-law values yet", async () => {
    const rows = await db.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM employment_law_rules`
    );
    expect(Number(rows.rows[0]?.count)).toBe(0);
  });

  it("names the instruments a reviewer has to read", async () => {
    const rows = await db.execute<{ ref: string; title: string }>(
      sql`SELECT ref, title FROM rule_sources
          WHERE rule_pack_id = 'MY-EMPLOYMENT-LAW-2026' ORDER BY ref`
    );
    expect(rows.rows.map((r) => r.ref)).toEqual([
      "L-EA265",
      "L-MWO2024",
      "L-OT1980",
    ]);
  });

  it("marks none of them as verified", async () => {
    const rows = await db.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM rule_sources
          WHERE rule_pack_id IN ('MY-EMPLOYMENT-LAW-2026', 'MY-PCB-2026')
            AND verification_method IS NOT NULL`
    );
    expect(Number(rows.rows[0]?.count)).toBe(0);
  });

  it("keeps them out of any payroll", async () => {
    await db.execute(sql`
      INSERT INTO companies (id, code, name)
      VALUES ('cccccccc-0000-4000-8000-000000000001', 'SRCCO', 'Source Test')
      ON CONFLICT DO NOTHING`);
    await expectRejected(
      db.execute(sql`
        INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end,
                              working_days, rule_pack_id)
        VALUES ('SRC-2026-07', 'cccccccc-0000-4000-8000-000000000001', 2026, 7,
                '2026-07-01', '2026-07-31', 26, 'MY-EMPLOYMENT-LAW-2026')`),
      /is SOURCE_CAPTURED: only an approved rule pack may produce a payroll/
    );
  });
});

describe("the pay item catalog", () => {
  it("loads as engine definitions with a basis on every item", async () => {
    const items = await loadPayItems(db);
    expect(items.length).toBe(15);
    for (const item of items) {
      expect(
        ["FIXED_MONTHLY", "PER_DAY", "PER_HOUR", "PER_UNIT", "AMOUNT"],
        `${item.code} has a valid basis`
      ).toContain(item.rateBasis);
    }
  });

  it("marks BASIC and OT as system items the catalog cannot retire", async () => {
    const rows = await db.execute<{ code: string; is_system: boolean }>(
      sql`SELECT code, is_system FROM pay_items WHERE is_system = true ORDER BY code`
    );
    expect(rows.rows.map((r) => r.code)).toEqual(["BASIC", "OT"]);
  });
});
