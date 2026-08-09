/**
 * @feature employee-import
 * @layer test
 *
 * Auth-gated employee import HTTP routes — real DB, injected JWT verifier.
 */

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { roles, userRoleAssignments, users } from "@/db/schema/rbac";
import { FIXED_HEADERS } from "@/domain/import/employee-row";
import { SYSTEM_ADMIN_ROLE_CODE } from "@/domain/rbac/types";
import { assignUserToRole, createUser, getRoleByCode } from "@/repo/rbac";
import { createApp } from "@/server/app";
import { AuthError } from "@/server/auth/errors";
import type { NeonAuthClaims, VerifyJwt } from "@/server/auth/jwt";
import { EMPLOYEE_IMPORT_MAX_BODY_BYTES } from "@/service/employee-import";
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
  await db.execute(sql`DELETE FROM employment_profiles`);
  await db.execute(sql`DELETE FROM employments`);
  await db.execute(sql`DELETE FROM persons`);
  await db.execute(sql`
    INSERT INTO companies (id, code, name)
    VALUES ('11111111-1111-1111-1111-111111111111', 'DLBB', 'DLBB Sdn Bhd')
    ON CONFLICT (code) DO NOTHING`);
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

function sampleRow(
  overrides: Record<string, string> = {}
): Record<string, string> {
  return {
    "Employee Code": "API1001",
    "Payroll Company Code": "DLBB",
    "Person IC": "860502435427",
    "Person Name": "API TEST",
    "Person Passport": "",
    "Person DOB": "1986-05-02",
    "Person Nationality": "MALAYSIAN",
    "Join Date": "2023-08-01",
    "Pay Basis": "MONTHLY",
    "Base Rate RM": "5,000.00",
    "Is Malaysian": "Yes",
    "Is Permanent Resident": "No",
    "EPF Applicable": "Yes",
    "SOCSO Applicable": "Yes",
    "EIS Applicable": "Yes",
    "PCB Applicable": "Yes",
    ...overrides,
  };
}

describe("employee import API", () => {
  it("401 without Authorization on template", async () => {
    const app = createApp({ db, verifyJwt: verifier({}) });
    const res = await app.request("/v1/employee-import/template");
    expect(res.status).toBe(401);
  });

  it("403 when invited user lacks EMPLOYMENT CREATE", async () => {
    await createUser(db, { email: "ops@example.com", name: "Ops" });
    const app = createApp({
      db,
      verifyJwt: verifier({
        ops: claims({ sub: "neon-ops", email: "ops@example.com" }),
      }),
    });
    const res = await app.request("/v1/employee-import/template", {
      headers: { Authorization: "Bearer ops" },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("PERMISSION_DENIED");
  });

  it("SYSTEM_ADMIN downloads CSV template", async () => {
    await makeAdmin("admin@example.com");
    const app = createApp({
      db,
      verifyJwt: verifier({
        admin: claims({ sub: "neon-admin", email: "admin@example.com" }),
      }),
    });
    const res = await app.request("/v1/employee-import/template", {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/csv");
    const text = await res.text();
    expect(text.startsWith("Employee Code,")).toBe(true);
    for (const h of FIXED_HEADERS) {
      expect(text).toContain(h.header);
    }
  });

  it("imports JSON create-only and skips on re-import", async () => {
    await makeAdmin("admin2@example.com");
    const app = createApp({
      db,
      verifyJwt: verifier({
        admin: claims({ sub: "neon-admin2", email: "admin2@example.com" }),
      }),
    });
    const headers = {
      Authorization: "Bearer admin",
      "Content-Type": "application/json",
    };
    const body = JSON.stringify([sampleRow()]);

    const first = await app.request("/v1/employee-import", {
      method: "POST",
      headers,
      body,
    });
    expect(first.status).toBe(200);
    const firstReport = await first.json();
    expect(firstReport.created).toBe(1);
    expect(firstReport.failed).toBe(0);

    const second = await app.request("/v1/employee-import", {
      method: "POST",
      headers,
      body,
    });
    expect(second.status).toBe(200);
    const secondReport = await second.json();
    expect(secondReport.created).toBe(0);
    expect(secondReport.skippedExisting).toBe(1);
  });

  it("400 on unrecognized headers", async () => {
    await makeAdmin("admin3@example.com");
    const app = createApp({
      db,
      verifyJwt: verifier({
        admin: claims({ sub: "neon-admin3", email: "admin3@example.com" }),
      }),
    });
    const res = await app.request("/v1/employee-import", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        { ...sampleRow({ "Employee Code": "API1002" }), Mystery: "x" },
      ]),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("413 when Content-Length exceeds cap", async () => {
    await makeAdmin("admin4@example.com");
    const app = createApp({
      db,
      verifyJwt: verifier({
        admin: claims({ sub: "neon-admin4", email: "admin4@example.com" }),
      }),
    });
    const res = await app.request("/v1/employee-import", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
        "Content-Length": String(EMPLOYEE_IMPORT_MAX_BODY_BYTES + 1),
      },
      body: "[]",
    });
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("400 when Content-Length is not a number", async () => {
    await makeAdmin("admin4b@example.com");
    const app = createApp({
      db,
      verifyJwt: verifier({
        admin: claims({ sub: "neon-admin4b", email: "admin4b@example.com" }),
      }),
    });
    const res = await app.request("/v1/employee-import", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin",
        "Content-Type": "application/json",
        "Content-Length": "nope",
      },
      body: "[]",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("non-admin POST import is 403", async () => {
    await createUser(db, { email: "clerk@example.com", name: "Clerk" });
    const app = createApp({
      db,
      verifyJwt: verifier({
        clerk: claims({ sub: "neon-clerk", email: "clerk@example.com" }),
      }),
    });
    const res = await app.request("/v1/employee-import", {
      method: "POST",
      headers: {
        Authorization: "Bearer clerk",
        "Content-Type": "application/json",
      },
      body: JSON.stringify([sampleRow({ "Employee Code": "API1003" })]),
    });
    expect(res.status).toBe(403);
  });
});
