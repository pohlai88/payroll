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

const COMPANY_ID = "aaaaaaaa-0001-4000-8000-000000000001";
const PERSON_ID = "aaaaaaaa-0001-4000-8000-000000000002";
const EMP_ID = "aaaaaaaa-0001-4000-8000-000000000003";
const RUN_ID = "PSL-TEST-2026-07";
const ADMIN_EMAIL = "payslip-admin@example.com";
let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);
  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'PSLCORP', 'Payslip Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'PAYSLIP WORKER', '900101-10-7777', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES (${EMP_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'P001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false)`);
});

beforeEach(async () => {
  await db.delete(userRoleAssignments);
  await db.delete(users);
  await db.delete(roles).where(sql`is_system = false`);
  await database.truncate("audit_events", "pay_runs");
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
  const user = await createUser(db, { email, name: "Payslip Admin" });
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
      admin: claims({ sub: "neon-psl-admin", email: ADMIN_EMAIL }),
    }),
  });
}

async function insertApprovedRun() {
  const snap = JSON.stringify({ id: "P001", name: "PAYSLIP WORKER" });
  // Insert as DRAFT first (trigger blocks inserts into non-DRAFT runs)
  await db.execute(sql`
    INSERT INTO pay_runs (id, company_id, rule_pack_id, year, month, period_start, period_end, working_days, status)
    VALUES (${RUN_ID}, ${COMPANY_ID}, ${rulePackId}, 2026, 7, '2026-07-01', '2026-07-31', 26, 'DRAFT')`);
  await db.execute(sql`
    INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days,
      period_end, gross_sen, epf_wages_sen, socso_wages_sen, eis_wages_sen,
      epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
      eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen,
      deductions_total_sen, net_sen, hrdf_sen, employer_cost_sen)
    VALUES (
      gen_random_uuid(), ${RUN_ID}, ${EMP_ID}, ${snap}::jsonb, 26, '2026-07-31',
      500000, 500000, 500000, 500000,
      55000, 65000, 4750, 0, 9375,
      1750, 1750, 5000, 0, 0, 0,
      66500, 433500, 0, 65000
    )`);
  // Advance to APPROVED via the required lifecycle: DRAFT→REVIEWED→APPROVED
  await db.execute(
    sql`UPDATE pay_runs SET status = 'REVIEWED' WHERE id = ${RUN_ID}`
  );
  await db.execute(
    sql`UPDATE pay_runs SET status = 'APPROVED' WHERE id = ${RUN_ID}`
  );
}

describe("GET /v1/pay-runs/:runId/payslips", () => {
  it("returns 401 without token", async () => {
    await makeAdmin(ADMIN_EMAIL);
    await insertApprovedRun();
    const app = adminApp();
    const res = await app.request(`/v1/pay-runs/${RUN_ID}/payslips`);
    expect(res.status).toBe(401);
  });

  it("returns index row for each line", async () => {
    await makeAdmin(ADMIN_EMAIL);
    await insertApprovedRun();
    const app = adminApp();
    const res = await app.request(`/v1/pay-runs/${RUN_ID}/payslips`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { payslips: unknown[] };
    expect(body.payslips).toHaveLength(1);
    const row = body.payslips[0] as Record<string, unknown>;
    expect(row.employeeCode).toBe("P001");
    expect(typeof row.lineId).toBe("string");
  });
});

describe("GET /v1/pay-runs/:runId/lines/:lineId/payslip", () => {
  it("returns APPROVED payslip DTO with correct structure", async () => {
    await makeAdmin(ADMIN_EMAIL);
    await insertApprovedRun();
    const app = adminApp();
    // Get lineId from index
    const idx = await app.request(`/v1/pay-runs/${RUN_ID}/payslips`, {
      headers: { Authorization: "Bearer admin" },
    });
    const { payslips } = (await idx.json()) as {
      payslips: Array<{ lineId: string }>;
    };
    if (!payslips[0]) throw new Error("no payslips");
    const { lineId } = payslips[0];

    const res = await app.request(
      `/v1/pay-runs/${RUN_ID}/lines/${lineId}/payslip`,
      {
        headers: { Authorization: "Bearer admin" },
      }
    );
    expect(res.status).toBe(200);
    const dto = (await res.json()) as Record<string, unknown>;
    expect(dto.documentStatus).toBe("APPROVED");
    expect(dto.employerSourceWarning).toBe("LIVE_COMPANY_RECORD");
    expect((dto.legalEmployer as Record<string, unknown>).name).toBe(
      "Payslip Co"
    );
    expect((dto.employee as Record<string, unknown>).name).toBe(
      "PAYSLIP WORKER"
    );
    expect((dto.roots as Record<string, unknown>).gross).toBeDefined();
    expect(dto.auditIdentity).toBeDefined();
    expect(
      (dto.auditIdentity as Record<string, unknown>).rulePackId
    ).toBeDefined();
  });

  it("returns DRAFT_PREVIEW for a DRAFT run without 403", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const DRAFT_RUN = "PSL-TEST-2026-08";
    const snap = JSON.stringify({ id: "P001", name: "PAYSLIP WORKER" });
    await db.execute(sql`
      INSERT INTO pay_runs (id, company_id, rule_pack_id, year, month, period_start, period_end, working_days, status)
      VALUES (${DRAFT_RUN}, ${COMPANY_ID}, ${rulePackId}, 2026, 8, '2026-08-01', '2026-08-31', 26, 'DRAFT')`);
    await db.execute(sql`
      INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days,
        period_end, gross_sen, net_sen, deductions_total_sen,
        epf_wages_sen, socso_wages_sen, eis_wages_sen,
        epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
        eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen,
        hrdf_sen, employer_cost_sen)
      VALUES (gen_random_uuid(), ${DRAFT_RUN}, ${EMP_ID}, ${snap}::jsonb, 26, '2026-08-31',
              500000, 433500, 66500, 500000, 500000, 500000,
              55000, 65000, 4750, 0, 9375, 1750, 1750, 5000, 0, 0, 0, 0, 65000)`);
    const app = adminApp();
    const idx = await app.request(`/v1/pay-runs/${DRAFT_RUN}/payslips`, {
      headers: { Authorization: "Bearer admin" },
    });
    const { payslips } = (await idx.json()) as {
      payslips: Array<{ lineId: string }>;
    };
    if (!payslips[0]) throw new Error("no payslips");
    const { lineId } = payslips[0];

    const res = await app.request(
      `/v1/pay-runs/${DRAFT_RUN}/lines/${lineId}/payslip`,
      {
        headers: { Authorization: "Bearer admin" },
      }
    );
    expect(res.status).toBe(200);
    const dto = (await res.json()) as Record<string, unknown>;
    expect(dto.documentStatus).toBe("DRAFT_PREVIEW");
  });

  it("YTD isProvisional=false for APPROVED run", async () => {
    await makeAdmin(ADMIN_EMAIL);
    await insertApprovedRun();
    const app = adminApp();
    const idx = await app.request(`/v1/pay-runs/${RUN_ID}/payslips`, {
      headers: { Authorization: "Bearer admin" },
    });
    const { payslips } = (await idx.json()) as {
      payslips: Array<{ lineId: string }>;
    };
    if (!payslips[0]) throw new Error("no payslips");
    const { lineId } = payslips[0];
    const res = await app.request(
      `/v1/pay-runs/${RUN_ID}/lines/${lineId}/payslip`,
      { headers: { Authorization: "Bearer admin" } }
    );
    const dto = (await res.json()) as Record<string, unknown>;
    const ytd = dto.ytd as Record<string, unknown> | null;
    // Only one approved run — YTD equals this run's values, isProvisional false
    expect(ytd?.isProvisional).toBe(false);
  });

  it("YTD isProvisional=true for DRAFT run with prior APPROVED run", async () => {
    await makeAdmin(ADMIN_EMAIL);
    // Insert a prior APPROVED run for month 6 (June)
    const PRIOR_RUN = "PSL-TEST-2026-06-PRIOR";
    const DRAFT_RUN = "PSL-TEST-2026-09-DRAFT";
    const snap = JSON.stringify({ id: "P001", name: "PAYSLIP WORKER" });

    await db.execute(sql`
      INSERT INTO pay_runs (id, company_id, rule_pack_id, year, month, period_start, period_end, working_days, status)
      VALUES (${PRIOR_RUN}, ${COMPANY_ID}, ${rulePackId}, 2026, 6, '2026-06-01', '2026-06-30', 24, 'DRAFT')`);
    await db.execute(sql`
      INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days,
        period_end, gross_sen, net_sen, deductions_total_sen,
        epf_wages_sen, socso_wages_sen, eis_wages_sen,
        epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
        eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen,
        hrdf_sen, employer_cost_sen)
      VALUES (gen_random_uuid(), ${PRIOR_RUN}, ${EMP_ID}, ${snap}::jsonb, 24, '2026-06-30',
              400000, 340000, 60000, 400000, 400000, 400000,
              44000, 52000, 3800, 0, 7500, 1400, 1400, 4000, 0, 0, 0, 0, 52000)`);
    await db.execute(
      sql`UPDATE pay_runs SET status = 'REVIEWED' WHERE id = ${PRIOR_RUN}`
    );
    await db.execute(
      sql`UPDATE pay_runs SET status = 'APPROVED' WHERE id = ${PRIOR_RUN}`
    );

    // Insert the current DRAFT run for month 9 (September)
    await db.execute(sql`
      INSERT INTO pay_runs (id, company_id, rule_pack_id, year, month, period_start, period_end, working_days, status)
      VALUES (${DRAFT_RUN}, ${COMPANY_ID}, ${rulePackId}, 2026, 9, '2026-09-01', '2026-09-30', 26, 'DRAFT')`);
    await db.execute(sql`
      INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days,
        period_end, gross_sen, net_sen, deductions_total_sen,
        epf_wages_sen, socso_wages_sen, eis_wages_sen,
        epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
        eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen,
        hrdf_sen, employer_cost_sen)
      VALUES (gen_random_uuid(), ${DRAFT_RUN}, ${EMP_ID}, ${snap}::jsonb, 26, '2026-09-30',
              500000, 433500, 66500, 500000, 500000, 500000,
              55000, 65000, 4750, 0, 9375, 1750, 1750, 5000, 0, 0, 0, 0, 65000)`);

    const app = adminApp();
    const idx = await app.request(`/v1/pay-runs/${DRAFT_RUN}/payslips`, {
      headers: { Authorization: "Bearer admin" },
    });
    const { payslips } = (await idx.json()) as {
      payslips: Array<{ lineId: string }>;
    };
    if (!payslips[0]) throw new Error("no payslips");
    const { lineId } = payslips[0];

    const res = await app.request(
      `/v1/pay-runs/${DRAFT_RUN}/lines/${lineId}/payslip`,
      { headers: { Authorization: "Bearer admin" } }
    );
    expect(res.status).toBe(200);
    const dto = (await res.json()) as Record<string, unknown>;
    const ytd = dto.ytd as Record<string, unknown> | null;

    expect(ytd?.isProvisional).toBe(true);
    // grossSen: prior APPROVED (400000) + current DRAFT (500000) = 900000
    expect(ytd?.grossSen).toBe(900000);
    // netSen: prior APPROVED (340000) + current DRAFT (433500) = 773500
    expect(ytd?.netSen).toBe(773500);
  });
});
