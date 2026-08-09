/**
 * @feature auth
 * @layer test
 *
 * Hono auth platform routes — real DB, injected JWT verifier (no Neon network).
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
  await database.close();
});

function claims(partial: {
  sub: string;
  email: string;
  banned?: boolean;
}): NeonAuthClaims {
  return {
    sub: partial.sub,
    email: partial.email,
    emailVerified: undefined,
    name: undefined,
    banned: partial.banned ?? false,
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
    if (c.banned) {
      return Promise.reject(new AuthError("AUTH_BANNED", "banned"));
    }
    return Promise.resolve(c);
  };
}

async function makeAdmin(email: string): Promise<string> {
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
  return user.id;
}

describe("GET /health", () => {
  it("returns ok without auth", async () => {
    const app = createApp({
      db,
      verifyJwt: verifier({}),
    });
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("GET /v1/me", () => {
  it("401 without Authorization", async () => {
    const app = createApp({ db, verifyJwt: verifier({}) });
    const res = await app.request("/v1/me");
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHORIZED");
  });

  it("403 INVITE_REQUIRED when email not invited", async () => {
    const app = createApp({
      db,
      verifyJwt: verifier({
        t1: claims({ sub: "s1", email: "ghost@example.com" }),
      }),
    });
    const res = await app.request("/v1/me", {
      headers: { Authorization: "Bearer t1" },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("INVITE_REQUIRED");
  });

  it("200 and links auth_subject for invited user", async () => {
    await createUser(db, { email: "ada@example.com", name: "Ada" });
    const app = createApp({
      db,
      verifyJwt: verifier({
        t1: claims({ sub: "neon-ada", email: "ada@example.com" }),
      }),
    });
    const res = await app.request("/v1/me", {
      headers: { Authorization: "Bearer t1" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("ada@example.com");
    expect(body.name).toBe("Ada");

    const perm = await app.request("/v1/me/permissions", {
      headers: { Authorization: "Bearer t1" },
    });
    expect(perm.status).toBe(200);
    const permBody = await perm.json();
    expect(permBody.permissions.PAY_RUN).toEqual([]);
  });
});

describe("admin users", () => {
  it("non-admin cannot invite", async () => {
    await createUser(db, { email: "ops@example.com", name: "Ops" });
    const app = createApp({
      db,
      verifyJwt: verifier({
        ops: claims({ sub: "neon-ops", email: "ops@example.com" }),
      }),
    });
    const res = await app.request("/v1/admin/users", {
      method: "POST",
      headers: {
        Authorization: "Bearer ops",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "x@example.com", name: "X" }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("PERMISSION_DENIED");
  });

  it("SYSTEM_ADMIN can invite and list", async () => {
    await makeAdmin("admin@example.com");
    const app = createApp({
      db,
      verifyJwt: verifier({
        admin: claims({ sub: "neon-admin", email: "admin@example.com" }),
      }),
    });

    const created = await app.request("/v1/admin/users", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "New@Example.com", name: "New User" }),
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.email).toBe("new@example.com");

    const listed = await app.request("/v1/admin/users", {
      headers: { Authorization: "Bearer admin" },
    });
    expect(listed.status).toBe(200);
    const listBody = await listed.json();
    expect(
      listBody.users.some(
        (u: { email: string }) => u.email === "new@example.com"
      )
    ).toBe(true);
  });

  it("rejects disabling self", async () => {
    const adminId = await makeAdmin("admin2@example.com");
    const app = createApp({
      db,
      verifyJwt: verifier({
        admin: claims({ sub: "neon-admin2", email: "admin2@example.com" }),
      }),
    });
    const res = await app.request(`/v1/admin/users/${adminId}`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "DISABLED" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("SELF_LOCKOUT");
  });
});
