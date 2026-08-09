/**
 * @feature companies
 * @layer test
 *
 * Admin companies HTTP — list/create/update/delete with SYSTEM_ADMIN gate.
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

/** Local `.env.local` may enable bypass; API auth tests need real JWT injection. */
const previousDevAuthBypass = process.env.DEV_AUTH_BYPASS;
process.env.DEV_AUTH_BYPASS = "false";

const database = connectTestDatabase();
const { db } = database;

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  await seed(db);
});

beforeEach(async () => {
  await db.delete(userRoleAssignments);
  await db.delete(users);
  await db.delete(roles).where(eq(roles.isSystem, false));
  await database.truncate("companies", "persons");
});

afterAll(async () => {
  if (previousDevAuthBypass === undefined) {
    delete process.env.DEV_AUTH_BYPASS;
  } else {
    process.env.DEV_AUTH_BYPASS = previousDevAuthBypass;
  }
  await database.close();
});

function claims(partial: {
  sub: string;
  email: string;
}): NeonAuthClaims {
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
  const user = await createUser(db, { email, name: "Admin" });
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

describe("admin companies API", () => {
  it("401 without Authorization", async () => {
    const app = createApp({ db, verifyJwt: verifier({}) });
    const res = await app.request("/v1/admin/companies");
    expect(res.status).toBe(401);
  });

  it("403 for non-admin", async () => {
    await createUser(db, { email: "ops@example.com", name: "Ops" });
    const app = createApp({
      db,
      verifyJwt: verifier({
        ops: claims({ sub: "neon-ops", email: "ops@example.com" }),
      }),
    });
    const res = await app.request("/v1/admin/companies", {
      headers: { Authorization: "Bearer ops" },
    });
    expect(res.status).toBe(403);
  });

  it("SYSTEM_ADMIN create → list → patch → delete empty company", async () => {
    await makeAdmin("admin@example.com");
    const app = createApp({
      db,
      verifyJwt: verifier({
        admin: claims({ sub: "neon-admin", email: "admin@example.com" }),
      }),
    });
    const headers = {
      Authorization: "Bearer admin",
      "Content-Type": "application/json",
    };

    const created = await app.request("/v1/admin/companies", {
      method: "POST",
      headers,
      body: JSON.stringify({
        code: "acme",
        name: "Acme Sdn Bhd",
        hrdfEnabled: true,
        hrdfLevyPct: "1.5",
      }),
    });
    expect(created.status).toBe(201);
    const company = (await created.json()) as {
      id: string;
      code: string;
      name: string;
      hrdfLevyPct: string;
    };
    expect(company.code).toBe("ACME");
    expect(Number(company.hrdfLevyPct)).toBe(1.5);

    const listed = await app.request("/v1/admin/companies", { headers });
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { companies: { id: string }[] };
    expect(body.companies.some((row) => row.id === company.id)).toBe(true);

    const patched = await app.request(`/v1/admin/companies/${company.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name: "Acme Holdings" }),
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { name: string }).name).toBe(
      "Acme Holdings"
    );

    const deleted = await app.request(`/v1/admin/companies/${company.id}`, {
      method: "DELETE",
      headers,
    });
    expect(deleted.status).toBe(200);
    expect(((await deleted.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("409 on duplicate code", async () => {
    await makeAdmin("admin2@example.com");
    const app = createApp({
      db,
      verifyJwt: verifier({
        admin: claims({ sub: "neon-admin-2", email: "admin2@example.com" }),
      }),
    });
    const headers = {
      Authorization: "Bearer admin",
      "Content-Type": "application/json",
    };
    const first = await app.request("/v1/admin/companies", {
      method: "POST",
      headers,
      body: JSON.stringify({ code: "DUP1", name: "First" }),
    });
    expect(first.status).toBe(201);

    const second = await app.request("/v1/admin/companies", {
      method: "POST",
      headers,
      body: JSON.stringify({ code: "dup1", name: "Second" }),
    });
    expect(second.status).toBe(409);
    expect(((await second.json()) as { code: string }).code).toBe("CONFLICT");
  });

  it("409 delete when employments exist", async () => {
    await makeAdmin("admin3@example.com");
    const companyId = "cccccccc-0000-4000-8000-000000000001";
    const personId = "cccccccc-0000-4000-8000-000000000002";
    const employmentId = "cccccccc-0000-4000-8000-000000000003";

    await db.execute(sql`
      INSERT INTO companies (id, code, name, hrdf_enabled)
      VALUES (${companyId}, 'KEEP', 'Keep Co', false)`);
    await db.execute(sql`
      INSERT INTO persons (id, name, ic, dob)
      VALUES (${personId}, 'Keep Person', '900101-10-9999', '1990-01-01')`);
    await db.execute(sql`
      INSERT INTO employments (
        id, person_id, company_id, employee_code, join_date,
        pay_basis, base_rate_sen,
        epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
      VALUES (
        ${employmentId}, ${personId}, ${companyId}, 'K001', '2020-01-01',
        'MONTHLY', 100000, false, false, false, false)`);

    const app = createApp({
      db,
      verifyJwt: verifier({
        admin: claims({ sub: "neon-admin-3", email: "admin3@example.com" }),
      }),
    });
    const res = await app.request(`/v1/admin/companies/${companyId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("CONFLICT");
  });
});
