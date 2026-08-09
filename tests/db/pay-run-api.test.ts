/**
 * Auth-gated pay-run HTTP routes — real DB, injected Neon Auth JWT verifier.
 */

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { roles, userRoleAssignments, users } from "@/db/schema/rbac";
import { auditEvents, payRuns } from "@/db/schema/run";
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

const COMPANY_ID = "cccccccc-0000-4000-8000-000000000001";
const PERSON_ID = "cccccccc-0000-4000-8000-000000000002";
const EMPLOYMENT_ID = "cccccccc-0000-4000-8000-000000000003";
const RUN_ID = "API-PAYRUN-2026-07";
const ADMIN_EMAIL = "payrun-admin@example.com";

let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'APICORP', 'API PayRun Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'API WORKER', '900101-10-9999', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES (${EMPLOYMENT_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'A001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false)`);
});

beforeEach(async () => {
  await db.delete(userRoleAssignments);
  await db.delete(users);
  await db.delete(roles).where(eq(roles.isSystem, false));
  // TRUNCATE bypasses append-only DELETE trigger on audit_events.
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
  const user = await createUser(db, { email, name: "PayRun Admin" });
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

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    runId: RUN_ID,
    companyId: COMPANY_ID,
    rulePackId,
    year: 2026,
    month: 7,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    workingDays: 22,
    ...overrides,
  };
}

function adminApp() {
  return createApp({
    db,
    verifyJwt: verifier({
      admin: claims({ sub: "neon-payrun-admin", email: ADMIN_EMAIL }),
    }),
  });
}

describe("pay-run API", () => {
  it("401 without Authorization on create", async () => {
    const app = createApp({ db, verifyJwt: verifier({}) });
    const res = await app.request("/v1/pay-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createBody()),
    });
    expect(res.status).toBe(401);
  });

  it("403 when invited user lacks PAY_RUN CREATE", async () => {
    await createUser(db, { email: "clerk@example.com", name: "Clerk" });
    const app = createApp({
      db,
      verifyJwt: verifier({
        clerk: claims({ sub: "neon-clerk", email: "clerk@example.com" }),
      }),
    });
    const res = await app.request("/v1/pay-runs", {
      method: "POST",
      headers: {
        Authorization: "Bearer clerk",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createBody({ runId: "API-DENIED" })),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("PERMISSION_DENIED");
  });

  it("201 create as SYSTEM_ADMIN with Neon-linked email as actor", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const app = adminApp();
    const res = await app.request("/v1/pay-runs", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createBody()),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.run.id).toBe(RUN_ID);
    expect(body.mutation.kind).toBe("CREATE");
    expect(body.mutation.lineCount).toBe(1);
    expect(body.counters.lineCount).toBe(1);
    expect(body.counters.gates.REVIEW).toEqual(
      expect.objectContaining({ ok: expect.any(Boolean) })
    );

    const [run] = await db.select().from(payRuns).where(eq(payRuns.id, RUN_ID));
    expect(run?.createdBy).toBe(ADMIN_EMAIL);

    const audits = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.runId, RUN_ID));
    expect(
      audits.some((a) => a.action === "CREATE" && a.actor === ADMIN_EMAIL)
    ).toBe(true);
  });

  it("200 recompute as SYSTEM_ADMIN", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const app = adminApp();
    const create = await app.request("/v1/pay-runs", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createBody({ runId: "API-RECOMPUTE" })),
    });
    expect(create.status).toBe(201);

    const res = await app.request("/v1/pay-runs/API-RECOMPUTE/recompute", {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run.id).toBe("API-RECOMPUTE");
    expect(body.run.calcRevision).toEqual(expect.any(String));
    expect(body.mutation.kind).toBe("RECOMPUTE");
    expect(typeof body.mutation.computed).toBe("number");
    expect(Array.isArray(body.mutation.failures)).toBe(true);
    expect(body.mutation.computed).toBeGreaterThanOrEqual(1);
    expect(body.counters.lineCount).toBeGreaterThanOrEqual(1);
    expect(body.run.findingsScannedRevision).toBe(body.run.calcRevision);
  });

  it("400 on invalid create body", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const app = adminApp();
    const res = await app.request("/v1/pay-runs", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ runId: "x" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("404 on unknown runId recompute", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const app = adminApp();
    const res = await app.request("/v1/pay-runs/NO-SUCH-RUN/recompute", {
      method: "POST",
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });

  it("GET /v1/pay-runs returns list for authorised user", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const app = adminApp();
    await app.request("/v1/pay-runs", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createBody({ runId: "API-LIST-1" })),
    });

    const res = await app.request("/v1/pay-runs", {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toMatchObject({
      id: expect.any(String),
      companyId: expect.any(String),
      companyName: expect.any(String),
      status: expect.any(String),
      employeeCount: expect.any(Number),
    });

    const created = body.find((r: { id: string }) => r.id === "API-LIST-1");
    expect(created).toBeDefined();
    expect(created.companyName).toBe("API PayRun Co");
    expect(created.employeeCount).toBe(1);
  });

  it("GET /v1/pay-runs filters by companyId and reportingMonth", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const app = adminApp();
    await app.request("/v1/pay-runs", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createBody({ runId: "API-LIST-2" })),
    });

    const matching = await app.request(
      `/v1/pay-runs?companyId=${COMPANY_ID}&reportingMonth=2026-07`,
      { headers: { Authorization: "Bearer admin" } }
    );
    expect(matching.status).toBe(200);
    const matchingBody = await matching.json();
    expect(
      matchingBody.some((r: { id: string }) => r.id === "API-LIST-2")
    ).toBe(true);

    const nonMatching = await app.request(
      "/v1/pay-runs?reportingMonth=2020-01",
      { headers: { Authorization: "Bearer admin" } }
    );
    expect(nonMatching.status).toBe(200);
    expect(await nonMatching.json()).toEqual([]);
  });

  it("401 on GET /v1/pay-runs without Authorization", async () => {
    const app = createApp({ db, verifyJwt: verifier({}) });
    const res = await app.request("/v1/pay-runs");
    expect(res.status).toBe(401);
  });

  it("GET /v1/pay-runs returns [] when the caller has no company grants", async () => {
    await createUser(db, { email: "payrun-nogrant@example.com", name: "No Grant" });
    const app = createApp({
      db,
      verifyJwt: verifier({
        nogrant: claims({
          sub: "neon-payrun-nogrant",
          email: "payrun-nogrant@example.com",
        }),
      }),
    });
    const res = await app.request("/v1/pay-runs", {
      headers: { Authorization: "Bearer nogrant" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("GET /v1/pay-runs 403 when companyId is outside accessible set", async () => {
    const foreignCompanyId = "cccccccc-0000-4000-8000-000000000099";
    await db.execute(sql`
      INSERT INTO companies (id, code, name, hrdf_enabled)
      VALUES (${foreignCompanyId}, 'FOREIGN', 'Foreign Co', false)
      ON CONFLICT DO NOTHING`);

    const user = await createUser(db, {
      email: "payrun-scoped@example.com",
      name: "Scoped PayRun",
    });
    const role = await createRole(db, {
      code: "PAYRUN_SCOPED_READER",
      name: "PayRun Scoped Reader",
      scope: "COMPANY",
    });
    await grantPermission(db, role.id, "PAY_RUN", "READ");
    await assignUserToRole(db, {
      userId: user.id,
      roleId: role.id,
      companyId: COMPANY_ID,
    });

    const app = createApp({
      db,
      verifyJwt: verifier({
        scoped: claims({
          sub: "neon-payrun-scoped",
          email: "payrun-scoped@example.com",
        }),
      }),
    });
    const res = await app.request(
      `/v1/pay-runs?companyId=${foreignCompanyId}`,
      { headers: { Authorization: "Bearer scoped" } }
    );
    expect(res.status).toBe(403);
  });
});
