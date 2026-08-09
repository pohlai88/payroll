/**
 * @feature reports
 * @layer test
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { roles, userRoleAssignments, users } from "@/db/schema/rbac";
import { SYSTEM_ADMIN_ROLE_CODE } from "@/domain/rbac/types";
import { assignUserToRole, createUser, getRoleByCode } from "@/repo/rbac";
import { createApp } from "@/server/app";
import { AuthError } from "@/server/auth/errors";
import type { NeonAuthClaims, VerifyJwt } from "@/server/auth/jwt";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "./harness/database";

const database = connectTestDatabase();
const { db } = database;

const COMPANY_ID = "cccccccc-0003-4000-8000-000000000001";
const PERSON_ID = "cccccccc-0003-4000-8000-000000000002";
const EMP_ID = "cccccccc-0003-4000-8000-000000000003";
const RUN_ID = "RPT-TEST-2026-07";
const ADMIN_EMAIL = "reports-admin@example.com";
let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);
  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'RPTCORP', 'Reports Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'REPORTS WORKER', '900101-10-5555', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES (${EMP_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'R001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false)`);
  const snap = JSON.stringify({ id: "R001", name: "REPORTS WORKER" });
  // Insert as DRAFT first (trigger blocks inserts into non-DRAFT runs)
  await db.execute(sql`
    INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end, working_days, rule_pack_id, status)
    VALUES (${RUN_ID}, ${COMPANY_ID}, 2026, 7, '2026-07-01', '2026-07-31', 26, ${rulePackId}, 'DRAFT')`);
  await db.execute(sql`
    INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days, period_end,
      gross_sen, net_sen, deductions_total_sen,
      epf_wages_sen, socso_wages_sen, eis_wages_sen,
      epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
      eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen,
      hrdf_sen, employer_cost_sen)
    VALUES (gen_random_uuid(), ${RUN_ID}, ${EMP_ID}, ${snap}::jsonb, 26, '2026-07-31',
            500000, 433500, 66500, 500000, 500000, 500000,
            55000, 65000, 4750, 0, 9375, 1750, 1750, 5000, 0, 0, 0, 0, 65000)`);
  await db.execute(
    sql`UPDATE pay_runs SET status = 'REVIEWED' WHERE id = ${RUN_ID}`
  );
  await db.execute(
    sql`UPDATE pay_runs SET status = 'APPROVED' WHERE id = ${RUN_ID}`
  );
});

beforeEach(async () => {
  await db.delete(userRoleAssignments);
  await db.delete(users);
  await db.delete(roles).where(sql`is_system = false`);
});

afterAll(async () => {
  await database.close();
});

function claims(partial: { sub: string; email: string }): NeonAuthClaims {
  return {
    sub: partial.sub,
    email: partial.email,
    emailVerified: undefined,
    name: undefined,
    banned: false,
  };
}
function verifier(map: Record<string, NeonAuthClaims>): VerifyJwt {
  return (token) => {
    const c = map[token];
    if (!c) {
      return Promise.reject(
        new AuthError("UNAUTHORIZED", "unknown test token")
      );
    }
    return Promise.resolve(c);
  };
}
async function makeAdmin(email: string) {
  const user = await createUser(db, { email, name: "Reports Admin" });
  const role = await getRoleByCode(db, SYSTEM_ADMIN_ROLE_CODE);
  if (!role) {
    throw new Error("SYSTEM_ADMIN missing");
  }
  await assignUserToRole(db, {
    userId: user.id,
    roleId: role.id,
    companyId: null,
  });
}
function adminApp() {
  return createApp({
    db,
    verifyJwt: verifier({
      admin: claims({ sub: "neon-rpt-admin", email: ADMIN_EMAIL }),
    }),
  });
}

describe("GET /v1/pay-runs/:runId/reports/payment-register", () => {
  it("returns 401 without token", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(
      `/v1/pay-runs/${RUN_ID}/reports/payment-register`
    );
    expect(res.status).toBe(401);
  });

  it("returns payment register with reportMeta and rows", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(
      `/v1/pay-runs/${RUN_ID}/reports/payment-register`,
      {
        headers: { Authorization: "Bearer admin" },
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.reportMeta).toBeDefined();
    expect(
      (body.reportMeta as Record<string, unknown>).reportSchemaVersion
    ).toBeDefined();
    expect((body.reportMeta as Record<string, unknown>).runId).toBe(RUN_ID);
    expect(Array.isArray(body.rows)).toBe(true);
    expect((body.rows as unknown[]).length).toBeGreaterThan(0);
    const [row] = body.rows as Record<string, unknown>[];
    if (row === undefined) {
      throw new Error("no rows");
    }
    expect(row.employeeCode).toBe("R001");
    expect(row.netSen).toBe(433500);
  });

  it("includes totalNetSen", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(
      `/v1/pay-runs/${RUN_ID}/reports/payment-register`,
      {
        headers: { Authorization: "Bearer admin" },
      }
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.totalNetSen).toBe("number");
    expect(body.totalNetSen).toBe(433500);
    expect(body.incomplete).toBe(false);
  });
});

describe("GET /v1/pay-runs/:runId/reports/statutory-summary", () => {
  it("returns statutory totals matching payLine roots", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(
      `/v1/pay-runs/${RUN_ID}/reports/statutory-summary`,
      {
        headers: { Authorization: "Bearer admin" },
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.reportMeta).toBeDefined();
    expect(body.employeeCount).toBe(1);
    expect(body.grossTotalSen).toBe(500000);
    expect(body.epfEeTotalSen).toBe(55000);
    expect(body.epfErTotalSen).toBe(65000);
    expect(body.pcbNetTotalSen).toBe(5000);
    expect(body.incomplete).toBe(false);
  });
});

describe("GET /v1/pay-runs/:runId/reports/exception-report", () => {
  it("returns exception report DTO with reportMeta", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(
      `/v1/pay-runs/${RUN_ID}/reports/exception-report`,
      {
        headers: { Authorization: "Bearer admin" },
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.reportMeta).toBeDefined();
    expect(Array.isArray(body.findings)).toBe(true);
  });
});

/**
 * A DRAFT run whose single line carries a bank account and an unknown net.
 *
 * DRAFT on purpose: `line_payments` rows only exist from APPROVED onward, so
 * this also pins the LEFT JOIN — the register must still list the line with a
 * null payment state rather than coming back empty.
 */
