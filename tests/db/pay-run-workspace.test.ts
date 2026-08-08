/**
 * `GET /v1/pay-runs/:runId/workspace` — the main workspace read model.
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

const COMPANY_ID = "dddddddd-0000-4000-8000-000000000001";
const PERSON_ID = "dddddddd-0000-4000-8000-000000000002";
const EMPLOYMENT_ID = "dddddddd-0000-4000-8000-000000000003";
const RUN_ID = "API-WORKSPACE-2026-07";
const ADMIN_EMAIL = "workspace-admin@example.com";

let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'WSCORP', 'Workspace Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'WORKSPACE WORKER', '900101-10-8888', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES (${EMPLOYMENT_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'W001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false)`);
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
  const user = await createUser(db, { email, name: "Workspace Admin" });
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
      admin: claims({ sub: "neon-workspace-admin", email: ADMIN_EMAIL }),
    }),
  });
}

async function createAndRecomputeRun(
  app: ReturnType<typeof createApp>
): Promise<{ calcRevision: string }> {
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
  const recomputeBody = await recompute.json();
  return { calcRevision: recomputeBody.run.calcRevision as string };
}

describe("GET /v1/pay-runs/:runId/workspace", () => {
  it("401 without Authorization", async () => {
    const app = createApp({ db, verifyJwt: verifier({}) });
    const res = await app.request(
      "/v1/pay-runs/00000000-0000-0000-0000-000000000000/workspace"
    );
    expect(res.status).toBe(401);
  });

  it("404 for unknown runId", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const app = adminApp();
    const res = await app.request("/v1/pay-runs/NO-SUCH-RUN/workspace", {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(404);
  });

  it("403 when caller lacks PAY_RUN READ", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const app = adminApp();
    await createAndRecomputeRun(app);

    await createUser(db, { email: "clerk@example.com", name: "Clerk" });
    const clerkApp = createApp({
      db,
      verifyJwt: verifier({
        clerk: claims({ sub: "neon-clerk", email: "clerk@example.com" }),
      }),
    });
    const res = await clerkApp.request(`/v1/pay-runs/${RUN_ID}/workspace`, {
      headers: { Authorization: "Bearer clerk" },
    });
    expect(res.status).toBe(403);
  });

  it("returns the workspace view for a computed run", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const app = adminApp();
    await createAndRecomputeRun(app);

    const res = await app.request(`/v1/pay-runs/${RUN_ID}/workspace`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toMatchObject({
      run: {
        id: RUN_ID,
        companyId: COMPANY_ID,
        companyName: "Workspace Co",
        reportingMonth: "2026-07",
        status: "DRAFT",
        label: RUN_ID,
      },
      actionAvailability: {
        canRecompute: true,
        canReview: true,
        canApprove: false,
        canClose: false,
      },
      totals: expect.any(Array),
      lines: expect.any(Array),
    });

    expect(body.lines).toHaveLength(1);
    const [line] = body.lines;
    expect(line.employeeCode).toBe("W001");
    expect(line.employeeName).toBe("WORKSPACE WORKER");
    expect(typeof line.roots.gross.sen).toBe("number");
    expect(line.roots.gross.sen).toBeGreaterThan(0);
    expect(line.previousRoots).toBeNull();
    expect(line.variance).toBeNull();
    expect(line.findingsCount).toBeGreaterThanOrEqual(0);

    expect(body.totals).toHaveLength(5);
    const grossTile = body.totals.find(
      (t: { key: string }) => t.key === "gross_pay"
    );
    expect(grossTile).toMatchObject({
      label: "Gross Pay",
      currentSen: line.roots.gross.sen,
      variance: { direction: "NO_PRIOR" },
      history: [],
    });
  });

  it("action availability reflects REVIEWED status", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const app = adminApp();
    const { calcRevision } = await createAndRecomputeRun(app);

    const review = await app.request(`/v1/pay-runs/${RUN_ID}/review`, {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ calcRevision }),
    });
    expect(review.status).toBe(200);

    const res = await app.request(`/v1/pay-runs/${RUN_ID}/workspace`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run.status).toBe("REVIEWED");
    expect(body.actionAvailability).toEqual({
      canRecompute: false,
      canReview: false,
      canApprove: true,
      canClose: false,
    });
  });
});
