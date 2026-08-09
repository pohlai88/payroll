/**
 * P0C — NEW_EMPLOYEE policy and EMPLOYEE_OMITTED period applicability.
 */

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anomalyFindings } from "@/db/schema/findings";
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

const COMPANY_ID = "ffffffff-0000-4000-8000-0000000000c5";
const PERSON_OLD = "ffffffff-0000-4000-8000-0000000000d5";
const PERSON_NEW = "ffffffff-0000-4000-8000-0000000000d6";
const PERSON_TERM = "ffffffff-0000-4000-8000-0000000000d7";
const EMP_OLD = "ffffffff-0000-4000-8000-0000000000e5";
const EMP_NEW = "ffffffff-0000-4000-8000-0000000000e6";
const EMP_TERM = "ffffffff-0000-4000-8000-0000000000e7";
const RUN_JUL = "WF-JUL-2026";
const RUN_AUG = "WF-AUG-2026";

let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'WFCO', 'Workforce Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob) VALUES
      (${PERSON_OLD}, 'OLD WORKER', '880101-10-5555', '1988-01-01'),
      (${PERSON_NEW}, 'NEW WORKER', '950101-10-5556', '1995-01-01'),
      (${PERSON_TERM}, 'TERM WORKER', '870101-10-5557', '1987-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, termination_date,
      termination_reason, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
      bank_name, bank_account_no, bank_account_name)
    VALUES
      (${EMP_OLD}, ${PERSON_OLD}, ${COMPANY_ID}, 'W001', '2020-01-01', NULL,
       NULL, 'MONTHLY', 500000, false, false, false, false,
       'OCBC', '1001', 'OLD WORKER'),
      (${EMP_NEW}, ${PERSON_NEW}, ${COMPANY_ID}, 'W002', '2026-08-01', NULL,
       NULL, 'MONTHLY', 500000, false, false, false, false,
       'OCBC', '1002', 'NEW WORKER'),
      (${EMP_TERM}, ${PERSON_TERM}, ${COMPANY_ID}, 'W003', '2020-01-01', '2026-06-30',
       'RESIGNATION', 'MONTHLY', 500000, false, false, false, false,
       'OCBC', '1003', 'TERM WORKER')`);
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

async function ackApprovalBlockers(runId: string): Promise<void> {
  const findings = await db
    .select()
    .from(anomalyFindings)
    .where(eq(anomalyFindings.runId, runId));
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
}

async function approveRunId(runId: string): Promise<void> {
  const { payRuns } = await import("@/db/schema/run");
  const [run] = await db.select().from(payRuns).where(eq(payRuns.id, runId));
  const revision = run!.calcRevision!;
  await ackApprovalBlockers(runId);
  await reviewRun(db, runId, "tester@example.com", revision);
  await approveRun(db, runId, "tester@example.com", revision);
}

describe("NEW_EMPLOYEE", () => {
  it("does not detect NEW_EMPLOYEE on first payroll (no prior baseline)", async () => {
    await createRun(db, {
      runId: RUN_JUL,
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
    await recomputeRun(db, RUN_JUL, "tester@example.com");

    const news = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_JUL),
          eq(anomalyFindings.ruleId, "NEW_EMPLOYEE")
        )
      );
    expect(news).toHaveLength(0);
  });

  it("detects employee joining after an APPROVED prior monthly payroll", async () => {
    await createRun(db, {
      runId: RUN_JUL,
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
    // Only OLD is active in July (NEW joins Aug; TERM ended Jun)
    await recomputeRun(db, RUN_JUL, "tester@example.com");
    await approveRunId(RUN_JUL);

    await createRun(db, {
      runId: RUN_AUG,
      companyId: COMPANY_ID,
      rulePackId,
      year: 2026,
      month: 8,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      workingDays: 22,
      paidDays: 22,
      actor: "tester@example.com",
    });
    await recomputeRun(db, RUN_AUG, "tester@example.com");

    const news = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_AUG),
          eq(anomalyFindings.ruleId, "NEW_EMPLOYEE")
        )
      );
    expect(news).toHaveLength(1);
    expect(news[0]?.evidence).toMatchObject({ employmentId: EMP_NEW });
  });
});

describe("EMPLOYEE_OMITTED", () => {
  it("does not flag employees terminated before the current period", async () => {
    await createRun(db, {
      runId: RUN_JUL,
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
    // Force TERM into July run membership artificially by creating a line via
    // a dedicated July baseline that includes TERM, then August without TERM.
    // Simpler path: approve July with OLD only; manually insert TERM into July
    // prior baseline is not enough — TERM must appear on an APPROVED prior run.
    await recomputeRun(db, RUN_JUL, "tester@example.com");

    // Insert TERM onto July run by creating a second company payroll month that
    // already has TERM — instead, extend July membership: createRun only picks
    // active employments. TERM ended 2026-06-30 so is absent from July — correct.
    // Build prior APPROVED run that still lists TERM via raw line insert is heavy.
    // Instead: create June run including TERM (active through Jun 30), approve it,
    // then July without TERM and assert no EMPLOYEE_OMITTED for TERM.
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

    const RUN_JUN = "WF-JUN-2026";
    await createRun(db, {
      runId: RUN_JUN,
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
    await recomputeRun(db, RUN_JUN, "tester@example.com");
    await approveRunId(RUN_JUN);

    await createRun(db, {
      runId: RUN_JUL,
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
    await recomputeRun(db, RUN_JUL, "tester@example.com");

    const omitted = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_JUL),
          eq(anomalyFindings.ruleId, "EMPLOYEE_OMITTED")
        )
      );
    expect(omitted.every((f) => f.evidence.employmentId !== EMP_TERM)).toBe(
      true
    );
  });

  it("flags an active prior employee missing from the current run", async () => {
    await createRun(db, {
      runId: RUN_JUL,
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
    await recomputeRun(db, RUN_JUL, "tester@example.com");
    await approveRunId(RUN_JUL);

    // August with only NEW (terminate OLD for period? Better: delete OLD from
    // August membership by ending employment mid-July so createRun excludes them
    // while activeInPeriod for August is still true — join <= Aug end, term null.
    // Exclude OLD by temporarily setting joinDate after August — too invasive.
    // Instead: create August run then delete OLD's pay line and rescan.
    await createRun(db, {
      runId: RUN_AUG,
      companyId: COMPANY_ID,
      rulePackId,
      year: 2026,
      month: 8,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      workingDays: 22,
      paidDays: 22,
      actor: "tester@example.com",
    });
    await recomputeRun(db, RUN_AUG, "tester@example.com");

    const { payLines } = await import("@/db/schema/run");
    const oldLines = await db
      .select()
      .from(payLines)
      .where(
        and(eq(payLines.runId, RUN_AUG), eq(payLines.employmentId, EMP_OLD))
      );
    await Promise.all(
      oldLines.map(async (line) => {
        await db.execute(
          sql`DELETE FROM pay_line_items WHERE line_id = ${line.id}`
        );
        await db.execute(sql`DELETE FROM pay_lines WHERE id = ${line.id}`);
      })
    );
    await scanRunFindings(db, RUN_AUG);

    const omitted = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_AUG),
          eq(anomalyFindings.ruleId, "EMPLOYEE_OMITTED")
        )
      );
    expect(omitted.some((f) => f.evidence.employmentId === EMP_OLD)).toBe(true);
  });
});

describe("EMPLOYEE_IN_OVERLAPPING_RUNS", () => {
  it("detects the same employment in two open runs for the same month", async () => {
    const RUN_REG = "WF-OV-REG-2026-09";
    const RUN_OFF = "WF-OV-OFF-2026-09";
    await createRun(db, {
      runId: RUN_REG,
      companyId: COMPANY_ID,
      rulePackId,
      year: 2026,
      month: 9,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      workingDays: 22,
      paidDays: 22,
      actor: "tester@example.com",
    });
    await recomputeRun(db, RUN_REG, "tester@example.com");

    // Second regular-period peer: insert a DRAFT sibling run sharing the month
    // via raw SQL (createRun would collide on unique company/year/month/type).
    await db.execute(sql`
      INSERT INTO pay_runs (
        id, company_id, year, month, period_start, period_end, working_days,
        rule_pack_id, rule_pack_hash, status, run_type, offcycle_reason, calc_revision)
      SELECT
        ${RUN_OFF}, company_id, year, month, period_start, period_end, working_days,
        rule_pack_id, rule_pack_hash, 'DRAFT', 'OFFCYCLE', 'CORRECTION', calc_revision
      FROM pay_runs WHERE id = ${RUN_REG}`);

    const { payLines } = await import("@/db/schema/run");
    const [src] = await db
      .select()
      .from(payLines)
      .where(
        and(eq(payLines.runId, RUN_REG), eq(payLines.employmentId, EMP_OLD))
      );
    expect(src).toBeDefined();

    await db.execute(sql`
      INSERT INTO pay_lines (
        id, run_id, employment_id, employee_snapshot, working_days, paid_days,
        period_end, net_sen, epf_ee_sen, socso_ee_core_sen, eis_ee_sen,
        epf_wages_sen, socso_wages_sen, eis_wages_sen, gross_sen)
      VALUES (
        gen_random_uuid(), ${RUN_OFF}, ${EMP_OLD}, ${JSON.stringify(src!.employeeSnapshot)}::jsonb,
        ${src!.workingDays}, ${src!.paidDays}, ${src!.periodEnd},
        ${src!.netSen}, ${src!.epfEeSen}, ${src!.socsoEeCoreSen}, ${src!.eisEeSen},
        ${src!.epfWagesSen}, ${src!.socsoWagesSen}, ${src!.eisWagesSen}, ${src!.grossSen})`);

    await scanRunFindings(db, RUN_REG);

    const overlaps = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_REG),
          eq(anomalyFindings.ruleId, "EMPLOYEE_IN_OVERLAPPING_RUNS")
        )
      );
    expect(overlaps.length).toBeGreaterThan(0);
    expect(overlaps[0]?.evidence).toMatchObject({
      employmentId: EMP_OLD,
      otherRunId: RUN_OFF,
    });
  });
});
