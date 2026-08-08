/**
 * Government instruments are the authority; approved rule packs are the
 * executable representation; payroll runs record which representation they used.
 *
 * These tests assert the middle sentence is enforced by the database rather than
 * by discipline: an unapproved pack cannot produce a payroll, and an approved one
 * cannot be edited afterwards — content included.
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

const COMPANY = "bbbbbbbb-0000-4000-8000-000000000001";
const DRAFT_PACK = "MY-TEST-DRAFT-2026";
const APPROVED_PACK = "MY-TEST-APPROVED-2026";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.truncate(...ALL_TABLES);

  await db.execute(sql`
    INSERT INTO companies (id, code, name) VALUES (${COMPANY}, 'TESTCO', 'Test Sdn Bhd')`);
  await db.execute(sql`
    INSERT INTO rule_packs (id, name, layer, authority, code, version, effective_from, status)
    VALUES (${DRAFT_PACK}, 'draft pack', 'STATUTORY_CALCULATION', 'KWSP', 'EPF', '2026.1',
            '2026-01-01', 'DRAFT')`);
  await db.execute(sql`
    INSERT INTO rule_packs (id, name, layer, authority, code, version, effective_from,
                            content_hash, status, approved_by, approved_at)
    VALUES (${APPROVED_PACK}, 'approved pack', 'STATUTORY_CALCULATION', 'KWSP', 'EPF', '2026.2',
            '2026-01-01', ${HASH_A}, 'APPROVED', 'jack', now())`);
});

function insertRun(runId: string, packId: string): Promise<unknown> {
  return db.execute(sql`
    INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end,
                          working_days, rule_pack_id)
    VALUES (${runId}, ${COMPANY}, 2026, 7, '2026-07-01', '2026-07-31', 26, ${packId})`);
}

describe("only an approved rule pack may produce a payroll", () => {
  it("refuses a run under a DRAFT pack", async () => {
    await expectRejected(
      insertRun("TEST-DRAFT", DRAFT_PACK),
      /rule pack .* is DRAFT: only an approved rule pack may produce a payroll/
    );
  });

  it("refuses a run under a merely VERIFIED pack", async () => {
    await db.execute(
      sql`UPDATE rule_packs SET status = 'VERIFIED' WHERE id = ${DRAFT_PACK}`
    );
    await expectRejected(
      insertRun("TEST-VERIFIED", DRAFT_PACK),
      /is VERIFIED: only an approved rule pack/
    );
  });

  it("accepts a run under an APPROVED pack", async () => {
    await expect(insertRun("TEST-OK", APPROVED_PACK)).resolves.toBeDefined();
  });

  /**
   * A superseded pack is still the right answer for a run calculated under it.
   * Refusing it would make historical payrolls unreproducible the moment the law
   * changed, which is the opposite of what this model is for.
   */
  it("still accepts a SUPERSEDED pack, so history stays reproducible", async () => {
    await db.execute(sql`
      INSERT INTO rule_packs (id, name, effective_from, content_hash, status, approved_by, approved_at)
      VALUES ('MY-TEST-SUCCESSOR', 'successor', '2026-06-01', ${HASH_B}, 'APPROVED', 'jack', now())`);
    await db.execute(sql`
      UPDATE rule_packs SET status = 'SUPERSEDED', superseded_by = 'MY-TEST-SUCCESSOR'
      WHERE id = ${APPROVED_PACK}`);

    await expect(
      insertRun("TEST-HISTORICAL", APPROVED_PACK)
    ).resolves.toBeDefined();
  });
});

describe("an approved rule pack is immutable", () => {
  it("refuses to change its content hash", async () => {
    await expectRejected(
      db.execute(
        sql`UPDATE rule_packs SET content_hash = ${HASH_B} WHERE id = ${APPROVED_PACK}`
      ),
      /is approved and immutable: a statutory change creates a new version/
    );
  });

  it("refuses to change its effective date", async () => {
    await expectRejected(
      db.execute(
        sql`UPDATE rule_packs SET effective_from = '2025-01-01' WHERE id = ${APPROVED_PACK}`
      ),
      /is approved and immutable/
    );
  });

  it("refuses to rewrite who approved it", async () => {
    await expectRejected(
      db.execute(
        sql`UPDATE rule_packs SET approved_by = 'someone else' WHERE id = ${APPROVED_PACK}`
      ),
      /is approved and immutable/
    );
  });

  it("refuses to delete it", async () => {
    await expectRejected(
      db.execute(sql`DELETE FROM rule_packs WHERE id = ${APPROVED_PACK}`),
      /has been approved and cannot be deleted: supersede it instead/
    );
  });

  it("refuses to demote it back to DRAFT", async () => {
    await expectRejected(
      db.execute(
        sql`UPDATE rule_packs SET status = 'DRAFT' WHERE id = ${APPROVED_PACK}`
      ),
      /cannot move from APPROVED to DRAFT/
    );
  });

  it("allows it to become EFFECTIVE and then SUPERSEDED", async () => {
    await expect(
      db.execute(
        sql`UPDATE rule_packs SET status = 'EFFECTIVE' WHERE id = ${APPROVED_PACK}`
      )
    ).resolves.toBeDefined();
    await db.execute(sql`
      INSERT INTO rule_packs (id, name, effective_from, content_hash, status, approved_by, approved_at)
      VALUES ('MY-TEST-NEXT', 'next', '2026-06-01', ${HASH_B}, 'APPROVED', 'jack', now())`);
    await expect(
      db.execute(sql`
        UPDATE rule_packs SET status = 'SUPERSEDED', superseded_by = 'MY-TEST-NEXT'
        WHERE id = ${APPROVED_PACK}`)
    ).resolves.toBeDefined();
  });

  it("refuses an approval with nobody attached to it", async () => {
    await expectRejected(
      db.execute(sql`
        INSERT INTO rule_packs (id, name, effective_from, status)
        VALUES ('MY-TEST-UNATTRIBUTED', 'nobody approved this', '2026-01-01', 'APPROVED')`),
      /rule_packs_approved_is_attributable/
    );
  });
});

