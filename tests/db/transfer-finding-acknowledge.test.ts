/**
 * @feature transfer
 * @layer test
 *
 * POST /v1/transfers/findings/:findingId/acknowledge — authority boundary.
 *
 * The only acknowledgeable transfer findings (`collectTransferCommitFindings`)
 * assert a relationship *between* Employment A and Employment B, and committing
 * the transfer required rights over both companies. So accepting a discrepancy
 * about it must not be reachable from one side alone — the source-only and
 * destination-only cases below are the point of this file, not filler.
 */

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { anomalyFindings } from "@/db/schema/findings";
import {
  rolePermissions,
  roles,
  userRoleAssignments,
  users,
} from "@/db/schema/rbac";
import { transfers } from "@/db/schema/transfer";
import {
  assignUserToRole,
  createRole,
  createUser,
  grantPermission,
} from "@/repo/rbac";
import { createApp } from "@/server/app";
import { AuthError } from "@/server/auth/errors";
import type { NeonAuthClaims, VerifyJwt } from "@/server/auth/jwt";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "./harness/database";

const database = connectTestDatabase();
const { db } = database;

const COMPANY_FROM = "bbbbbbbb-0000-4000-8000-0000000000b1";
const COMPANY_TO = "bbbbbbbb-0000-4000-8000-0000000000b2";
const PERSON_ID = "bbbbbbbb-0000-4000-8000-0000000000b3";
const EMPLOYMENT_FROM = "bbbbbbbb-0000-4000-8000-0000000000b4";
const EMPLOYMENT_TO = "bbbbbbbb-0000-4000-8000-0000000000b5";
const TRANSFER_ID = "bbbbbbbb-0000-4000-8000-0000000000b6";

const REVIEW_FINDING = "bbbbbbbb-0000-4000-8000-0000000000c1";
const BLOCKING_FINDING = "bbbbbbbb-0000-4000-8000-0000000000c2";
const PAY_RUN_FINDING = "bbbbbbbb-0000-4000-8000-0000000000c3";
const UNKNOWN_FINDING = "bbbbbbbb-0000-4000-8000-0000000000cf";

const RUN_ID = "XFER-ACK-2026-07";
const EDITOR_ROLE_CODE = "XFER_ACK_EDITOR";

const BOTH = { token: "both", email: "xfer-ack-both@example.com" };
const DEST_ONLY = { token: "dest", email: "xfer-ack-dest@example.com" };
const SRC_ONLY = { token: "src", email: "xfer-ack-src@example.com" };

let rulePackId = "";
let editorRoleId = "";

function claims(sub: string, email: string): NeonAuthClaims {
  return {
    sub,
    email,
    emailVerified: undefined,
    name: undefined,
    banned: false,
  };
}

function verifier(map: Record<string, NeonAuthClaims>): VerifyJwt {
  return (token) => {
    const found = map[token];
    if (found === undefined) {
      return Promise.reject(new AuthError("UNAUTHORIZED", "unknown token"));
    }
    return Promise.resolve(found);
  };
}

/** Every actor in this file uses the same app; tokens differ, not wiring. */
function app() {
  return createApp({
    db,
    verifyJwt: verifier({
      [BOTH.token]: claims("neon-xfer-both", BOTH.email),
      [DEST_ONLY.token]: claims("neon-xfer-dest", DEST_ONLY.email),
      [SRC_ONLY.token]: claims("neon-xfer-src", SRC_ONLY.email),
    }),
  });
}

/** EMPLOYMENT UPDATE, but only in the companies handed to it. */
async function makeActor(email: string, companyIds: string[]): Promise<void> {
  const user = await createUser(db, { email, name: email });
  for (const companyId of companyIds) {
    await assignUserToRole(db, {
      userId: user.id,
      roleId: editorRoleId,
      companyId,
    });
  }
}

async function insertTransferFinding(
  id: string,
  ruleId: string,
  severity: "REVIEW" | "BLOCKING"
): Promise<void> {
  await db.insert(anomalyFindings).values({
    id,
    transferId: TRANSFER_ID,
    ruleId,
    fingerprint: `${ruleId}:${id}`,
    severity,
    blocks: ["APPROVAL"],
    title: `${ruleId} title`,
    detail: `${ruleId} detail`,
  });
}

function acknowledge(token: string, findingId: string, note?: string) {
  return app().request(`/v1/transfers/findings/${findingId}/acknowledge`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(note === undefined ? {} : { note }),
  });
}

