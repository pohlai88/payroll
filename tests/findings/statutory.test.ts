/**
 * P0C — STATUTORY_ZERO_WITH_WAGES uses scheme wage bases; baseline status filter.
 */

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anomalyFindings } from "@/db/schema/findings";
import { payLines, payRuns } from "@/db/schema/run";
import {
  approveRun,
  createRun,
  recomputeRun,
  reviewRun,
} from "@/service/payrun";
import { acknowledgeRunFinding, scanRunFindings } from "@/service/run-findings";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "../db/harness/database";

const database = connectTestDatabase();
const { db } = database;

const COMPANY_ID = "eeeeeeee-0000-4000-8000-0000000000c8";
const PERSON_ID = "eeeeeeee-0000-4000-8000-0000000000d8";
const EMP_ID = "eeeeeeee-0000-4000-8000-0000000000e8";
const RUN_A = "STAT-A-2026-06";
const RUN_B = "STAT-B-2026-07";

let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'STCO', 'Statutory Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'STAT WORKER', '900101-10-8888', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
      epf_no, bank_name, bank_account_no, bank_account_name)
    VALUES (${EMP_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'S001', '2020-01-01',
            'MONTHLY', 500000, true, false, false, false,
            'EPF123', 'OCBC', '8888', 'STAT WORKER')`);
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

describe("STATUTORY_ZERO_WITH_WAGES", () => {
  it("detects unexpected zero EPF against epfWagesSen, not baseRateSen alone", async () => {
    await createRun(db, {
      runId: RUN_B,
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
    await recomputeRun(db, RUN_B, "tester@example.com");

    const [line] = await db
      .select()
      .from(payLines)
      .where(eq(payLines.runId, RUN_B));
    expect(line?.epfWagesSen).toBeGreaterThan(0);
    expect(line?.epfEeSen).toBeGreaterThan(0);

    // Corrupt employee contribution only — wages remain positive.
    await db
      .update(payLines)
      .set({ epfEeSen: 0 })
      .where(eq(payLines.id, line!.id));
    await scanRunFindings(db, RUN_B);

    const [finding] = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_B),
          eq(anomalyFindings.ruleId, "STATUTORY_ZERO_WITH_WAGES")
        )
      );
    expect(finding).toBeDefined();
    expect(finding?.evidence).toMatchObject({
      schemes: expect.arrayContaining(["epf"]),
      epfWagesSen: line!.epfWagesSen,
      epfEeSen: 0,
    });
    expect(finding?.evidence).not.toHaveProperty("baseRateSen");
  });
});

describe("PCB_UNVERIFIED", () => {
  it("detects pcbApplicable line with no verified pcb entry", async () => {
    const PCB_CO = "eeeeeeee-0000-4000-8000-0000000000cb";
    const PCB_PERSON = "eeeeeeee-0000-4000-8000-0000000000da";
    const PCB_EMP = "eeeeeeee-0000-4000-8000-0000000000ea";
    await db.execute(sql`
      INSERT INTO companies (id, code, name, hrdf_enabled)
      VALUES (${PCB_CO}, 'PCBCO', 'PCB Co', false)
      ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`
      INSERT INTO persons (id, name, ic, dob)
      VALUES (${PCB_PERSON}, 'PCB WORKER', '900101-10-7777', '1990-01-01')
      ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`
      INSERT INTO employments (
        id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
        epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
        tin, bank_name, bank_account_no, bank_account_name)
      VALUES (${PCB_EMP}, ${PCB_PERSON}, ${PCB_CO}, 'P001', '2020-01-01',
              'MONTHLY', 500000, false, false, false, true,
              'IG12345678901', 'OCBC', '7777', 'PCB WORKER')
      ON CONFLICT (id) DO NOTHING`);

    const RUN_PCB = "STAT-PCB-2026-07";
    await createRun(db, {
      runId: RUN_PCB,
      companyId: PCB_CO,
      rulePackId,
      year: 2026,
      month: 7,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      workingDays: 22,
      paidDays: 22,
      actor: "tester@example.com",
    });
    await recomputeRun(db, RUN_PCB, "tester@example.com");

    const [finding] = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_PCB),
          eq(anomalyFindings.ruleId, "PCB_UNVERIFIED")
        )
      );
    expect(finding).toBeDefined();
    expect(finding?.evidence).toMatchObject({
      verified: false,
      pcbAmountSen: null,
    });
  });

  it("does not detect when pcb is not applicable", async () => {
    await createRun(db, {
      runId: RUN_B,
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
    await recomputeRun(db, RUN_B, "tester@example.com");

    const hits = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_B),
          eq(anomalyFindings.ruleId, "PCB_UNVERIFIED")
        )
      );
    expect(hits).toHaveLength(0);
  });
});

describe("EIS_AGE_HISTORY_UNRESOLVED", () => {
  it("detects age 57+ with null eisPriorContribution using DOB at period end", async () => {
    // Dedicated company so this BLOCKING finding does not pollute other suites
    // that approve runs on COMPANY_ID.
    const EIS_CO = "eeeeeeee-0000-4000-8000-0000000000ca";
    const PERSON_OLD = "eeeeeeee-0000-4000-8000-0000000000d9";
    const EMP_OLD = "eeeeeeee-0000-4000-8000-0000000000e9";
    await db.execute(sql`
      INSERT INTO companies (id, code, name, hrdf_enabled)
      VALUES (${EIS_CO}, 'EISCO', 'EIS Age Co', false)
      ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`
      INSERT INTO persons (id, name, ic, dob)
      VALUES (${PERSON_OLD}, 'EIS SENIOR', '650101-10-9999', '1965-01-01')
      ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`
      INSERT INTO employments (
        id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
        epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
        eis_prior_contribution, bank_name, bank_account_no, bank_account_name)
      VALUES (${EMP_OLD}, ${PERSON_OLD}, ${EIS_CO}, 'S002', '2020-01-01',
              'MONTHLY', 500000, false, false, true, false,
              NULL, 'OCBC', '9999', 'EIS SENIOR')
      ON CONFLICT (id) DO NOTHING`);

    const RUN_EIS = "STAT-EIS-2026-07";
    await createRun(db, {
      runId: RUN_EIS,
      companyId: EIS_CO,
      rulePackId,
      year: 2026,
      month: 7,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      workingDays: 22,
      paidDays: 22,
      actor: "tester@example.com",
    });
    await recomputeRun(db, RUN_EIS, "tester@example.com");

    const [finding] = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_EIS),
          eq(anomalyFindings.ruleId, "EIS_AGE_HISTORY_UNRESOLVED")
        )
      );
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("BLOCKING");
    expect(finding!.evidence).toMatchObject({
      eisPriorContribution: null,
      periodEnd: "2026-07-31",
    });
    const evidence = finding!.evidence as { age: number };
    expect(evidence.age).toBeGreaterThanOrEqual(57);
  });
});

describe("STATUTORY_STEP_SHIFT", () => {
  it("detects statutory contribution change with similar nets vs APPROVED prior", async () => {
    await createRun(db, {
      runId: RUN_A,
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
    await recomputeRun(db, RUN_A, "tester@example.com");
    const findings = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.runId, RUN_A));
    await Promise.all(
      findings
        .filter(
          (f) =>
            f.status === "OPEN" &&
            f.severity !== "BLOCKING" &&
            f.severity !== "INFO" &&
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
    const [june] = await db.select().from(payRuns).where(eq(payRuns.id, RUN_A));
    await reviewRun(db, RUN_A, "tester@example.com", june!.calcRevision!);
    await approveRun(db, RUN_A, "tester@example.com", june!.calcRevision!);

    await createRun(db, {
      runId: RUN_B,
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
    await recomputeRun(db, RUN_B, "tester@example.com");
    const [july] = await db
      .select()
      .from(payLines)
      .where(eq(payLines.runId, RUN_B));
    const [juneLine] = await db
      .select()
      .from(payLines)
      .where(eq(payLines.runId, RUN_A));

    // Keep nets nearly equal (wagesSimilar ≤10%) but shift EPF contribution.
    await db
      .update(payLines)
      .set({
        netSen: juneLine!.netSen,
        epfEeSen: (juneLine!.epfEeSen ?? 0) + 100,
      })
      .where(eq(payLines.id, july!.id));
    await scanRunFindings(db, RUN_B);

    const [shift] = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_B),
          eq(anomalyFindings.ruleId, "STATUTORY_STEP_SHIFT")
        )
      );
    expect(shift).toBeDefined();
    expect(shift?.evidence).toMatchObject({
      baselineEpfEeSen: juneLine!.epfEeSen,
      epfEeSen: (juneLine!.epfEeSen ?? 0) + 100,
    });
  });
});

describe("prior baseline status eligibility", () => {
  it("ignores DRAFT prior runs when selecting variance baseline", async () => {
    await createRun(db, {
      runId: RUN_A,
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
    await recomputeRun(db, RUN_A, "tester@example.com");
    // Leave June as DRAFT — not an eligible baseline.

    await createRun(db, {
      runId: RUN_B,
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
    await recomputeRun(db, RUN_B, "tester@example.com");

    // Force a large net difference vs draft June without an APPROVED baseline —
    // NET_VARIANCE must not fire against the draft.
    const [july] = await db
      .select()
      .from(payLines)
      .where(eq(payLines.runId, RUN_B));
    await db
      .update(payLines)
      .set({ netSen: (july!.netSen ?? 0) + 500_000 })
      .where(eq(payLines.id, july!.id));
    await scanRunFindings(db, RUN_B);

    const variance = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_B),
          eq(anomalyFindings.ruleId, "NET_VARIANCE_VS_PRIOR")
        )
      );
    expect(variance).toHaveLength(0);

    // Approve June, rescan July — variance may now appear against APPROVED baseline.
    const findings = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.runId, RUN_A));
    await Promise.all(
      findings
        .filter(
          (f) =>
            f.status === "OPEN" &&
            f.severity !== "BLOCKING" &&
            f.severity !== "INFO" &&
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
    const [june] = await db.select().from(payRuns).where(eq(payRuns.id, RUN_A));
    await reviewRun(db, RUN_A, "tester@example.com", june!.calcRevision!);
    await approveRun(db, RUN_A, "tester@example.com", june!.calcRevision!);

    await scanRunFindings(db, RUN_B);
    const after = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_B),
          eq(anomalyFindings.ruleId, "NET_VARIANCE_VS_PRIOR")
        )
      );
    expect(after.length).toBeGreaterThan(0);
    expect(after[0]?.evidence).toMatchObject({ baselineRunId: RUN_A });
  });
});
