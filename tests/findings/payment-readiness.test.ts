/**
 * P0A — RELEASE line-scoped partial release vs run-scoped fail-closed.
 */

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anomalyFindings } from "@/db/schema/findings";
import { employments } from "@/db/schema/parties";
import { payLines, payRuns } from "@/db/schema/run";
import {
  approveRun,
  createRun,
  recomputeRun,
  reviewRun,
} from "@/service/payrun";
import { previewRelease } from "@/service/release";
import { acknowledgeRunFinding, scanRunFindings } from "@/service/run-findings";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "../db/harness/database";

const database = connectTestDatabase();
const { db } = database;

const COMPANY_ID = "dddddddd-0000-4000-8000-0000000000c3";
const PERSON_A = "dddddddd-0000-4000-8000-0000000000d3";
const PERSON_B = "dddddddd-0000-4000-8000-0000000000d4";
const EMP_A = "dddddddd-0000-4000-8000-0000000000e3";
const EMP_B = "dddddddd-0000-4000-8000-0000000000e4";
const RUN_ID = "REL-READY-2026-07";

let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'RELCO', 'Release Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob) VALUES
      (${PERSON_A}, 'WORKER A', '900101-10-3333', '1990-01-01'),
      (${PERSON_B}, 'WORKER B', '900102-10-3334', '1990-01-02')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
      bank_name, bank_account_no, bank_account_name)
    VALUES
      (${EMP_A}, ${PERSON_A}, ${COMPANY_ID}, 'R001', '2020-01-01',
       'MONTHLY', 500000, false, false, false, false,
       NULL, NULL, NULL),
      (${EMP_B}, ${PERSON_B}, ${COMPANY_ID}, 'R002', '2020-01-01',
       'MONTHLY', 500000, false, false, false, false,
       'MAYBANK', '9999888877', 'WORKER B')`);
});

beforeEach(async () => {
  await database.truncate(
    "finding_events",
    "anomaly_findings",
    "gate_certifications",
    "payment_attempts",
    "release_batches",
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

async function approveCleanFindings(revision: string): Promise<void> {
  const findings = await db
    .select()
    .from(anomalyFindings)
    .where(eq(anomalyFindings.runId, RUN_ID));
  await Promise.all(
    findings
      .filter(
        (f) =>
          f.severity !== "BLOCKING" &&
          f.severity !== "INFO" &&
          f.status === "OPEN" &&
          (f.blocks as string[]).includes("APPROVAL")
      )
      .map((f) =>
        acknowledgeRunFinding(
          db,
          f.id,
          "tester@example.com",
          f.severity === "WARNING" ? "ok" : undefined
        )
      )
  );
  await reviewRun(db, RUN_ID, "tester@example.com", revision);
  await approveRun(db, RUN_ID, "tester@example.com", revision);
}

describe("release controls", () => {
  it("line-scoped BANK_DETAILS_MISSING excludes only the affected line", async () => {
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
    expect(outcome.failures).toHaveLength(0);

    const [run] = await db.select().from(payRuns).where(eq(payRuns.id, RUN_ID));
    const revision = run!.calcRevision!;
    await approveCleanFindings(revision);

    const lines = await db
      .select()
      .from(payLines)
      .where(eq(payLines.runId, RUN_ID));
    const lineA = lines.find((l) => l.employmentId === EMP_A)?.id;
    const lineB = lines.find((l) => l.employmentId === EMP_B)?.id;
    expect(lineA && lineB).toBeTruthy();

    const bankFinding = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.ruleId, "BANK_DETAILS_MISSING"));
    expect(bankFinding.some((f) => f.lineId === lineA)).toBe(true);

    const preview = await previewRelease(db, RUN_ID, [lineA!, lineB!]);
    expect(preview.eligible.map((e) => e.lineId)).toEqual([lineB]);
    expect(preview.excluded.some((e) => e.lineId === lineA)).toBe(true);
  });

  it("run-scoped RELEASE issue excludes every selected line", async () => {
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
    await recomputeRun(db, RUN_ID, "tester@example.com");
    const [run] = await db.select().from(payRuns).where(eq(payRuns.id, RUN_ID));
    await approveCleanFindings(run!.calcRevision!);

    const lines = await db
      .select()
      .from(payLines)
      .where(eq(payLines.runId, RUN_ID));
    const ids = lines.map((l) => l.id);

    await db.insert(anomalyFindings).values({
      runId: RUN_ID,
      lineId: null,
      ruleId: "BANK_DETAILS_MISSING",
      fingerprint: "global-release-block",
      severity: "BLOCKING",
      blocks: ["RELEASE"],
      title: "Run-scoped release block",
      detail: "global release control",
      evidence: { scope: "run" },
      status: "OPEN",
      detectedRevision: run!.calcRevision!,
    });

    const preview = await previewRelease(db, RUN_ID, ids);
    expect(preview.eligible).toHaveLength(0);
    expect(preview.excluded).toHaveLength(ids.length);
  });
});

describe("BANK_DETAILS_CHANGED", () => {
  const RUN_PRIOR = "REL-BANK-2026-06";
  const RUN_CURR = "REL-BANK-2026-07";

  async function approveRunFindings(runId: string): Promise<void> {
    const findings = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.runId, runId));
    await Promise.all(
      findings
        .filter(
          (f) =>
            f.severity !== "BLOCKING" &&
            f.severity !== "INFO" &&
            f.status === "OPEN" &&
            (f.blocks as string[]).includes("APPROVAL")
        )
        .map((f) =>
          acknowledgeRunFinding(
            db,
            f.id,
            "tester@example.com",
            f.severity === "WARNING" ? "ok" : undefined
          )
        )
    );
    const [run] = await db.select().from(payRuns).where(eq(payRuns.id, runId));
    await reviewRun(db, runId, "tester@example.com", run!.calcRevision!);
    await approveRun(db, runId, "tester@example.com", run!.calcRevision!);
  }

  it("detects bank change vs last PAID attempt for the employment", async () => {
    await createRun(db, {
      runId: RUN_PRIOR,
      companyId: COMPANY_ID,
      rulePackId,
      year: 2026,
      month: 6,
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      workingDays: 22,
      paidDays: 22,
      actor: "tester@example.com",
    });
    await recomputeRun(db, RUN_PRIOR, "tester@example.com");
    await approveRunFindings(RUN_PRIOR);

    const [priorLine] = await db
      .select()
      .from(payLines)
      .where(
        and(eq(payLines.runId, RUN_PRIOR), eq(payLines.employmentId, EMP_B))
      );
    expect(priorLine).toBeDefined();

    const batchId = "rel-bank-batch-1";
    await db.execute(sql`
      INSERT INTO release_batches (
        id, run_id, method, status, total_sen, line_count, created_by)
      VALUES (
        ${batchId}, ${RUN_PRIOR}, 'BANK', 'SETTLED',
        ${priorLine!.netSen ?? 0}, 1, 'tester@example.com')`);
    await db.execute(sql`
      INSERT INTO payment_attempts (
        batch_id, line_id, amount_sen, bank_snapshot, status, settled_at)
      VALUES (
        ${batchId}, ${priorLine!.id}, ${priorLine!.netSen ?? 0},
        ${JSON.stringify({ bank: "MAYBANK", account: "9999888877", name: "WORKER B" })}::jsonb,
        'PAID', NOW())`);

    await db
      .update(employments)
      .set({ bankName: "CIMB", bankAccountNo: "1122334455" })
      .where(eq(employments.id, EMP_B));

    await createRun(db, {
      runId: RUN_CURR,
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
    await recomputeRun(db, RUN_CURR, "tester@example.com");

    const changed = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_CURR),
          eq(anomalyFindings.ruleId, "BANK_DETAILS_CHANGED")
        )
      );
    expect(changed.length).toBeGreaterThan(0);
    expect(changed[0]?.evidence).toMatchObject({
      bank: "CIMB",
      account: "1122334455",
    });
    expect(changed[0]?.blocks).toEqual(expect.arrayContaining(["RELEASE"]));
  });

  it("does not detect when bank matches last PAID snapshot", async () => {
    await createRun(db, {
      runId: RUN_PRIOR,
      companyId: COMPANY_ID,
      rulePackId,
      year: 2026,
      month: 6,
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      workingDays: 22,
      paidDays: 22,
      actor: "tester@example.com",
    });
    await recomputeRun(db, RUN_PRIOR, "tester@example.com");
    await approveRunFindings(RUN_PRIOR);

    const [priorLine] = await db
      .select()
      .from(payLines)
      .where(
        and(eq(payLines.runId, RUN_PRIOR), eq(payLines.employmentId, EMP_B))
      );

    const batchId = "rel-bank-batch-2";
    await db.execute(sql`
      INSERT INTO release_batches (
        id, run_id, method, status, total_sen, line_count, created_by)
      VALUES (
        ${batchId}, ${RUN_PRIOR}, 'BANK', 'SETTLED',
        ${priorLine!.netSen ?? 0}, 1, 'tester@example.com')`);
    await db.execute(sql`
      INSERT INTO payment_attempts (
        batch_id, line_id, amount_sen, bank_snapshot, status, settled_at)
      VALUES (
        ${batchId}, ${priorLine!.id}, ${priorLine!.netSen ?? 0},
        ${JSON.stringify({ bank: "MAYBANK", account: "9999888877", name: "WORKER B" })}::jsonb,
        'PAID', NOW())`);

    // Reset EMP_B bank in case prior test mutated it
    await db
      .update(employments)
      .set({ bankName: "MAYBANK", bankAccountNo: "9999888877" })
      .where(eq(employments.id, EMP_B));

    await createRun(db, {
      runId: RUN_CURR,
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
    await recomputeRun(db, RUN_CURR, "tester@example.com");
    await scanRunFindings(db, RUN_CURR);

    const changed = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_CURR),
          eq(anomalyFindings.ruleId, "BANK_DETAILS_CHANGED")
        )
      );
    expect(changed).toHaveLength(0);
  });
});
