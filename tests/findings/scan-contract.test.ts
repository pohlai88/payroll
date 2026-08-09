/**
 * P0A — scan / calcRevision binding after recompute.
 * Spec: docs/superpowers/specs/2026-08-09-code-quality-findings-assurance-design.md §0A.1
 */

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { payRuns } from "@/db/schema/run";
import { evaluateGate } from "@/service/gates";
import { createRun, recomputeRun } from "@/service/payrun";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "../db/harness/database";

const database = connectTestDatabase();
const { db } = database;

const COMPANY_ID = "aaaaaaaa-0000-4000-8000-0000000000c1";
const PERSON_ID = "aaaaaaaa-0000-4000-8000-0000000000d1";
const EMPLOYMENT_ID = "aaaaaaaa-0000-4000-8000-0000000000e1";
const RUN_ID = "SCAN-CONTRACT-2026-07";

let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'SCCO', 'Scan Contract Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'SCAN WORKER', '900101-10-1111', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
      bank_name, bank_account_no, bank_account_name)
    VALUES (${EMPLOYMENT_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'SC001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false,
            'OCBC', '1111111111', 'SCAN WORKER')`);
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

describe("scan-revision binding", () => {
  it("successful recompute + scan stamps findingsScannedRevision = calcRevision", async () => {
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

    const [run] = await db
      .select()
      .from(payRuns)
      .where(eq(payRuns.id, RUN_ID))
      .limit(1);

    expect(run?.calcRevision).toBeTruthy();
    expect(run?.findingsScannedRevision).toBe(run?.calcRevision);

    const gate = await evaluateGate(db, RUN_ID, "REVIEW");
    expect(gate.issues.some((i) => i.code === "SCAN_INCOMPLETE")).toBe(false);
  });

  it("cleared scan stamp fails every gate with SCAN_INCOMPLETE", async () => {
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

    await db
      .update(payRuns)
      .set({ findingsScannedRevision: null })
      .where(eq(payRuns.id, RUN_ID));

    for (const gate of ["REVIEW", "APPROVAL", "RELEASE", "CLOSE"] as const) {
      const result = await evaluateGate(db, RUN_ID, gate);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === "SCAN_INCOMPLETE")).toBe(
        true
      );
    }
  });
});