describe("an approved pack's content is frozen with it", () => {
  it("refuses to add a band to it", async () => {
    await expectRejected(
      db.execute(sql`
        INSERT INTO epf_bands (rule_pack_id, part, from_sen, to_sen, er_sen, ee_sen)
        VALUES (${APPROVED_PACK}, 'A', 0, 1000, 100, 90)`),
      /is approved: its epf_bands cannot be changed, create a new version/
    );
  });

  it("refuses to edit its sources", async () => {
    await expectRejected(
      db.execute(sql`
        INSERT INTO rule_sources (rule_pack_id, ref, issuer, title, url, retrieved_at)
        VALUES (${APPROVED_PACK}, 'S9', 'KWSP', 'something', 'https://example.gov.my', '2026-01-01')`),
      /is approved: its rule_sources cannot be changed/
    );
  });

  it("allows a DRAFT pack to be assembled freely", async () => {
    await expect(
      db.execute(sql`
        INSERT INTO epf_bands (rule_pack_id, part, from_sen, to_sen, er_sen, ee_sen)
        VALUES (${DRAFT_PACK}, 'A', 0, 1000, 100, 90)`)
    ).resolves.toBeDefined();
  });
});

describe("the evidence register", () => {
  it("represents a PDF-only instrument reviewed by a human", async () => {
    await expect(
      db.execute(sql`
        INSERT INTO rule_sources (
          rule_pack_id, ref, issuer, title, url, retrieved_at,
          instrument_number, provision_reference, page_reference,
          published_date, effective_date,
          verification_method, verified_by, verified_at, sha256)
        VALUES (
          ${DRAFT_PACK}, 'S1', 'JTKSM / MOHR',
          'Employment (Limitation of Overtime Work) Regulations 1980',
          'https://jtksm.mohr.gov.my/', '2026-08-08',
          'P.U. (A) 138/1980', 'Regulation 5', 'p. 2',
          '1980-05-01', '1980-05-01',
          'HUMAN_REVIEW_OF_OFFICIAL_PDF', 'jack', now(), ${HASH_A})`)
    ).resolves.toBeDefined();
  });

  it("allows a living portal page to carry no hash", async () => {
    await expect(
      db.execute(sql`
        INSERT INTO rule_sources (rule_pack_id, ref, issuer, title, url, retrieved_at,
                                  verification_method, verified_by, verified_at)
        VALUES (${DRAFT_PACK}, 'S2', 'HASiL / LHDN', 'PCB methods page',
                'https://www.hasil.gov.my/', '2026-08-08',
                'OFFICIAL_HTML_PAGE', 'jack', now())`)
    ).resolves.toBeDefined();
  });

  it("refuses a verification with no verifier or method", async () => {
    await expectRejected(
      db.execute(sql`
        INSERT INTO rule_sources (rule_pack_id, ref, issuer, title, url, retrieved_at, verified_at)
        VALUES (${DRAFT_PACK}, 'S3', 'KWSP', 'something', 'https://www.kwsp.gov.my/', '2026-08-08', now())`),
      /rule_sources_verification_is_attributable/
    );
  });
});

describe("the employment-law rule registry", () => {
  it("stores one rule per row, with its unit and its source", async () => {
    await db.execute(sql`
      INSERT INTO rule_sources (rule_pack_id, ref, issuer, title, url, retrieved_at)
      VALUES (${DRAFT_PACK}, 'S1', 'JTKSM', 'OT Regulations 1980', 'https://jtksm.mohr.gov.my/', '2026-08-08')`);

    await expect(
      db.execute(sql`
        INSERT INTO employment_law_rules (rule_pack_id, rule_key, value, unit, source_ref)
        VALUES (${DRAFT_PACK}, 'OT_MAX_HOURS_MONTH', 104, 'HOURS', 'S1')`)
    ).resolves.toBeDefined();
  });

  /**
   * A rule pack that stores 1700 without saying whether that is ringgit or sen
   * is a payroll defect waiting to happen, so the unit is not free text.
   */
  it("refuses a value whose unit is not one it understands", async () => {
    await expectRejected(
      db.execute(sql`
        INSERT INTO employment_law_rules (rule_pack_id, rule_key, value, unit, source_ref)
        VALUES (${DRAFT_PACK}, 'MIN_WAGE', 1700, 'ringgit-ish', 'S1')`),
      /employment_law_rules_unit_known/
    );
  });

  it("cannot be reached by a payroll until its pack is approved", async () => {
    await expectRejected(
      insertRun("TEST-LAW", DRAFT_PACK),
      /only an approved rule pack may produce a payroll/
    );
  });
});
