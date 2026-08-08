/**
 * Auth-gated employees HTTP route — real DB, injected Neon Auth JWT verifier.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser } from "@/repo/rbac";
import { createApp } from "@/server/app";
import { AuthError } from "@/server/auth/errors";
import type { NeonAuthClaims, VerifyJwt } from "@/server/auth/jwt";
import { ALL_TABLES, connectTestDatabase } from "./harness/database";

const database = connectTestDatabase();
const { db } = database;

const COMPANY_ID = "dddddddd-0000-4000-8000-000000000001";
const OTHER_COMPANY_ID = "dddddddd-0000-4000-8000-000000000002";
const PERSON_ID = "dddddddd-0000-4000-8000-000000000003";
const OTHER_PERSON_ID = "dddddddd-0000-4000-8000-000000000004";
const ACTIVE_EMPLOYMENT_ID = "dddddddd-0000-4000-8000-000000000005";
const TERMINATED_EMPLOYMENT_ID = "dddddddd-0000-4000-8000-000000000006";
const OTHER_COMPANY_EMPLOYMENT_ID = "dddddddd-0000-4000-8000-000000000007";
const USER_EMAIL = "employees-api@example.com";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES
      (${COMPANY_ID}, 'EMPCORP', 'Employees API Co', false),
      (${OTHER_COMPANY_ID}, 'EMPCORP2', 'Employees API Co 2', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES
      (${PERSON_ID}, 'Ah Chong', '900101-10-1111', '1990-01-01'),
      (${OTHER_PERSON_ID}, 'Siti Nurhaliza', '910202-10-2222', '1991-02-02')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, termination_date, termination_reason,
      pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES
      (${ACTIVE_EMPLOYMENT_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'E001', '2020-01-01', NULL, NULL,
       'MONTHLY', 500000, false, false, false, false),
      (${TERMINATED_EMPLOYMENT_ID}, ${OTHER_PERSON_ID}, ${COMPANY_ID}, 'E002', '2018-01-01', '2025-01-01', 'RESIGNATION',
       'MONTHLY', 400000, false, false, false, false),
      (${OTHER_COMPANY_EMPLOYMENT_ID}, ${PERSON_ID}, ${OTHER_COMPANY_ID}, 'E003', '2021-01-01', NULL, NULL,
       'MONTHLY', 300000, false, false, false, false)`);

  await createUser(db, { email: USER_EMAIL, name: "Employees API User" });
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

function userApp() {
  return createApp({
    db,
    verifyJwt: verifier({
      user: claims({ sub: "neon-employees-user", email: USER_EMAIL }),
    }),
  });
}

describe("GET /v1/employees", () => {
  it("401 without Authorization", async () => {
    const app = createApp({ db, verifyJwt: verifier({}) });
    const res = await app.request("/v1/employees");
    expect(res.status).toBe(401);
  });

  it("returns 200 with an array of employee summaries", async () => {
    const app = userApp();
    const res = await app.request("/v1/employees", {
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(3);
  });

  it("derives ACTIVE / TERMINATED status from terminationDate", async () => {
    const app = userApp();
    const res = await app.request(`/v1/employees?companyId=${COMPANY_ID}`, {
      headers: { Authorization: "Bearer user" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ACTIVE_EMPLOYMENT_ID,
          code: "E001",
          name: "Ah Chong",
          companyId: COMPANY_ID,
          status: "ACTIVE",
        }),
        expect.objectContaining({
          id: TERMINATED_EMPLOYMENT_ID,
          code: "E002",
          name: "Siti Nurhaliza",
          companyId: COMPANY_ID,
          status: "TERMINATED",
        }),
      ])
    );
    expect(body).toHaveLength(2);
  });

  it("filters by companyId", async () => {
    const app = userApp();
    const res = await app.request(
      `/v1/employees?companyId=${OTHER_COMPANY_ID}`,
      { headers: { Authorization: "Bearer user" } }
    );
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(OTHER_COMPANY_EMPLOYMENT_ID);
  });

  it("filters by search across name and employee code", async () => {
    const app = userApp();
    const res = await app.request(
      `/v1/employees?companyId=${COMPANY_ID}&search=siti`,
      { headers: { Authorization: "Bearer user" } }
    );
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(TERMINATED_EMPLOYMENT_ID);
  });
});
