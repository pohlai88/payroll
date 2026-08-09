/**
 * GET /v1/pay-runs/:runId/lines/:lineId/diff — compute-on-read graph diff.
 * Uses createRun + recompute so employeeSnapshot matches the Zod wall.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { roles, userRoleAssignments, users } from "@/db/schema/rbac";
import { SYSTEM_ADMIN_ROLE_CODE } from "@/domain/rbac/types";
import { assignUserToRole, createUser, getRoleByCode } from "@/repo/rbac";
import { createApp } from "@/server/app";
import { AuthError } from "@/server/auth/errors";
import type { NeonAuthClaims, VerifyJwt } from "@/server/auth/jwt";
import { createRun, recomputeRun } from "@/service/payrun";
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
            'MONTHLY', 500000, true, true, true, false)`);
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

async function createLinkedRuns(): Promise<string> {
  await makeAdmin(ADMIN_EMAIL);

  await createRun(db, {
    runId: RUN_A,
    companyId: COMPANY_ID,
    rulePackId,
    year: 2026,
    month: 6,
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    workingDays: 26,
    paidDays: 26,
    actor: "diff-test",
  });
  const prior = await recomputeRun(db, RUN_A, "diff-test");
  expect(prior.failures).toEqual([]);
  expect(prior.computed).toBe(1);

  await createRun(db, {
    runId: RUN_B,
    companyId: COMPANY_ID,
    rulePackId,
    year: 2026,
    month: 7,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    workingDays: 26,
    paidDays: 26,
    actor: "diff-test",
  });
  const current = await recomputeRun(db, RUN_B, "diff-test");
  expect(current.failures).toEqual([]);
  expect(current.computed).toBe(1);

  await db.execute(
    sql`UPDATE pay_runs SET linked_run_id = ${RUN_A} WHERE id = ${RUN_B}`
  );

  const lines = await db.execute<{ id: string }>(
    sql`SELECT id FROM pay_lines WHERE run_id = ${RUN_B}`
  );
  const id = lines.rows[0]?.id;
  if (id === undefined) {
    throw new Error("expected a pay line after recompute");
  }
  return id;
}

describe("GET /v1/pay-runs/:runId/lines/:lineId/diff", () => {
  it("returns 401 without token", async () => {
    const lineId = await createLinkedRuns();
    const app = adminApp();
    const res = await app.request(`/v1/pay-runs/${RUN_B}/lines/${lineId}/diff`);
    expect(res.status).toBe(401);
  });

  it("returns RunLineDiffDto with priorRunId when linkedRunId exists", async () => {
    const lineId = await createLinkedRuns();
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
    // Distinct period ends → at least DATE node value diffs.
    expect((body.diffs as unknown[]).length).toBeGreaterThan(0);
  });

  it("returns priorRunId null when no linkedRunId", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const STANDALONE = "DIFF-STANDALONE-2026-08";
    await createRun(db, {
      runId: STANDALONE,
      companyId: COMPANY_ID,
      rulePackId,
      year: 2026,
      month: 8,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      workingDays: 26,
      paidDays: 26,
      actor: "diff-test",
    });
    const outcome = await recomputeRun(db, STANDALONE, "diff-test");
    expect(outcome.failures).toEqual([]);

    const lines = await db.execute<{ id: string }>(
      sql`SELECT id FROM pay_lines WHERE run_id = ${STANDALONE}`
    );
    const lineId = lines.rows[0]?.id;
    if (lineId === undefined) {
      throw new Error("expected a pay line after recompute");
    }

    const app = adminApp();
    const res = await app.request(
      `/v1/pay-runs/${STANDALONE}/lines/${lineId}/diff`,
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
