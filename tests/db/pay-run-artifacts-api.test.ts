/**
 * Pay-run artifact HTTP surface: list, signed URL, content stream, run scoping.
 */

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { roles, userRoleAssignments, users } from "@/db/schema/rbac";
import { MemoryArtifactStore } from "@/domain/artifacts/store";
import { SYSTEM_ADMIN_ROLE_CODE } from "@/domain/rbac/types";
import { assignUserToRole, createUser, getRoleByCode } from "@/repo/rbac";
import { createApp } from "@/server/app";
import { AuthError } from "@/server/auth/errors";
import type { NeonAuthClaims, VerifyJwt } from "@/server/auth/jwt";
import { setArtifactStore, storeArtifact } from "@/service/artifacts";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "./harness/database";

const database = connectTestDatabase();
const { db } = database;
const store = new MemoryArtifactStore();

const COMPANY_ID = "aaaaaaaa-0000-4000-8000-0000000000a1";
const PERSON_ID = "aaaaaaaa-0000-4000-8000-0000000000a2";
const EMPLOYMENT_ID = "aaaaaaaa-0000-4000-8000-0000000000a3";
const RUN_A = "API-ART-A-2026-07";
const RUN_B = "API-ART-B-2026-07";
const ADMIN_EMAIL = "artifacts-api-admin@example.com";

let rulePackId = "";

beforeEach(async () => {
  setArtifactStore(store);
  store.clear();
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'ARTAPI', 'Artifacts API Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'ART API WORKER', '900101-10-8888', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES (${EMPLOYMENT_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'A001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false)`);

  await db.delete(userRoleAssignments);
  await db.delete(users);
  await db.delete(roles).where(eq(roles.isSystem, false));
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
  const user = await createUser(db, { email, name: "Artifacts Admin" });
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
      admin: claims({ sub: "neon-artifacts-admin", email: ADMIN_EMAIL }),
    }),
    artifactStore: store,
  });
}

async function insertDraftRun(
  runId: string,
  month: number,
  periodStart: string,
  periodEnd: string
): Promise<void> {
  await db.execute(sql`
    INSERT INTO pay_runs (
      id, company_id, rule_pack_id, year, month,
      period_start, period_end, working_days, status, created_by)
    VALUES (
      ${runId}, ${COMPANY_ID}, ${rulePackId}, 2026, ${month},
      ${periodStart}, ${periodEnd}, 22, 'DRAFT', 'artifacts-api-test')`);
}

describe("pay-run artifacts API", () => {
  it("lists artifacts for the run", async () => {
    await makeAdmin(ADMIN_EMAIL);
    await insertDraftRun(RUN_A, 7, "2026-07-01", "2026-07-31");
    await storeArtifact(db, {
      runId: RUN_A,
      type: "EVIDENCE",
      filename: "note.txt",
      body: new TextEncoder().encode("hello"),
      mimeType: "text/plain",
      createdBy: "artifacts-api-test",
      source: "ATTACHED",
    });

    const app = adminApp();
    const res = await app.request(`/v1/pay-runs/${RUN_A}/artifacts`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      artifacts: {
        id: string;
        type: string;
        relativePath: string;
        createdAt: string;
      }[];
    };
    expect(body.artifacts).toHaveLength(1);
    expect(body.artifacts[0]?.type).toBe("EVIDENCE");
    expect(body.artifacts[0]?.relativePath).toContain("note.txt");
    expect(body.artifacts[0]?.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
    );
  });

  it("returns content for matching runId", async () => {
    await makeAdmin(ADMIN_EMAIL);
    await insertDraftRun(RUN_A, 7, "2026-07-01", "2026-07-31");
    const stored = await storeArtifact(db, {
      runId: RUN_A,
      type: "EVIDENCE",
      filename: "proof.bin",
      body: new Uint8Array([1, 2, 3, 4]),
      mimeType: "application/octet-stream",
      createdBy: "artifacts-api-test",
      source: "ATTACHED",
    });

    const app = adminApp();
    const contentRes = await app.request(
      `/v1/pay-runs/${RUN_A}/artifacts/${stored.id}/content`,
      { headers: { Authorization: "Bearer admin" } }
    );
    expect(contentRes.status).toBe(200);
    expect(contentRes.headers.get("Content-Type")).toBe(
      "application/octet-stream"
    );
    expect(contentRes.headers.get("Content-Disposition")).toBe(
      'attachment; filename="proof.bin"'
    );
    const bytes = new Uint8Array(await contentRes.arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3, 4]);
  });

  it("404s content when artifact belongs to another run", async () => {
    await makeAdmin(ADMIN_EMAIL);
    await insertDraftRun(RUN_A, 7, "2026-07-01", "2026-07-31");
    await insertDraftRun(RUN_B, 8, "2026-08-01", "2026-08-31");
    const stored = await storeArtifact(db, {
      runId: RUN_A,
      type: "EVIDENCE",
      filename: "secret.txt",
      body: new TextEncoder().encode("secret"),
      mimeType: "text/plain",
      createdBy: "artifacts-api-test",
      source: "ATTACHED",
    });

    const app = adminApp();
    const contentRes = await app.request(
      `/v1/pay-runs/${RUN_B}/artifacts/${stored.id}/content`,
      { headers: { Authorization: "Bearer admin" } }
    );
    expect(contentRes.status).toBe(404);
  });
});