const MASK_RUN_ID = "RPT-MASK-2026-08";

async function insertDraftRunWithBankAccountAndNullNet() {
  const snap = JSON.stringify({
    id: "R001",
    name: "REPORTS WORKER",
    bankAccount: "1234567890123456",
  });
  await db.execute(sql`
    INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end, working_days, rule_pack_id, status)
    VALUES (${MASK_RUN_ID}, ${COMPANY_ID}, 2026, 8, '2026-08-01', '2026-08-31', 26, ${rulePackId}, 'DRAFT')`);
  await db.execute(sql`
    INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days, period_end,
      gross_sen, net_sen, deductions_total_sen,
      epf_wages_sen, socso_wages_sen, eis_wages_sen,
      epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
      eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen,
      hrdf_sen, employer_cost_sen)
    VALUES (gen_random_uuid(), ${MASK_RUN_ID}, ${EMP_ID}, ${snap}::jsonb, 26, '2026-08-31',
            500000, NULL, 66500, 500000, 500000, 500000,
            55000, 65000, 4750, 0, 9375, 1750, 1750, 5000, 0, 0, 0, 0, 65000)`);
}

describe("report safety properties", () => {
  it("returns 404 for a run that does not exist", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(
      "/v1/pay-runs/RPT-NO-SUCH-RUN/reports/payment-register",
      { headers: { Authorization: "Bearer admin" } }
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe("NOT_FOUND");
  });

  it("masks the bank account and flags an unknown net as incomplete", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    await insertDraftRunWithBankAccountAndNullNet();

    const res = await app.request(
      `/v1/pay-runs/${MASK_RUN_ID}/reports/payment-register`,
      { headers: { Authorization: "Bearer admin" } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: {
        maskedBankAccount: string | null;
        netSen: number | null;
        paymentState: string | null;
      }[];
      totalNetSen: number;
      incomplete: boolean;
    };

    expect(body.rows).toHaveLength(1);
    const [row] = body.rows;
    // Last four digits only — the register is printed, emailed and filed.
    expect(row?.maskedBankAccount).toBe("****3456");
    expect(row?.maskedBankAccount).not.toContain("123456789012");
    // No line_payments row before APPROVED, so the LEFT JOIN yields null.
    expect(row?.paymentState).toBeNull();
    // The unknown net is skipped, not summed as zero, and the report says so.
    expect(row?.netSen).toBeNull();
    expect(body.totalNetSen).toBe(0);
    expect(body.incomplete).toBe(true);
  });
});
