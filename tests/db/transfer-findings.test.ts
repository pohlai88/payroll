/**
 * @feature transfer
 * @layer test
 *
 * Persist §8.6 findings after transfer commit + APPROVAL soft gate.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertApprovalAllowed,
  listFindings,
  upsertFindings,
} from "@/service/findings";
import { commitTransfer } from "@/service/transfer";
import {
  ALL_TABLES,
  connectTestDatabase,
  expectRejected,
  type TestDatabase,
} from "./harness/database";

const database: TestDatabase = connectTestDatabase();
const { db } = database;

const RULE_PACK = "RP-FIND-TEST";
const COMPANY_A = "cccccccc-0000-4000-8000-000000000001";
const COMPANY_B = "cccccccc-0000-4000-8000-000000000002";
const PERSON = "cccccccc-0000-4000-8000-000000000003";
const EMPLOYMENT_A = "cccccccc-0000-4000-8000-000000000004";

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.truncate(...ALL_TABLES);
  await db.execute(sql`
    INSERT INTO rule_packs (id, name, effective_from, content_hash, status, approved_by, approved_at)
    VALUES (${RULE_PACK}, 'test pack', '2026-01-01', ${"b".repeat(64)},
            'APPROVED', 'test-fixture', now())`);
  await db.execute(sql`
    INSERT INTO companies (id, code, name) VALUES
    (${COMPANY_A}, 'FA', 'Find Co A'),
    (${COMPANY_B}, 'FB', 'Find Co B')`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob, group_service_date)
    VALUES (${PERSON}, 'FIND PERSON', '900101-10-1111', '1990-01-01', '2020-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen)
    VALUES (${EMPLOYMENT_A}, ${PERSON}, ${COMPANY_A}, 'F001', '2020-01-01', 'MONTHLY', 500000)`);
});

describe("transfer findings persistence", () => {
  it("happy-path commit leaves no overlap/service findings", async () => {
    const { transferId } = await commitTransfer(db, {
      personId: PERSON,
      fromEmploymentId: EMPLOYMENT_A,
      effectiveDate: "2026-09-01",
      toCompanyId: COMPANY_B,
      toEmployeeCode: "F002",
      groupServiceContinuity: "CONTINUOUS",
      actor: "findings-test",
    });

    const rows = await listFindings(db, { transferId });
    expect(rows.filter((r) => r.status === "OPEN")).toHaveLength(0);
  });

  it("persists SERVICE_DATES_INCONSISTENT when group date postdates join", async () => {
    const { transferId } = await commitTransfer(db, {
      personId: PERSON,
      fromEmploymentId: EMPLOYMENT_A,
      effectiveDate: "2026-09-01",
      toCompanyId: COMPANY_B,
      toEmployeeCode: "F003",
      groupServiceContinuity: "CONTINUOUS",
      actor: "findings-test",
    });
    // Force inconsistent dates post-commit (bad data / later edit).
    await db.execute(sql`
      UPDATE persons SET group_service_date = '2026-12-01' WHERE id = ${PERSON}`);

    const { scanTransferFindings } = await import("@/service/findings");
    await scanTransferFindings(db, transferId, "findings-test");
    const rows = await listFindings(db, { transferId });
    expect(rows.some((r) => r.ruleId === "SERVICE_DATES_INCONSISTENT")).toBe(
      true
    );
  });

  it("assertApprovalAllowed blocks OPEN WARNING on APPROVAL", async () => {
    await db.execute(sql`
      INSERT INTO pay_runs (id, company_id, run_type, year, month, period_start, period_end,
                            working_days, status, rule_pack_id)
      VALUES ('FIND-RUN', ${COMPANY_B}, 'REGULAR', 2026, 9, '2026-09-01', '2026-09-30',
              22, 'DRAFT', ${RULE_PACK})`);

    await upsertFindings(db, [
      {
        ruleId: "PERSON_IN_BOTH_EMPLOYERS",
        severity: "WARNING",
        blocks: ["APPROVAL"],
        title: "dual",
        detail: "dual",
        evidence: { personId: PERSON },
        runId: "FIND-RUN",
      },
    ]);

    await expectRejected(
      assertApprovalAllowed(db, "FIND-RUN"),
      /approval blocked by open findings/
    );
  });
});