beforeEach(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled) VALUES
      (${COMPANY_FROM}, 'XFROM', 'Transfer Source Sdn Bhd', false),
      (${COMPANY_TO}, 'XTO', 'Transfer Destination Sdn Bhd', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'XFER WORKER', '900202-10-7777', '1990-02-02')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES
      (${EMPLOYMENT_FROM}, ${PERSON_ID}, ${COMPANY_FROM}, 'F001', '2020-01-01',
       'MONTHLY', 500000, false, false, false, false),
      (${EMPLOYMENT_TO}, ${PERSON_ID}, ${COMPANY_TO}, 'T001', '2026-07-01',
       'MONTHLY', 500000, false, false, false, false)`);

  await db.insert(transfers).values({
    id: TRANSFER_ID,
    personId: PERSON_ID,
    fromEmploymentId: EMPLOYMENT_FROM,
    toEmploymentId: EMPLOYMENT_TO,
    effectiveDate: "2026-07-01",
    groupServiceContinuity: "CONTINUOUS",
    actor: "xfer-ack-test",
  });

  await db.delete(userRoleAssignments);
  await db.delete(rolePermissions);
  await db.delete(users);
  await db.delete(roles).where(eq(roles.isSystem, false));

  const role = await createRole(db, {
    code: EDITOR_ROLE_CODE,
    name: "Transfer finding editor",
    scope: "COMPANY",
  });
  editorRoleId = role.id;
  await grantPermission(db, editorRoleId, "EMPLOYMENT", "UPDATE");
});

afterAll(async () => {
  await database.close();
});

describe("transfer finding acknowledgement — authority", () => {
  it("acknowledges when the actor holds EMPLOYMENT UPDATE in both companies", async () => {
    await makeActor(BOTH.email, [COMPANY_FROM, COMPANY_TO]);
    await insertTransferFinding(
      REVIEW_FINDING,
      "SERVICE_DATES_INCONSISTENT",
      "REVIEW"
    );

    const res = await acknowledge(
      BOTH.token,
      REVIEW_FINDING,
      "dates confirmed with HR"
    );
    expect(res.status).toBe(200);

    const [row] = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.id, REVIEW_FINDING));
    expect(row?.status).toBe("ACKNOWLEDGED");
    expect(row?.ackActor).toBe(BOTH.email);
    expect(row?.ackNote).toBe("dates confirmed with HR");
    expect(row?.ackAt).not.toBeNull();
  });

  it("rejects an actor holding rights only in the destination company", async () => {
    await makeActor(DEST_ONLY.email, [COMPANY_TO]);
    await insertTransferFinding(
      REVIEW_FINDING,
      "SERVICE_DATES_INCONSISTENT",
      "REVIEW"
    );

    const res = await acknowledge(DEST_ONLY.token, REVIEW_FINDING, "one-sided");
    expect(res.status).toBe(403);

    const [row] = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.id, REVIEW_FINDING));
    expect(row?.status).toBe("OPEN");
    expect(row?.ackActor).toBeNull();
  });

  it("rejects an actor holding rights only in the source company", async () => {
    await makeActor(SRC_ONLY.email, [COMPANY_FROM]);
    await insertTransferFinding(
      REVIEW_FINDING,
      "SERVICE_DATES_INCONSISTENT",
      "REVIEW"
    );

    const res = await acknowledge(SRC_ONLY.token, REVIEW_FINDING, "one-sided");
    expect(res.status).toBe(403);

    const [row] = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.id, REVIEW_FINDING));
    expect(row?.status).toBe("OPEN");
  });
});

describe("transfer finding acknowledgement — applicability", () => {
  it("does not accept a pay-run finding on the transfer surface", async () => {
    await makeActor(BOTH.email, [COMPANY_FROM, COMPANY_TO]);
    await db.execute(sql`
      INSERT INTO pay_runs (
        id, company_id, rule_pack_id, year, month,
        period_start, period_end, working_days, status, created_by)
      VALUES (
        ${RUN_ID}, ${COMPANY_TO}, ${rulePackId}, 2026, 7,
        '2026-07-01', '2026-07-31', 22, 'DRAFT', 'xfer-ack-test')`);
    await db.insert(anomalyFindings).values({
      id: PAY_RUN_FINDING,
      runId: RUN_ID,
      ruleId: "PERSON_IN_BOTH_EMPLOYERS",
      fingerprint: `PERSON_IN_BOTH_EMPLOYERS:${PAY_RUN_FINDING}`,
      severity: "WARNING",
      blocks: ["APPROVAL"],
      title: "run-scoped",
      detail: "belongs to acknowledgeRunFinding",
    });

    const res = await acknowledge(BOTH.token, PAY_RUN_FINDING, "wrong surface");
    expect(res.status).toBe(404);

    const [row] = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.id, PAY_RUN_FINDING));
    expect(row?.status).toBe("OPEN");
  });

  it("returns 404 for an unknown finding id", async () => {
    await makeActor(BOTH.email, [COMPANY_FROM, COMPANY_TO]);
    const res = await acknowledge(BOTH.token, UNKNOWN_FINDING, "nothing there");
    expect(res.status).toBe(404);
  });

  it("refuses to acknowledge a BLOCKING finding", async () => {
    await makeActor(BOTH.email, [COMPANY_FROM, COMPANY_TO]);
    await insertTransferFinding(
      BLOCKING_FINDING,
      "TRANSFER_OVERLAP_DATES",
      "BLOCKING"
    );

    const res = await acknowledge(
      BOTH.token,
      BLOCKING_FINDING,
      "cannot wave this through"
    );
    expect(res.status).toBe(409);

    const [row] = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.id, BLOCKING_FINDING));
    expect(row?.status).toBe("OPEN");
  });

  it("re-acknowledging an already-acknowledged finding stays acknowledged", async () => {
    await makeActor(BOTH.email, [COMPANY_FROM, COMPANY_TO]);
    await insertTransferFinding(
      REVIEW_FINDING,
      "SERVICE_DATES_INCONSISTENT",
      "REVIEW"
    );

    const first = await acknowledge(BOTH.token, REVIEW_FINDING, "first pass");
    expect(first.status).toBe(200);
    const second = await acknowledge(BOTH.token, REVIEW_FINDING, "second pass");
    expect(second.status).toBe(200);

    const [row] = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.id, REVIEW_FINDING));
    expect(row?.status).toBe("ACKNOWLEDGED");
    expect(row?.ackNote).toBe("second pass");
  });

  it("rejects an unauthenticated request", async () => {
    await insertTransferFinding(
      REVIEW_FINDING,
      "SERVICE_DATES_INCONSISTENT",
      "REVIEW"
    );
    const res = await app().request(
      `/v1/transfers/findings/${REVIEW_FINDING}/acknowledge`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "anonymous" }),
      }
    );
    expect(res.status).toBe(401);
  });
});
