/**
 * @feature rbac
 * @layer test
 *
 * Admin roles + permission matrix HTTP — list/create/delete role, grant/revoke
 * permission cells, all gated behind SYSTEM_ADMIN.
 */

import { eq } from "drizzle-orm";
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
});

afterAll(async () => {
  if (previousDevAuthBypass === undefined) {
    delete process.env.DEV_AUTH_BYPASS;
  } else {
    process.env.DEV_AUTH_BYPASS = previousDevAuthBypass;
  }
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

describe("admin roles API", () => {
  it("401 without Authorization", async () => {
    const app = createApp({ db, verifyJwt: verifier({}) });
    const res = await app.request("/v1/admin/roles");
    expect(res.status).toBe(401);
  });

  it("403 for non-admin", async () => {
    await createUser(db, { email: "ops-role@example.com", name: "Ops" });
    const app = createApp({
      db,
      verifyJwt: verifier({
        ops: claims({ sub: "neon-ops-role", email: "ops-role@example.com" }),
      }),
    });
    const res = await app.request("/v1/admin/roles", {
      headers: { Authorization: "Bearer ops" },
    });
    expect(res.status).toBe(403);
  });

  it("list includes the seeded SYSTEM_ADMIN role, read-only", async () => {
    await makeAdmin("admin-roles-1@example.com");
    const app = createApp({
      db,
      verifyJwt: verifier({
        admin: claims({
          sub: "neon-admin-roles-1",
          email: "admin-roles-1@example.com",
        }),
      }),
    });
    const res = await app.request("/v1/admin/roles", {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      roles: { code: string; isSystem: boolean; permissions: unknown[] }[];
    };
    const systemAdmin = body.roles.find(
      (r) => r.code === SYSTEM_ADMIN_ROLE_CODE
    );
    expect(systemAdmin).toBeDefined();
    expect(systemAdmin?.isSystem).toBe(true);
    expect(systemAdmin?.permissions).toEqual([]);
  });

  it("create role → grant permission → revoke permission → delete", async () => {
    await makeAdmin("admin-roles-2@example.com");
    const app = createApp({
      db,
      verifyJwt: verifier({
        admin: claims({
          sub: "neon-admin-roles-2",
          email: "admin-roles-2@example.com",
        }),
      }),
    });
    const headers = {
      Authorization: "Bearer admin",
      "Content-Type": "application/json",
    };

    const created = await app.request("/v1/admin/roles", {
      method: "POST",
      headers,
      body: JSON.stringify({
        code: "payroll_operator",
        name: "Payroll Operator",
        scope: "COMPANY",
      }),
    });
    expect(created.status).toBe(201);
    const role = (await created.json()) as {
      id: string;
      code: string;
      permissions: { resource: string; action: string }[];
    };
    expect(role.code).toBe("PAYROLL_OPERATOR");
    expect(role.permissions).toEqual([]);

    const granted = await app.request(
      `/v1/admin/roles/${role.id}/permissions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ resource: "PAY_RUN", action: "READ" }),
      }
    );
    expect(granted.status).toBe(200);
    const grantedBody = (await granted.json()) as {
      permissions: { resource: string; action: string }[];
    };
    expect(grantedBody.permissions).toEqual([
      { resource: "PAY_RUN", action: "READ" },
    ]);

    const revoked = await app.request(
      `/v1/admin/roles/${role.id}/permissions`,
      {
        method: "DELETE",
        headers,
        body: JSON.stringify({ resource: "PAY_RUN", action: "READ" }),
      }
    );
    expect(revoked.status).toBe(200);
    const revokedBody = (await revoked.json()) as {
      permissions: { resource: string; action: string }[];
    };
    expect(revokedBody.permissions).toEqual([]);

    const deleted = await app.request(`/v1/admin/roles/${role.id}`, {
      method: "DELETE",
      headers,
    });
    expect(deleted.status).toBe(200);
    expect(((await deleted.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("409 on duplicate role code", async () => {
    await makeAdmin("admin-roles-3@example.com");
    const app = createApp({
      db,
      verifyJwt: verifier({
        admin: claims({
          sub: "neon-admin-roles-3",
          email: "admin-roles-3@example.com",
        }),
      }),
    });
    const headers = {
      Authorization: "Bearer admin",
      "Content-Type": "application/json",
    };
    const first = await app.request("/v1/admin/roles", {
      method: "POST",
      headers,
      body: JSON.stringify({ code: "DUPROLE", name: "First", scope: "GLOBAL" }),
    });
    expect(first.status).toBe(201);

    const second = await app.request("/v1/admin/roles", {
      method: "POST",
      headers,
      body: JSON.stringify({ code: "duprole", name: "Second", scope: "GLOBAL" }),
    });
    expect(second.status).toBe(409);
    expect(((await second.json()) as { code: string }).code).toBe("CONFLICT");
  });

  it("400 when granting a permission on the system role", async () => {
    await makeAdmin("admin-roles-4@example.com");
    const systemRole = await getRoleByCode(db, SYSTEM_ADMIN_ROLE_CODE);
    if (systemRole === null) {
      throw new Error("SYSTEM_ADMIN missing");
    }
    const app = createApp({
      db,
      verifyJwt: verifier({
        admin: claims({
          sub: "neon-admin-roles-4",
          email: "admin-roles-4@example.com",
        }),
      }),
    });
    const res = await app.request(
      `/v1/admin/roles/${systemRole.id}/permissions`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer admin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resource: "COMPANY", action: "READ" }),
      }
    );
    expect(res.status).toBe(400);
  });
});
