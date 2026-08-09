/**
 * Phase 6 control invariants — scan stamp, revision-bound review/approve,
 * frozen findings, READY payment projection.
 */

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { linePayments } from "@/db/schema/control";
import { anomalyFindings } from "@/db/schema/findings";
import { payLines, payRuns } from "@/db/schema/run";
import { ControlError } from "@/service/control-errors";
import { evaluateGate } from "@/service/gates";
import {
  approveRun,
  createRun,
  recomputeRun,
  reviewRun,
} from "@/service/payrun";
import { acknowledgeRunFinding, scanRunFindings } from "@/service/run-findings";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "./harness/database";

const database = connectTestDatabase();
const { db } = database;

const COMPANY_ID = "cccccccc-0000-4000-8000-0000000000c6";
const PERSON_ID = "cccccccc-0000-4000-8000-0000000000d6";
const EMPLOYMENT_ID = "cccccccc-0000-4000-8000-0000000000e6";
const RUN_ID = "P6-GATES-2026-07";

let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'P6CO', 'Phase6 Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'P6 WORKER', '900101-10-6666', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
      bank_name, bank_account_no, bank_account_name)
    VALUES (${EMPLOYMENT_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'P6001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false,
            'OCBC', '1234567890', 'P6 WORKER')`);
});

beforeEach(async () => {
  await database.truncate(
    "finding_events",
    "anomaly_findings",
    "gate_certifications",
    "line_payments",
    "pay_line_items",
    "pay_lines",
    "pay_runs",
    "audit_events"
  );
});

afterAll(async () => {
  await database.close();
});

async function setupComputedRun(): Promise<string> {
  await createRun(db, {
    runId: RUN_ID,
    companyId: COMPANY_ID,
    rulePackId,
    year: 2026,
    month: 7,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    workingDays: 22,
    paidDays: 22,
    actor: "tester@example.com",
  });
  const outcome = await recomputeRun(db, RUN_ID, "tester@example.com");
  if (outcome.failures.length > 0) {
    throw new Error(
      `setup recompute failed: ${JSON.stringify(outcome.failures)}`
    );
  }
  const [run] = await db
    .select()
    .from(payRuns)
    .where(eq(payRuns.id, RUN_ID))
    .limit(1);
  if (!run?.calcRevision) {
    throw new Error("setup did not produce a calcRevision");
  }
  if (run.findingsScannedRevision !== run.calcRevision) {
    throw new Error("setup findings scan did not stamp calcRevision");
  }
  return run.calcRevision;
}

describe("Phase 6 gates", () => {
  it("blocks REVIEW when scan stamp is stale", async () => {
    const revision = await setupComputedRun();
    await db
      .update(payRuns)
      .set({ findingsScannedRevision: null })
      .where(eq(payRuns.id, RUN_ID));

    const gate = await evaluateGate(db, RUN_ID, "REVIEW");
    expect(gate.ok).toBe(false);
    expect(gate.issues.some((i) => i.code === "SCAN_INCOMPLETE")).toBe(true);

    await expect(
      reviewRun(db, RUN_ID, "tester@example.com", revision)
    ).rejects.toBeInstanceOf(ControlError);
  });

  it("reviews and approves with READY line_payments; freezes findings", async () => {
    const revision = await setupComputedRun();

    // Acknowledge any non-blocking open findings that would block APPROVAL
    const findings = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.runId, RUN_ID));
    for (const f of findings) {
      if (f.severity === "INFO" || f.status !== "OPEN") {
        continue;
      }
      if (f.severity === "BLOCKING") {
        // Clear bank / pcb conditions — fixture already disables statutory schemes
        throw new Error(`unexpected BLOCKING finding: ${f.ruleId}`);
      }
      await acknowledgeRunFinding(
        db,
        f.id,
        "tester@example.com",
        f.severity === "WARNING" ? "reviewed" : undefined
      );
    }

    await reviewRun(db, RUN_ID, "tester@example.com", revision);
    const [reviewed] = await db
      .select()
      .from(payRuns)
      .where(eq(payRuns.id, RUN_ID));
    expect(reviewed?.status).toBe("REVIEWED");
    expect(reviewed?.reviewedRevision).toBe(revision);

    await approveRun(db, RUN_ID, "tester@example.com", revision);
    const [approved] = await db
      .select()
      .from(payRuns)
      .where(eq(payRuns.id, RUN_ID));
    expect(approved?.status).toBe("APPROVED");
    expect(approved?.approvedRevision).toBe(revision);

    const payments = await db.select().from(linePayments);
    const lines = await db
      .select()
      .from(payLines)
      .where(eq(payLines.runId, RUN_ID));
    expect(payments).toHaveLength(lines.length);
    expect(payments.every((p) => p.state === "READY")).toBe(true);

    // Idempotent READY insert
    const { createReadyPaymentsForRun } = await import("@/service/payments");
    const again = await createReadyPaymentsForRun(db, RUN_ID);
    expect(again).toBe(0);

    await expect(scanRunFindings(db, RUN_ID)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });

    // evaluateGate RELEASE/CLOSE must not write
    const before = await db.select().from(anomalyFindings);
    await evaluateGate(db, RUN_ID, "RELEASE");
    await evaluateGate(db, RUN_ID, "CLOSE");
    const after = await db.select().from(anomalyFindings);
    expect(after).toEqual(before);
  });

  it("refuses recompute on APPROVED at the service layer", async () => {
    const revision = await setupComputedRun();
    const findings = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.runId, RUN_ID));
    for (const f of findings) {
      if (
        f.status === "OPEN" &&
        f.severity !== "BLOCKING" &&
        f.severity !== "INFO"
      ) {
        await acknowledgeRunFinding(
          db,
          f.id,
          "tester@example.com",
          f.severity === "WARNING" ? "ok" : undefined
        );
      }
    }
    await reviewRun(db, RUN_ID, "tester@example.com", revision);
    await approveRun(db, RUN_ID, "tester@example.com", revision);

    await expect(
      recomputeRun(db, RUN_ID, "tester@example.com")
    ).rejects.toMatchObject({
      code: "INVALID_STATE",
      message: expect.stringContaining("APPROVED"),
    });

    const [run] = await db.select().from(payRuns).where(eq(payRuns.id, RUN_ID));
    expect(run?.status).toBe("APPROVED");
    expect(run?.calcRevision).toBe(revision);
  });

  it("rejects stale approval after recompute", async () => {
    const r1 = await setupComputedRun();
    const findings = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.runId, RUN_ID));
    for (const f of findings) {
      if (
        f.status === "OPEN" &&
        f.severity !== "BLOCKING" &&
        f.severity !== "INFO"
      ) {
        await acknowledgeRunFinding(
          db,
          f.id,
          "tester@example.com",
          f.severity === "WARNING" ? "ok" : undefined
        );
      }
    }
    await reviewRun(db, RUN_ID, "tester@example.com", r1);

    await recomputeRun(db, RUN_ID, "tester@example.com");
    const [run] = await db.select().from(payRuns).where(eq(payRuns.id, RUN_ID));
    expect(run?.status).toBe("DRAFT");
    expect(run?.reviewedRevision).toBeNull();

    // Review certification cleared — approval cannot proceed from DRAFT.
    await expect(
      approveRun(db, RUN_ID, "tester@example.com", run!.calcRevision!)
    ).rejects.toMatchObject({ code: "INVALID_STATE" });

    // After a fresh review at R2, a body still carrying a wrong revision is rejected.
    const [afterRecompute] = await db
      .select()
      .from(payRuns)
      .where(eq(payRuns.id, RUN_ID));
    const r2 = afterRecompute!.calcRevision!;
    const postFindings = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.runId, RUN_ID));
    for (const f of postFindings) {
      if (
        f.status === "OPEN" &&
        f.severity !== "BLOCKING" &&
        f.severity !== "INFO"
      ) {
        await acknowledgeRunFinding(
          db,
          f.id,
          "tester@example.com",
          f.severity === "WARNING" ? "ok" : undefined
        );
      }
    }
    await reviewRun(db, RUN_ID, "tester@example.com", r2);
    await expect(
      approveRun(db, RUN_ID, "tester@example.com", `${r2}00`)
    ).rejects.toMatchObject({ code: "STALE_REVISION" });
  });
});
