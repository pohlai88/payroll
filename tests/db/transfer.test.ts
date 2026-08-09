/**
 * @feature transfer
 * @layer test
 *
 * Internal group transfer: `commitTransfer` and `recordPriorEmploymentYtd`
 * against a real Postgres, per
 * `docs/superpowers/specs/2026-08-08-internal-group-transfer-design.md`.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { commitTransfer, recordPriorEmploymentYtd } from "@/service/transfer";
import {
  ALL_TABLES,
  connectTestDatabase,
  expectRejected,
  type TestDatabase,
} from "./harness/database";

const database: TestDatabase = connectTestDatabase();
const { db } = database;

const RULE_PACK = "RP-TRANSFER-TEST";
const COMPANY_A = "aaaaaaaa-0000-4000-8000-000000000001";
const COMPANY_B = "aaaaaaaa-0000-4000-8000-000000000002";
const PERSON = "aaaaaaaa-0000-4000-8000-000000000003";
const EMPLOYMENT_A = "aaaaaaaa-0000-4000-8000-000000000004";

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.truncate(...ALL_TABLES);

  await db.execute(sql`
    INSERT INTO rule_packs (id, name, effective_from, content_hash, status, approved_by, approved_at)
    VALUES (${RULE_PACK}, 'test pack', '2026-01-01', ${"d".repeat(64)},
            'APPROVED', 'test-fixture', now())`);
  await db.execute(sql`
    INSERT INTO companies (id, code, name) VALUES
    (${COMPANY_A}, 'COA', 'Company A Sdn Bhd'),
    (${COMPANY_B}, 'COB', 'Company B Sdn Bhd')`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob, group_service_date)
    VALUES (${PERSON}, 'TRANSFERRED PERSON', '900101-10-1234', '1990-01-01', '2020-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen)
    VALUES (${EMPLOYMENT_A}, ${PERSON}, ${COMPANY_A}, 'A001', '2020-01-01', 'MONTHLY', 500000)`);
});

async function employmentRow(id: string) {
  const result = await db.execute<{
    company_id: string;
    join_date: string;
    termination_date: string | null;
    termination_reason: string | null;
    prior_employment_id: string | null;
    base_rate_sen: string;
  }>(sql`SELECT company_id, join_date, termination_date, termination_reason,
                 prior_employment_id, base_rate_sen
          FROM employments WHERE id = ${id}`);
  return result.rows[0];
}

describe("commitTransfer — happy path", () => {
  it("ends employment A, creates employment B, links them, keeps service date on CONTINUOUS", async () => {
    const { transferId, toEmploymentId } = await commitTransfer(db, {
      personId: PERSON,
      fromEmploymentId: EMPLOYMENT_A,
      effectiveDate: "2026-09-01",
      toCompanyId: COMPANY_B,
      toEmployeeCode: "B001",
      groupServiceContinuity: "CONTINUOUS",
      actor: "transfer-test",
    });

    const a = await employmentRow(EMPLOYMENT_A);
    expect(a?.termination_date).toBe("2026-08-31");
    expect(a?.termination_reason).toBe("INTERNAL_GROUP_TRANSFER");

    const b = await employmentRow(toEmploymentId);
    expect(b?.company_id).toBe(COMPANY_B);
    expect(b?.join_date).toBe("2026-09-01");
    expect(b?.prior_employment_id).toBe(EMPLOYMENT_A);
    expect(Number(b?.base_rate_sen)).toBe(500_000); // defaulted from A

    const transfer = await db.execute<{
      from_employment_id: string;
      to_employment_id: string;
      group_service_continuity: string;
    }>(sql`SELECT from_employment_id, to_employment_id, group_service_continuity
            FROM transfers WHERE id = ${transferId}`);
    expect(transfer.rows[0]?.from_employment_id).toBe(EMPLOYMENT_A);
    expect(transfer.rows[0]?.to_employment_id).toBe(toEmploymentId);
    expect(transfer.rows[0]?.group_service_continuity).toBe("CONTINUOUS");

    const person = await db.execute<{ group_service_date: string }>(
      sql`SELECT group_service_date FROM persons WHERE id = ${PERSON}`
    );
    expect(person.rows[0]?.group_service_date).toBe("2020-01-01"); // untouched
  });

  it("RESET updates the person's groupServiceDate to the effective date", async () => {
    await commitTransfer(db, {
      personId: PERSON,
      fromEmploymentId: EMPLOYMENT_A,
      effectiveDate: "2026-09-01",
      toCompanyId: COMPANY_B,
      toEmployeeCode: "B002",
      groupServiceContinuity: "RESET",
      continuityReason: "new group entity, no continuity agreed",
      actor: "transfer-test",
    });

    const person = await db.execute<{ group_service_date: string }>(
      sql`SELECT group_service_date FROM persons WHERE id = ${PERSON}`
    );
    expect(person.rows[0]?.group_service_date).toBe("2026-09-01");
  });

  it("lets a caller default Employment B's terms and override individually", async () => {
    const { toEmploymentId } = await commitTransfer(db, {
      personId: PERSON,
      fromEmploymentId: EMPLOYMENT_A,
      effectiveDate: "2026-09-01",
      toCompanyId: COMPANY_B,
      toEmployeeCode: "B003",
      groupServiceContinuity: "CONTINUOUS",
      actor: "transfer-test",
      baseRateSen: 600_000,
    });

    const b = await employmentRow(toEmploymentId);
    expect(Number(b?.base_rate_sen)).toBe(600_000);
  });
});

describe("commitTransfer — business rule rejections", () => {
  it("rejects a concurrent open employment unless allowOverlap is given with a reason", async () => {
    const otherOpenEmployment = "aaaaaaaa-0000-4000-8000-000000000005";
    await db.execute(sql`
      INSERT INTO employments (id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen)
      VALUES (${otherOpenEmployment}, ${PERSON}, ${COMPANY_B}, 'C001', '2021-01-01', 'MONTHLY', 300000)`);

    await expectRejected(
      commitTransfer(db, {
        personId: PERSON,
        fromEmploymentId: EMPLOYMENT_A,
        effectiveDate: "2026-09-01",
        toCompanyId: COMPANY_B,
        toEmployeeCode: "B004",
        groupServiceContinuity: "CONTINUOUS",
        actor: "transfer-test",
      }),
      /already has another open employment/
    );

    const { transferId } = await commitTransfer(db, {
      personId: PERSON,
      fromEmploymentId: EMPLOYMENT_A,
      effectiveDate: "2026-09-01",
      toCompanyId: COMPANY_B,
      toEmployeeCode: "B004",
      groupServiceContinuity: "CONTINUOUS",
      allowOverlap: true,
      overlapReason: "intentional dual role during handover",
      actor: "transfer-test",
    });
    expect(transferId).toBeTruthy();
  });

  it("rejects an allowOverlap without a reason", async () => {
    await expectRejected(
      commitTransfer(db, {
        personId: PERSON,
        fromEmploymentId: EMPLOYMENT_A,
        effectiveDate: "2026-09-01",
        toCompanyId: COMPANY_B,
        toEmployeeCode: "B005",
        groupServiceContinuity: "CONTINUOUS",
        allowOverlap: true,
        actor: "transfer-test",
      }),
      /allowOverlap requires a non-blank overlapReason/
    );
  });

  it("rejects ending employment A inside a period an APPROVED regular run at A already covers", async () => {
    await db.execute(sql`
      INSERT INTO pay_runs (id, company_id, run_type, year, month, period_start, period_end,
                             working_days, rule_pack_id, status, approved_at, approved_by)
      VALUES ('COA-2026-08', ${COMPANY_A}, 'REGULAR', 2026, 8, '2026-08-01', '2026-08-31',
              26, ${RULE_PACK}, 'APPROVED', now(), 'test-fixture')`);

    await expectRejected(
      commitTransfer(db, {
        personId: PERSON,
        fromEmploymentId: EMPLOYMENT_A,
        effectiveDate: "2026-08-15",
        toCompanyId: COMPANY_B,
        toEmployeeCode: "B006",
        groupServiceContinuity: "CONTINUOUS",
        actor: "transfer-test",
      }),
      /already APPROVED\/CLOSED/
    );
  });

  it("rejects a groupServiceDate that would postdate the receiving employment's join date", async () => {
    await db.execute(sql`
      UPDATE persons SET group_service_date = '2027-01-01' WHERE id = ${PERSON}`);

    await expectRejected(
      commitTransfer(db, {
        personId: PERSON,
        fromEmploymentId: EMPLOYMENT_A,
        effectiveDate: "2026-09-01",
        toCompanyId: COMPANY_B,
        toEmployeeCode: "B007",
        groupServiceContinuity: "CONTINUOUS",
        actor: "transfer-test",
      }),
      /would postdate the receiving employment's join date/
    );
  });

  it("rejects transferring an employment that already has a termination date", async () => {
    await db.execute(sql`
      UPDATE employments SET termination_date = '2026-06-30', termination_reason = 'RESIGNATION'
      WHERE id = ${EMPLOYMENT_A}`);

    await expectRejected(
      commitTransfer(db, {
        personId: PERSON,
        fromEmploymentId: EMPLOYMENT_A,
        effectiveDate: "2026-09-01",
        toCompanyId: COMPANY_B,
        toEmployeeCode: "B008",
        groupServiceContinuity: "CONTINUOUS",
        actor: "transfer-test",
      }),
      /already ended/
    );
  });
});

describe("employment_prior_ytd", () => {
  it("recordPriorEmploymentYtd inserts, then upserts the same year", async () => {
    const { toEmploymentId } = await commitTransfer(db, {
      personId: PERSON,
      fromEmploymentId: EMPLOYMENT_A,
      effectiveDate: "2026-09-01",
      toCompanyId: COMPANY_B,
      toEmployeeCode: "B009",
      groupServiceContinuity: "CONTINUOUS",
      actor: "transfer-test",
    });

    await recordPriorEmploymentYtd(db, {
      employmentId: toEmploymentId,
      calendarYear: 2026,
      grossSen: 4_000_000,
      epfEeSen: 440_000,
      enteredBy: "payroll-admin",
    });

    let row = await db.execute<{ gross_sen: string; verified: boolean }>(
      sql`SELECT gross_sen, verified FROM employment_prior_ytd
          WHERE employment_id = ${toEmploymentId} AND calendar_year = 2026`
    );
    expect(Number(row.rows[0]?.gross_sen)).toBe(4_000_000);
    expect(row.rows[0]?.verified).toBe(false);

    await recordPriorEmploymentYtd(db, {
      employmentId: toEmploymentId,
      calendarYear: 2026,
      grossSen: 4_000_000,
      epfEeSen: 440_000,
      verified: true,
      source: "Company A final payslip",
      enteredBy: "payroll-admin",
    });

    row = await db.execute<{ gross_sen: string; verified: boolean }>(
      sql`SELECT gross_sen, verified FROM employment_prior_ytd
          WHERE employment_id = ${toEmploymentId} AND calendar_year = 2026`
    );
    expect(row.rows).toHaveLength(1); // upsert, not a second row
    expect(row.rows[0]?.verified).toBe(true);
  });

  it("rejects a negative figure", async () => {
    await expectRejected(
      db.execute(sql`
        INSERT INTO employment_prior_ytd (employment_id, calendar_year, gross_sen)
        VALUES (${EMPLOYMENT_A}, 2026, -1)`),
      /employment_prior_ytd_amounts_non_negative/
    );
  });

  it("rejects verified without a source", async () => {
    await expectRejected(
      db.execute(sql`
        INSERT INTO employment_prior_ytd (employment_id, calendar_year, verified)
        VALUES (${EMPLOYMENT_A}, 2026, true)`),
      /employment_prior_ytd_verified_needs_source/
    );
  });
});
