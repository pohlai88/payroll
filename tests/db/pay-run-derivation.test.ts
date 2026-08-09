/**
 * GET /v1/pay-runs/:runId/lines/:lineId/derivation — compute-on-read graph.
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

const COMPANY_ID = "dddddddd-0004-4000-8000-000000000001";
const PERSON_ID = "dddddddd-0004-4000-8000-000000000002";
const EMP_ID = "dddddddd-0004-4000-8000-000000000003";
const RUN_ID = "DERIV-TEST-2026-07";
const ADMIN_EMAIL = "deriv-admin@example.com";
let rulePackId = "";
let lineId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);
  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'DERIVCO', 'Deriv Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'DERIV WORKER', '900101-10-7777', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES (${EMP_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'V001', '2020-01-01',
            'MONTHLY', 400000, true, true, true, false)`);

  await createRun(db, {
    runId: RUN_ID,
    companyId: COMPANY_ID,
    rulePackId,
    year: 2026,
    month: 7,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    workingDays: 26,
    paidDays: 26,
    actor: "deriv-test",
  });
  const outcome = await recomputeRun(db, RUN_ID, "deriv-test");
  expect(outcome.failures).toEqual([]);
  expect(outcome.computed).toBe(1);

  const lines = await db.execute<{ id: string }>(
    sql`SELECT id FROM pay_lines WHERE run_id = ${RUN_ID}`
  );
  const id = lines.rows[0]?.id;
  if (id === undefined) {
    throw new Error("expected a pay line after recompute");
  }
  lineId = id;
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
  const user = await createUser(db, { email, name: "Deriv Admin" });
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
      admin: claims({ sub: "neon-deriv-admin", email: ADMIN_EMAIL }),
    }),
  });
}

describe("GET /v1/pay-runs/:runId/lines/:lineId/derivation", () => {
  it("returns 401 without token", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(
      `/v1/pay-runs/${RUN_ID}/lines/${lineId}/derivation`
    );
    expect(res.status).toBe(401);
  });

  it("returns a DerivedNode tree for the default root", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(
      `/v1/pay-runs/${RUN_ID}/lines/${lineId}/derivation`,
      { headers: { Authorization: "Bearer admin" } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runId: string;
      lineId: string;
      employmentId: string;
      root: string;
      rootKeys: string[];
      node: { key: string; kind: string; sen: number | null } | null;
    };
    expect(body.runId).toBe(RUN_ID);
    expect(body.lineId).toBe(lineId);
    expect(body.employmentId).toBe(EMP_ID);
    expect(body.rootKeys.length).toBeGreaterThan(0);
    expect(body.rootKeys).toContain("gross");
    expect(body.root).toBeTruthy();
    expect(body.node).not.toBeNull();
    expect(body.node?.key).toBeTruthy();
    expect(body.node?.kind).toBeTruthy();
  });

  it("selects a root via query and returns that subtree", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(
      `/v1/pay-runs/${RUN_ID}/lines/${lineId}/derivation?root=pcbNet`,
      { headers: { Authorization: "Bearer admin" } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      root: string;
      node: {
        key: string;
        kind: string;
        citation: { ruleId: string } | null;
      } | null;
    };
    expect(body.root).toBe("pcbNet");
    expect(body.node?.key).toMatch(/pcb/);
    // PCB not applicable → NOT_APPLICABLE + EXTERNAL_ONLY citation
    expect(body.node?.kind).toBe("NOT_APPLICABLE");
    expect(body.node?.citation?.ruleId).toBe("MY.PCB.EXTERNAL_ONLY");
  });

  it("returns 404 for an unknown line", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(
      `/v1/pay-runs/${RUN_ID}/lines/00000000-0000-4000-8000-000000000099/derivation`,
      { headers: { Authorization: "Bearer admin" } }
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 VALIDATION_ERROR when the line snapshot fails calc validation", async () => {
    // Corrupt the frozen snapshot so classify tripwires would throw on bypass;
    // the service wall must map that to a structured 400 instead of a 500.
    const before = await db.execute<{ snapshot: unknown }>(
      sql`SELECT employee_snapshot AS snapshot FROM pay_lines WHERE id = ${lineId}`
    );
    const original = before.rows[0]?.snapshot;
    if (original === undefined || typeof original !== "object") {
      throw new Error("expected employee_snapshot");
    }
    const corrupted = { ...(original as Record<string, unknown>), dob: null };
    await db.execute(
      sql`UPDATE pay_lines SET employee_snapshot = ${JSON.stringify(corrupted)}::jsonb WHERE id = ${lineId}`
    );

    try {
      const app = adminApp();
      await makeAdmin(ADMIN_EMAIL);
      const res = await app.request(
        `/v1/pay-runs/${RUN_ID}/lines/${lineId}/derivation`,
        { headers: { Authorization: "Bearer admin" } }
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string; message: string };
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.message).toMatch(/employee\.dob/i);
    } finally {
      await db.execute(
        sql`UPDATE pay_lines SET employee_snapshot = ${JSON.stringify(original)}::jsonb WHERE id = ${lineId}`
      );
    }
  });
});
