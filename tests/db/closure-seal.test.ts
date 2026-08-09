/**
 * @feature control
 * @layer test
 *
 * The closure chain.
 *
 * Nobody outside this system signs for it, so the only thing that makes a
 * closed run's facts hard to revise is that every later closure in the company
 * commits to them. These tests prove the three properties that claim rests on:
 * the chain links, the database refuses to rewrite a seal, and verification
 * actually notices when a closed run's facts stop matching its seal.
 */

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { artifacts } from "@/db/schema/artifacts";
import { payLines } from "@/db/schema/run";
import { closureSeals } from "@/db/schema/seal";
import { MemoryArtifactStore } from "@/domain/artifacts/store";
import { computeSealHash, SEAL_VERSION } from "@/domain/seal/closure-seal";
import { setArtifactStore } from "@/service/artifacts";
import { closeRun } from "@/service/close";
import { getRunSeal, verifyClosureChain } from "@/service/closure-seal";
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

const COMPANY_ID = "eeeeeeee-0000-4000-8000-000000000001";
const PERSON = "eeeeeeee-0000-4000-8000-000000000002";
const EMPLOYMENT = "eeeeeeee-0000-4000-8000-000000000003";
const JULY = "TEST-SEAL-2026-07";
const AUGUST = "TEST-SEAL-2026-08";

let rulePackId: string;

async function bringToClosable(runId: string, month: number): Promise<void> {
  await createRun(db, {
    runId,
    companyId: COMPANY_ID,
    rulePackId,
    year: 2026,
    month,
    periodStart: `2026-0${month}-01`,
    periodEnd: `2026-0${month}-31`,
    workingDays: 26,
    paidDays: 26,
    actor: "seal-test",
  });
  const outcome = await recomputeRun(db, runId, "seal-test");
  if (outcome.failures.length > 0) {
    throw new Error(
      `setup recompute failed: ${JSON.stringify(outcome.failures)}`
    );
  }

  const { revision } = await scanRunFindings(db, runId);
  await reviewRun(db, runId, "reviewer@test", revision);
  await approveRun(db, runId, "approver@test", revision);

  const lines = await db
    .select({ id: payLines.id })
    .from(payLines)
    .where(eq(payLines.runId, runId));
  for (const line of lines) {
    await withdrawLine(db, {
      lineId: line.id,
      reasonCode: "MOVED_TO_OFFCYCLE",
      note: "closed without payment for this test",
      actor: "ops@test",
      postApprovalApprover: "approver@test",
    });
  }
}

async function sealRow(runId: string) {
  const [row] = await db
    .select()
    .from(closureSeals)
    .where(eq(closureSeals.runId, runId));
  if (row === undefined) {
    throw new Error(`no seal for ${runId}`);
  }
  return row;
}

