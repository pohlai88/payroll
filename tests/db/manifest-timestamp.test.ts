/**
 * RFC 3161 timestamping of the closure manifest.
 *
 * The authority is stubbed: no test may depend on a third party being up, and
 * no offline fixture can be a valid token over a manifest hash that changes
 * every run. What is proved here is the part this system owns — that the hash
 * sent to the authority is the manifest's own sha256, that the reply is stored
 * as an artifact of the closed run, that a failed authority never blocks
 * closure, and that stamping later is safe and does not run twice.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { artifacts } from "@/db/schema/artifacts";
import { auditEvents, payLines, payRuns } from "@/db/schema/run";
import { MemoryArtifactStore } from "@/domain/artifacts/store";
import type { TimestampResult } from "@/domain/timestamp/client";
import { setArtifactStore } from "@/service/artifacts";
import { closeRun } from "@/service/close";
import {
  type TimestampRequester,
  timestampClosureManifest,
} from "@/service/manifest-timestamp";
import { withdrawLine } from "@/service/payments";
import {
  approveRun,
  createRun,
  recomputeRun,
  reviewRun,
} from "@/service/payrun";
import { scanRunFindings } from "@/service/run-findings";
import { seed } from "../../scripts/seed";
import {
  ALL_TABLES,
  connectTestDatabase,
  expectRejected,
} from "./harness/database";

const database = connectTestDatabase();
const { db } = database;
const store = new MemoryArtifactStore();

const COMPANY_ID = "dddddddd-0000-4000-8000-000000000001";
const PERSON = "dddddddd-0000-4000-8000-000000000002";
const EMPLOYMENT = "dddddddd-0000-4000-8000-000000000003";
const RUN_ID = "TEST-TSA-2026-07";
const TSA_URL = "http://timestamp.digicert.com";

const REPLY = new Uint8Array(
  readFileSync(
    path.resolve(import.meta.dirname, "../fixtures/digicert-timestamp.tsr")
  )
);
const REPLY_SHA256 = createHash("sha256").update(REPLY).digest("hex");
const GEN_TIME = new Date("2026-08-09T07:04:05.000Z");

const stampedHashes: string[] = [];

const stubAuthority: TimestampRequester = (input) => {
  stampedHashes.push(input.hashHex);
  return Promise.resolve<TimestampResult>({
    tsaUrl: input.url,
    reply: REPLY,
    token: REPLY.subarray(9),
    genTime: GEN_TIME,
    serialNumber: "0a1b2c3d",
    policyOid: "2.16.840.1.114412.7.1",
  });
};

const deadAuthority: TimestampRequester = () =>
  Promise.reject(new Error("connect ETIMEDOUT 1.2.3.4:80"));

async function manifestSha256(): Promise<string> {
  const [run] = await db
    .select({ manifestId: payRuns.closedManifestArtifactId })
    .from(payRuns)
    .where(eq(payRuns.id, RUN_ID));
  const [manifest] = await db
    .select({ sha256: artifacts.sha256 })
    .from(artifacts)
    .where(eq(artifacts.id, run?.manifestId as string));
  return manifest?.sha256 as string;
}

async function tokenRows() {
  return await db
    .select()
    .from(artifacts)
    .where(
      and(eq(artifacts.runId, RUN_ID), eq(artifacts.type, "TIMESTAMP_TOKEN"))
    );
}

beforeAll(async () => {
  setArtifactStore(store);
  await database.truncate(...ALL_TABLES);
  const rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'TSACO', 'Timestamp Test Sdn Bhd', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON}, 'TARA TIMESTAMP', '900303-10-0003', '1990-03-03')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
      bank_name, bank_account_no, bank_account_name)
    VALUES (${EMPLOYMENT}, ${PERSON}, ${COMPANY_ID}, 'T001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false,
            'CIMB', '3333333333', 'TARA TIMESTAMP')`);

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
    actor: "tsa-test",
  });
  const outcome = await recomputeRun(db, RUN_ID, "tsa-test");
  if (outcome.failures.length > 0) {
    throw new Error(
      `setup recompute failed: ${JSON.stringify(outcome.failures)}`
    );
  }

  const { revision } = await scanRunFindings(db, RUN_ID);
  await reviewRun(db, RUN_ID, "reviewer@test", revision);
  await approveRun(db, RUN_ID, "approver@test", revision);

  const lines = await db
    .select({ id: payLines.id })
    .from(payLines)
    .where(eq(payLines.runId, RUN_ID));
  for (const line of lines) {
    await withdrawLine(db, {
      lineId: line.id,
      reasonCode: "MOVED_TO_OFFCYCLE",
      note: "closed without payment for this test",
      actor: "ops@test",
      postApprovalApprover: "approver@test",
    });
  }
});

afterAll(async () => {
  await database.close();
});

describe("closure manifest timestamping", () => {
  it("closes the run even when the authority is unreachable", async () => {
    const result = await closeRun(db, RUN_ID, "closer@test", store, {
      tsaUrl: TSA_URL,
      request: deadAuthority,
    });

    expect(result.manifestArtifactId).toBeTruthy();
    expect(result.timestamp.state).toBe("FAILED");
    expect(result.timestamp.detail).toMatch(/ETIMEDOUT/);

    const [run] = await db.select().from(payRuns).where(eq(payRuns.id, RUN_ID));
    expect(run?.status).toBe("CLOSED");
    expect(await tokenRows()).toHaveLength(0);
  });

  it("stamps the manifest's own sha256 after the fact", async () => {
    const outcome = await timestampClosureManifest(db, RUN_ID, "ops@test", {
      tsaUrl: TSA_URL,
      request: stubAuthority,
      store,
    });

    expect(outcome.state).toBe("STAMPED");
    expect(outcome.genTime).toBe(GEN_TIME.toISOString());
    expect(stampedHashes).toEqual([await manifestSha256()]);

    const [token] = await tokenRows();
    expect(token?.id).toBe(outcome.tokenArtifactId);
    expect(token?.sha256).toBe(REPLY_SHA256);
    expect(token?.mimeType).toBe("application/timestamp-reply");
    expect(token?.relativePath).toMatch(/manifest\.json\.tsr$/);
    expect(await store.get(token?.relativePath as string)).toEqual(REPLY);
  });

  it("records the authority, its genTime and serial in the audit trail", async () => {
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.runId, RUN_ID),
          eq(auditEvents.action, "TIMESTAMP_MANIFEST")
        )
      );

    expect(event?.after).toMatchObject({
      tsaUrl: TSA_URL,
      genTime: GEN_TIME.toISOString(),
      serialNumber: "0a1b2c3d",
      stampedSha256: await manifestSha256(),
    });
  });

  it("does not stamp a manifest twice", async () => {
    const before = stampedHashes.length;

    const outcome = await timestampClosureManifest(db, RUN_ID, "ops@test", {
      tsaUrl: TSA_URL,
      request: stubAuthority,
      store,
    });

    expect(outcome.state).toBe("ALREADY_STAMPED");
    expect(stampedHashes).toHaveLength(before);
    expect(await tokenRows()).toHaveLength(1);
  });

  it("skips silently when no authority is configured", async () => {
    const outcome = await timestampClosureManifest(db, RUN_ID, "ops@test", {
      tsaUrl: null,
      request: stubAuthority,
      store,
    });

    expect(outcome.state).toBe("SKIPPED");
    expect(outcome.tokenArtifactId).toBeNull();
  });

  /**
   * The carve-out that lets a token land after closure is exactly that: a
   * token. Nothing else may be written, and the token itself cannot be
   * rewritten once it is there.
   */
  it("still freezes every other artifact write after closure", async () => {
    await expectRejected(
      db.insert(artifacts).values({
        runId: RUN_ID,
        entityType: "PAY_RUN",
        entityId: RUN_ID,
        type: "EVIDENCE",
        relativePath: `runs/${RUN_ID}/sneaky.pdf`,
        sha256: "0".repeat(64),
        byteSize: 1,
        mimeType: "application/pdf",
        source: "ATTACHED",
        createdBy: "attacker@test",
      }),
      /CLOSED/
    );

    const [token] = await tokenRows();
    await expectRejected(
      db
        .update(artifacts)
        .set({ sha256: "1".repeat(64) })
        .where(eq(artifacts.id, token?.id as string)),
      /CLOSED/
    );
  });
});
