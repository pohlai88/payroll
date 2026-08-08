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
import { ALL_TABLES, connectTestDatabase } from "./harness/database";

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
