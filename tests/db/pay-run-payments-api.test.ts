/**
 * `GET /v1/pay-runs/:runId/payments` — verifies each row carries `employmentId`
 * so the SPA can correlate payment state back to `EmployeeLineDto.employeeId`.
 */

import { eq, sql } from "drizzle-orm";
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

const COMPANY_ID = "eeeeeeee-0000-4000-8000-000000000001";
const PERSON_ID = "eeeeeeee-0000-4000-8000-000000000002";
const EMPLOYMENT_ID = "eeeeeeee-0000-4000-8000-000000000003";
const RUN_ID = "API-PAYMENTS-2026-07";
const ADMIN_EMAIL = "payments-admin@example.com";

let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'PAYCORP', 'Payments Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'PAYMENTS WORKER', '900101-10-7777', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
      bank_name, bank_account_no, bank_account_name)
    VALUES (${EMPLOYMENT_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'P001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false,
            'MAYBANK', '1234567890', 'PAYMENTS WORKER')`);
});

beforeEach(async () => {
  await db.delete(userRoleAssignments);
  await db.delete(users);
  await db.delete(roles).where(eq(roles.isSystem, false));
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
    if (c === undefined) {
      return Promise.reject(
        new AuthError("UNAUTHORIZED", "unknown test token")
      );
    }
    return Promise.resolve(c);
  };
}

async function makeAdmin(email: string): Promise<void> {
  const user = await createUser(db, { email, name: "Payments Admin" });
  const role = await getRoleByCode(db, SYSTEM_ADMIN_ROLE_CODE);
  if (role === null) {
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
      admin: claims({ sub: "neon-payments-admin", email: ADMIN_EMAIL }),
    }),
  });
}

async function createReviewApproveRun(
  app: ReturnType<typeof createApp>
): Promise<void> {
  const create = await app.request("/v1/pay-runs", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      runId: RUN_ID,
      companyId: COMPANY_ID,
      rulePackId,
      year: 2026,
      month: 7,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      workingDays: 22,
      paidDays: 22,
    }),
  });
  if (create.status !== 201) {
    throw new Error(`setup: create failed with ${create.status}`);
  }

  const recompute = await app.request(`/v1/pay-runs/${RUN_ID}/recompute`, {
    method: "POST",
    headers: { Authorization: "Bearer admin" },
  });
  if (recompute.status !== 200) {
    throw new Error(`setup: recompute failed with ${recompute.status}`);
  }
  const { run } = (await recompute.json()) as { run: { calcRevision: string } };

  const review = await app.request(`/v1/pay-runs/${RUN_ID}/review`, {
    method: "POST",
    headers: {
      Authorization: "Bearer admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ calcRevision: run.calcRevision }),
  });
  if (review.status !== 200) {
    throw new Error(`setup: review failed with ${review.status}`);
  }

  const approve = await app.request(`/v1/pay-runs/${RUN_ID}/approve`, {
    method: "POST",
    headers: {
      Authorization: "Bearer admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ calcRevision: run.calcRevision }),
  });
  if (approve.status !== 200) {
    throw new Error(`setup: approve failed with ${approve.status}`);
  }
}

describe("GET /v1/pay-runs/:runId/payments", () => {
  it("includes employmentId on each row so the SPA can correlate to EmployeeLineDto", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const app = adminApp();
    await createReviewApproveRun(app);

    const res = await app.request(`/v1/pay-runs/${RUN_ID}/payments`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      payments: { lineId: string; employmentId: string; state: string }[];
    };
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0]?.employmentId).toBe(EMPLOYMENT_ID);
    expect(body.payments[0]?.state).toBe("READY");
  });
});
