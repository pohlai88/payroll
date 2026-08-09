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

const COMPANY_ID = "bbbbbbbb-0002-4000-8000-000000000001";
const PERSON_ID = "bbbbbbbb-0002-4000-8000-000000000002";
const EMP_ID = "bbbbbbbb-0002-4000-8000-000000000003";
const RUN_A = "DIFF-TEST-2026-06";
const RUN_B = "DIFF-TEST-2026-07";
const ADMIN_EMAIL = "diff-admin@example.com";
let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);
  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'DIFFCORP', 'Diff Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'DIFF WORKER', '900101-10-6666', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES (${EMP_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'D001', '2020-01-01',
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
  const user = await createUser(db, { email, name: "Diff Admin" });
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
      admin: claims({ sub: "neon-diff-admin", email: ADMIN_EMAIL }),
    }),
  });
}

/**
 * Runs must be inserted as DRAFT — `pay_lines_immutable_past_approval` blocks
 * any INSERT into pay_lines once the run is APPROVED/CLOSED — then advanced
 * through the lifecycle (DRAFT -> REVIEWED -> APPROVED) after lines exist.
 */
async function insertRuns() {
  await makeAdmin(ADMIN_EMAIL);
  const snap = JSON.stringify({ id: "D001", name: "DIFF WORKER" });

  // Run A (prior)
  await db.execute(sql`
    INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end, working_days, rule_pack_id, status)
    VALUES (${RUN_A}, ${COMPANY_ID}, 2026, 6, '2026-06-01', '2026-06-30', 26, ${rulePackId}, 'DRAFT')`);
  await db.execute(sql`
    INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days, period_end, gross_sen, net_sen,
      deductions_total_sen, epf_wages_sen, socso_wages_sen, eis_wages_sen,
      epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
      eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen, hrdf_sen, employer_cost_sen,
      trace)
    VALUES (gen_random_uuid(), ${RUN_A}, ${EMP_ID}, ${snap}::jsonb, 26, '2026-06-30',
            400000, 344000, 56000, 400000, 400000, 400000,
            44000, 52000, 3800, 0, 7500, 1400, 1400, 4000, 0, 0, 0, 0, 52000,
            '{"nodes":{},"order":[]}'::jsonb)`);
  await db.execute(
    sql`UPDATE pay_runs SET status = 'REVIEWED' WHERE id = ${RUN_A}`
  );
  await db.execute(
    sql`UPDATE pay_runs SET status = 'APPROVED' WHERE id = ${RUN_A}`
  );

  // Run B (current, linked to A) — inserted DRAFT, lines added, then approved.
  await db.execute(sql`
    INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end, working_days, rule_pack_id, status, linked_run_id)
    VALUES (${RUN_B}, ${COMPANY_ID}, 2026, 7, '2026-07-01', '2026-07-31', 26, ${rulePackId}, 'DRAFT', ${RUN_A})`);
  const lineResult = await db.execute(sql`
    INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days, period_end, gross_sen, net_sen,
      deductions_total_sen, epf_wages_sen, socso_wages_sen, eis_wages_sen,
      epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
      eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen, hrdf_sen, employer_cost_sen,
      trace)
    VALUES (gen_random_uuid(), ${RUN_B}, ${EMP_ID}, ${snap}::jsonb, 26, '2026-07-31',
            500000, 433500, 66500, 500000, 500000, 500000,
            55000, 65000, 4750, 0, 9375, 1750, 1750, 5000, 0, 0, 0, 0, 65000,
            '{"nodes":{},"order":[]}'::jsonb)
    RETURNING id`);
  await db.execute(
    sql`UPDATE pay_runs SET status = 'REVIEWED' WHERE id = ${RUN_B}`
  );
  await db.execute(
    sql`UPDATE pay_runs SET status = 'APPROVED' WHERE id = ${RUN_B}`
  );
  return (lineResult.rows[0] as { id: string }).id;
}

describe("GET /v1/pay-runs/:runId/lines/:lineId/diff", () => {
  it("returns 401 without token", async () => {
    const lineId = await insertRuns();
    const app = adminApp();
    const res = await app.request(`/v1/pay-runs/${RUN_B}/lines/${lineId}/diff`);
    expect(res.status).toBe(401);
  });

  it("returns RunLineDiffDto with priorRunId when linkedRunId exists", async () => {
    const lineId = await insertRuns();
    const app = adminApp();
    const res = await app.request(
      `/v1/pay-runs/${RUN_B}/lines/${lineId}/diff`,
      {
        headers: { Authorization: "Bearer admin" },
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.runId).toBe(RUN_B);
    expect(body.lineId).toBe(lineId);
    expect(body.priorRunId).toBe(RUN_A);
    expect(body.employmentId).toBe(EMP_ID);
    expect(Array.isArray(body.diffs)).toBe(true);
  });

  it("returns priorRunId null when no linkedRunId", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const snap = JSON.stringify({ id: "D001", name: "DIFF WORKER" });
    const STANDALONE = "DIFF-STANDALONE-2026-08";
    await db.execute(sql`
      INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end, working_days, rule_pack_id, status)
      VALUES (${STANDALONE}, ${COMPANY_ID}, 2026, 8, '2026-08-01', '2026-08-31', 26, ${rulePackId}, 'DRAFT')`);
    const r = await db.execute(sql`
      INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days, period_end,
        gross_sen, net_sen, deductions_total_sen, epf_wages_sen, socso_wages_sen, eis_wages_sen,
        epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
        eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen, hrdf_sen, employer_cost_sen)
      VALUES (gen_random_uuid(), ${STANDALONE}, ${EMP_ID}, ${snap}::jsonb, 26, '2026-08-31',
              500000, 433500, 66500, 500000, 500000, 500000,
              55000, 65000, 4750, 0, 9375, 1750, 1750, 5000, 0, 0, 0, 0, 65000)
      RETURNING id`);
    await db.execute(
      sql`UPDATE pay_runs SET status = 'REVIEWED' WHERE id = ${STANDALONE}`
    );
    await db.execute(
      sql`UPDATE pay_runs SET status = 'APPROVED' WHERE id = ${STANDALONE}`
    );
    const app = adminApp();
    const lId = (r.rows[0] as { id: string }).id;
    const res = await app.request(
      `/v1/pay-runs/${STANDALONE}/lines/${lId}/diff`,
      {
        headers: { Authorization: "Bearer admin" },
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.priorRunId).toBeNull();
    expect(body.diffs).toHaveLength(0);
  });
});
