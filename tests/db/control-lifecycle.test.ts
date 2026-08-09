/**
 * @feature control
 * @layer test
 *
 * Phase 6–7 lean control lifecycle against real Postgres + in-memory artifacts.
 *
 * approve → release (1 hold) → mixed settle → retry → withdraw held →
 * distribute → reconcile → close → post-close writes fail.
 */

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { linePayments, paymentAttempts } from "@/db/schema/control";
import { payLines, payRuns } from "@/db/schema/run";
import { MemoryArtifactStore } from "@/domain/artifacts/store";
import { setArtifactStore } from "@/service/artifacts";
import {
  closeRun,
  closureChecklist,
  reconcileAttempt,
  recordDistribution,
} from "@/service/close";
import { holdLine, withdrawLine } from "@/service/payments";
import {
  approveRun,
  createRun,
  recomputeRun,
  reviewRun,
} from "@/service/payrun";
import { commitRelease, settleAttempt } from "@/service/release";
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

const COMPANY_ID = "cccccccc-0000-4000-8000-000000000001";
const PERSON_A = "cccccccc-0000-4000-8000-000000000002";
const PERSON_B = "cccccccc-0000-4000-8000-000000000003";
const EMP_A = "cccccccc-0000-4000-8000-000000000004";
const EMP_B = "cccccccc-0000-4000-8000-000000000005";
const RUN_ID = "TEST-CTRL-2026-07";

beforeAll(async () => {
  setArtifactStore(store);
  await database.truncate(...ALL_TABLES);
  const rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'CTRLCO', 'Control Test Sdn Bhd', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob) VALUES
      (${PERSON_A}, 'ALICE CONTROL', '900101-10-0001', '1990-01-01'),
      (${PERSON_B}, 'BOB CONTROL', '900202-10-0002', '1990-02-02')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
      bank_name, bank_account_no, bank_account_name)
    VALUES
      (${EMP_A}, ${PERSON_A}, ${COMPANY_ID}, 'C001', '2020-01-01',
       'MONTHLY', 500000, false, false, false, false,
       'OCBC', '1111111111', 'ALICE CONTROL'),
      (${EMP_B}, ${PERSON_B}, ${COMPANY_ID}, 'C002', '2020-01-01',
       'MONTHLY', 400000, false, false, false, false,
       'MAYBANK', '2222222222', 'BOB CONTROL')`);

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
    actor: "control-test",
  });
  const outcome = await recomputeRun(db, RUN_ID, "control-test");
  if (outcome.failures.length > 0) {
    throw new Error(
      `setup recompute failed: ${JSON.stringify(outcome.failures)}`
    );
  }
});

afterAll(async () => {
  await database.close();
});

describe("control lifecycle", () => {
  it("reviews, approves, releases, settles, closes with manifest", async () => {
    const { revision } = await scanRunFindings(db, RUN_ID);
    expect(revision).toBeTruthy();

    await reviewRun(db, RUN_ID, "reviewer@test", revision);
    await approveRun(db, RUN_ID, "approver@test", revision);

    const [run] = await db.select().from(payRuns).where(eq(payRuns.id, RUN_ID));
    expect(run?.status).toBe("APPROVED");
    expect(run?.calcRevision).toBeTruthy();

    const lines = await db
      .select({ id: payLines.id, employmentId: payLines.employmentId })
      .from(payLines)
      .where(eq(payLines.runId, RUN_ID));
    expect(lines).toHaveLength(2);

    const lineA = lines.find((l) => l.employmentId === EMP_A)?.id;
    const lineB = lines.find((l) => l.employmentId === EMP_B)?.id;
    if (lineA === undefined || lineB === undefined) {
      throw new Error("missing lines");
    }

    await holdLine(db, lineB, "verify address", "ops@test");

    const { batchId } = await commitRelease(db, RUN_ID, [lineA, lineB], {
      method: "BANK",
      actor: "ops@test",
      store,
    });

    const paymentsAfterRelease = await db.select().from(linePayments);
    expect(paymentsAfterRelease.find((p) => p.lineId === lineA)?.state).toBe(
      "RELEASED"
    );
    expect(paymentsAfterRelease.find((p) => p.lineId === lineB)?.state).toBe(
      "HOLD"
    );

    const attempts = await db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.batchId, batchId));
    expect(attempts).toHaveLength(1);

    const [attemptA] = attempts;
    if (attemptA === undefined) {
      throw new Error("missing attempt");
    }

    await settleAttempt(db, attemptA.id, {
      outcome: "FAILED",
      actor: "ops@test",
      failedReason: "account closed",
    });

    const { batchId: batch2 } = await commitRelease(db, RUN_ID, [lineA], {
      method: "BANK",
      actor: "ops@test",
      store,
    });
    const retryAttempts = await db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.batchId, batch2));
    const [retry] = retryAttempts;
    if (retry === undefined) {
      throw new Error("missing retry");
    }

    await settleAttempt(db, retry.id, {
      outcome: "PAID",
      actor: "ops@test",
      paymentRef: "OCBC-OK-1",
    });

    await withdrawLine(db, {
      lineId: lineB,
      reasonCode: "MOVED_TO_OFFCYCLE",
      note: "pay next month off-cycle",
      actor: "ops@test",
      postApprovalApprover: "approver@test",
    });

    await recordDistribution(db, {
      lineId: lineA,
      channel: "GENERATED",
      actor: "ops@test",
    });

    await reconcileAttempt(db, retry.id, "ops@test");

    const checklist = await closureChecklist(db, RUN_ID);
    expect(checklist.every((c) => c.ok)).toBe(true);

    const { manifestArtifactId } = await closeRun(
      db,
      RUN_ID,
      "closer@test",
      store
    );
    expect(manifestArtifactId).toBeTruthy();

    const [closed] = await db
      .select()
      .from(payRuns)
      .where(eq(payRuns.id, RUN_ID));
    expect(closed?.status).toBe("CLOSED");
    expect(closed?.closedManifestArtifactId).toBe(manifestArtifactId);

    await expectRejected(
      db
        .update(linePayments)
        .set({ holdReason: "tamper" })
        .where(eq(linePayments.lineId, lineA)),
      /CLOSED/
    );
  });
});