beforeAll(async () => {
  setArtifactStore(store);
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'SEALCO', 'Seal Test Sdn Bhd', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON}, 'SARAH SEAL', '900404-10-0004', '1990-04-04')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
      bank_name, bank_account_no, bank_account_name)
    VALUES (${EMPLOYMENT}, ${PERSON}, ${COMPANY_ID}, 'S001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false,
            'CIMB', '4444444444', 'SARAH SEAL')`);

  await bringToClosable(JULY, 7);
  await bringToClosable(AUGUST, 8);
});

afterAll(async () => {
  await database.close();
});

describe("closure seal", () => {
  it("seals the first closure of a company as genesis", async () => {
    const result = await closeRun(db, JULY, "closer@test", store);

    expect(result.seal.sequence).toBe(1);
    expect(result.seal.previousSealHash).toBeNull();

    const row = await sealRow(JULY);
    expect(row.sealVersion).toBe(SEAL_VERSION);
    expect(row.companyId).toBe(COMPANY_ID);
    expect(row.manifestArtifactId).toBe(result.manifestArtifactId);
    expect(row.sealHash).toBe(result.seal.sealHash);
  });

  it("seals over the manifest's own sha256", async () => {
    const row = await sealRow(JULY);
    const [manifest] = await db
      .select({ sha256: artifacts.sha256 })
      .from(artifacts)
      .where(eq(artifacts.id, row.manifestArtifactId));

    expect(row.manifestSha256).toBe(manifest?.sha256);
  });

  it("recomputes to the stored hash from the stored columns", async () => {
    const row = await sealRow(JULY);
    expect(
      computeSealHash({
        runId: row.runId,
        companyId: row.companyId,
        sequence: row.sequence,
        manifestSha256: row.manifestSha256,
        calcRevision: row.calcRevision,
        approvedRevision: row.approvedRevision,
        closedAt: row.closedAt.toISOString(),
        closedBy: row.closedBy,
        previousSealHash: row.previousSealHash,
      })
    ).toBe(row.sealHash);
  });

  it("links the next closure in the same company to the previous seal", async () => {
    const genesis = await sealRow(JULY);
    const result = await closeRun(db, AUGUST, "closer@test", store);

    expect(result.seal.sequence).toBe(2);
    expect(result.seal.previousSealHash).toBe(genesis.sealHash);
    expect(result.seal.sealHash).not.toBe(genesis.sealHash);
  });

  it("reports the whole chain intact", async () => {
    const chain = await verifyClosureChain(db, COMPANY_ID);

    expect(chain.ok).toBe(true);
    expect(chain.seals.map((s) => s.runId)).toEqual([JULY, AUGUST]);
    expect(chain.seals.every((s) => s.problems.length === 0)).toBe(true);
  });

  it("exposes a run's seal, and nothing for a run that is not closed", async () => {
    const seal = await getRunSeal(db, JULY);
    expect(seal?.sequence).toBe(1);
    expect(seal?.chainLength).toBe(2);

    expect(await getRunSeal(db, "TEST-SEAL-NOT-A-RUN")).toBeNull();
  });

  it("refuses to update a seal", async () => {
    await expectRejected(
      db.execute(
        sql`UPDATE closure_seals SET closed_by = 'someone.else' WHERE run_id = ${JULY}`
      ),
      /append-only/
    );
  });

  it("refuses to delete a seal", async () => {
    await expectRejected(
      db.execute(sql`DELETE FROM closure_seals WHERE run_id = ${JULY}`),
      /append-only/
    );
  });

  /**
   * The seal row itself is unreachable, so the only way to revise a closed run
   * is to edit the run — which is exactly what verification has to catch.
   */
  it("notices when a closed run's facts drift from its seal", async () => {
    await db.execute(
      sql`UPDATE pay_runs SET closed_by = 'ghost@test' WHERE id = ${JULY}`
    );

    const chain = await verifyClosureChain(db, COMPANY_ID);
    const july = chain.seals.find((s) => s.runId === JULY);

    expect(chain.ok).toBe(false);
    expect(july?.ok).toBe(false);
    expect(july?.problems.join(" ")).toMatch(/closedBy/);

    await db.execute(
      sql`UPDATE pay_runs SET closed_by = 'closer@test' WHERE id = ${JULY}`
    );
    expect((await verifyClosureChain(db, COMPANY_ID)).ok).toBe(true);
  });

  /**
   * The immutability trigger already refuses this edit, so the tamper has to
   * be staged with the trigger disabled — which is the honest simulation
   * anyway: the case verification exists for is the edit that did not go
   * through the application, such as a restore from a doctored backup.
   */
  it("notices when the manifest artifact's hash no longer matches", async () => {
    const row = await sealRow(AUGUST);
    const original = row.manifestSha256;

    await db.execute(
      sql`ALTER TABLE artifacts DISABLE TRIGGER artifacts_immutable_when_closed`
    );
    try {
      await db.execute(
        sql`UPDATE artifacts SET sha256 = ${"f".repeat(64)} WHERE id = ${row.manifestArtifactId}`
      );

      const chain = await verifyClosureChain(db, COMPANY_ID);
      const august = chain.seals.find((s) => s.runId === AUGUST);

      expect(august?.ok).toBe(false);
      expect(august?.problems.join(" ")).toMatch(/manifest/i);

      await db.execute(
        sql`UPDATE artifacts SET sha256 = ${original} WHERE id = ${row.manifestArtifactId}`
      );
    } finally {
      await db.execute(
        sql`ALTER TABLE artifacts ENABLE TRIGGER artifacts_immutable_when_closed`
      );
    }
  });
});
