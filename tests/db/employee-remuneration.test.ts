import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { roles, userRoleAssignments, users } from "@/db/schema/rbac";
import { SYSTEM_ADMIN_ROLE_CODE } from "@/domain/rbac/types";
import {
  assignUserToRole,
  createRole,
  createUser,
  getRoleByCode,
  grantPermission,
} from "@/repo/rbac";
import { createApp } from "@/server/app";
import { AuthError } from "@/server/auth/errors";
import type { NeonAuthClaims, VerifyJwt } from "@/server/auth/jwt";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "./harness/database";

const database = connectTestDatabase();
const { db } = database;

const COMPANY_ID = "dddddddd-0003-4000-8000-000000000001";
const PERSON_ID = "dddddddd-0003-4000-8000-000000000002";
const EMP_ID = "dddddddd-0003-4000-8000-000000000003";
const ADMIN_EMAIL = "remun-admin@example.com";
const LIMITED_USER_EMAIL = "limited@example.com";
let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);
  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'REMCORP', 'Remun Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'REMUN WORKER', '900101-10-4444', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES (${EMP_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'RM001', '2020-01-01',
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
async function makeLimitedUser(email: string) {
  const user = await createUser(db, { email, name: "Limited User" });
  // Create a role with no REPORT permissions
  const limitedRole = await createRole(db, {
    code: "LIMITED_ROLE",
    name: "Limited Role",
    scope: "COMPANY",
  });
  // Give this role some permissions, but NOT REPORT READ
  await grantPermission(db, limitedRole.id, "EMPLOYMENT", "READ");
  await assignUserToRole(db, {
    userId: user.id,
    roleId: limitedRole.id,
    companyId: COMPANY_ID,
  });
  return user;
}
async function makeAdmin(email: string) {
  const user = await createUser(db, { email, name: "Remun Admin" });
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
function testApp() {
  return createApp({
    db,
    verifyJwt: verifier({
      admin: claims({ sub: "neon-rem-admin", email: ADMIN_EMAIL }),
      limited: claims({ sub: "neon-limited", email: LIMITED_USER_EMAIL }),
    }),
  });
}

async function insertApprovedRuns() {
  const snap = JSON.stringify({ id: "RM001", name: "REMUN WORKER" });
  for (const [month, runId] of [
    ["06", "REM-2026-06"],
    ["07", "REM-2026-07"],
  ] as const) {
    await db.execute(sql`
      INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end, working_days, rule_pack_id, status)
      VALUES (${runId}, ${COMPANY_ID}, 2026, ${Number(month)},
              ${`2026-${month}-01`}, ${`2026-${month}-30`}, 26, ${rulePackId}, 'DRAFT')`);
    await db.execute(sql`
      INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days, period_end,
        gross_sen, net_sen, deductions_total_sen, epf_wages_sen, socso_wages_sen, eis_wages_sen,
        epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
        eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen, hrdf_sen, employer_cost_sen)
      VALUES (gen_random_uuid(), ${runId}, ${EMP_ID}, ${snap}::jsonb, 26, ${`2026-${month}-30`},
              500000, 433500, 66500, 500000, 500000, 500000,
              55000, 65000, 4750, 0, 9375, 1750, 1750, 5000, 0, 0, 0, 0, 65000)`);
    await db.execute(
      sql`UPDATE pay_runs SET status = 'REVIEWED' WHERE id = ${runId}`
    );
    await db.execute(
      sql`UPDATE pay_runs SET status = 'APPROVED' WHERE id = ${runId}`
    );
  }
  // Also insert a DRAFT run that should NOT be included
  await db.execute(sql`
    INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end, working_days, rule_pack_id, status)
    VALUES ('REM-2026-08', ${COMPANY_ID}, 2026, 8, '2026-08-01', '2026-08-31', 26, ${rulePackId}, 'DRAFT')`);
  await db.execute(sql`
    INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days, period_end,
      gross_sen, net_sen, deductions_total_sen, epf_wages_sen, socso_wages_sen, eis_wages_sen,
      epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
      eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen, hrdf_sen, employer_cost_sen)
    VALUES (gen_random_uuid(), 'REM-2026-08', ${EMP_ID}, ${snap}::jsonb, 26, '2026-08-31',
            999999, 888888, 111111, 999999, 999999, 999999,
            99999, 99999, 9999, 0, 9999, 9999, 9999, 9999, 0, 0, 0, 0, 99999)`);
}

describe("GET /v1/employees/:employeeId/remuneration-summary/:year", () => {
  it("returns 401 without token", async () => {
    const app = testApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(
      `/v1/employees/${EMP_ID}/remuneration-summary/2026`
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks REPORT READ permission", async () => {
    const app = testApp();
    await makeAdmin(ADMIN_EMAIL);
    await makeLimitedUser(LIMITED_USER_EMAIL);
    await insertApprovedRuns();
    const res = await app.request(
      `/v1/employees/${EMP_ID}/remuneration-summary/2026`,
      {
        headers: { Authorization: "Bearer limited" },
      }
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe("PERMISSION_DENIED");
    expect(body.message).toContain("cannot READ on REPORT");
  });

  it("aggregates only APPROVED/CLOSED runs and excludes DRAFT", async () => {
    const app = testApp();
    await makeAdmin(ADMIN_EMAIL);
    await insertApprovedRuns();
    const res = await app.request(
      `/v1/employees/${EMP_ID}/remuneration-summary/2026`,
      {
        headers: { Authorization: "Bearer admin" },
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Two approved runs × 500000 = 1000000
    expect(body.grossSen).toBe(1000000);
    expect(body.epfEeSen).toBe(110000); // 55000 × 2
    // DRAFT run (999999 gross) must NOT be included
    expect(body.grossSen).not.toBe(1999999);
    expect(body.months).toEqual(["2026-06", "2026-07"]);
    expect(body.runsIncluded).toEqual(["REM-2026-06", "REM-2026-07"]);
  });

  it("excludes approved runs with no pay line for this employee", async () => {
    const app = testApp();
    await makeAdmin(ADMIN_EMAIL);
    await insertApprovedRuns();
    // May run is APPROVED but employee has no pay line (e.g. joined after May)
    await db.execute(sql`
      INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end, working_days, rule_pack_id, status)
      VALUES ('REM-2026-05', ${COMPANY_ID}, 2026, 5, '2026-05-01', '2026-05-31', 26, ${rulePackId}, 'DRAFT')`);
    await db.execute(
      sql`UPDATE pay_runs SET status = 'REVIEWED' WHERE id = 'REM-2026-05'`
    );
    await db.execute(
      sql`UPDATE pay_runs SET status = 'APPROVED' WHERE id = 'REM-2026-05'`
    );

    const res = await app.request(
      `/v1/employees/${EMP_ID}/remuneration-summary/2026`,
      {
        headers: { Authorization: "Bearer admin" },
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.grossSen).toBe(1000000);
    expect(body.months).toEqual(["2026-06", "2026-07"]);
    expect(body.runsIncluded).toEqual(["REM-2026-06", "REM-2026-07"]);
    expect(body.runsIncluded).not.toContain("REM-2026-05");
  });

  it("returns zero totals when no approved runs (not error)", async () => {
    const app = testApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(
      `/v1/employees/${EMP_ID}/remuneration-summary/2025`,
      {
        headers: { Authorization: "Bearer admin" },
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.grossSen).toBe(0);
    expect(body.runsIncluded).toHaveLength(0);
  });

  it("includes limitationNotice and disclaimer in DTO", async () => {
    const app = testApp();
    await makeAdmin(ADMIN_EMAIL);
    await insertApprovedRuns();
    const res = await app.request(
      `/v1/employees/${EMP_ID}/remuneration-summary/2026`,
      {
        headers: { Authorization: "Bearer admin" },
      }
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.limitationNotice).toBe("string");
    expect((body.limitationNotice as string).length).toBeGreaterThan(0);
    expect(typeof body.disclaimer).toBe("string");
    expect(body.disclaimer).not.toContain("Form EA");
    expect(body.disclaimer).not.toContain("C.P.8A");
  });
});
