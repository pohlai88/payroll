/**
 * P0D — NET_ZERO / NET_NEGATIVE detection + evidence.
 */

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anomalyFindings } from "@/db/schema/findings";
import { payLines } from "@/db/schema/run";
import { createRun, recomputeRun } from "@/service/payrun";
import { scanRunFindings } from "@/service/run-findings";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "../db/harness/database";

const database = connectTestDatabase();
const { db } = database;

const COMPANY_ID = "a1a1a1a1-0000-4000-8000-0000000000c1";
const PERSON_ID = "a1a1a1a1-0000-4000-8000-0000000000d1";
const EMP_ID = "a1a1a1a1-0000-4000-8000-0000000000e1";
const RUN_ID = "NET-PAY-2026-07";

let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);
  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'NETCO', 'Net Pay Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'NET WORKER', '900101-10-1111', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
      bank_name, bank_account_no, bank_account_name)
    VALUES (${EMP_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'N001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false,
            'OCBC', '1111', 'NET WORKER')`);
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

async function setupRun(): Promise<string> {
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
  const [line] = await db.select().from(payLines).where(eq(payLines.runId, RUN_ID));
  return line!.id;
}

describe("NET_ZERO", () => {
  it("detects zero net with evidence netSen", async () => {
    const lineId = await setupRun();
    await db.update(payLines).set({ netSen: 0 }).where(eq(payLines.id, lineId));
    await scanRunFindings(db, RUN_ID);

    const [finding] = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_ID),
          eq(anomalyFindings.ruleId, "NET_ZERO")
        )
      );
    expect(finding).toBeDefined();
    expect(finding?.evidence).toEqual({ netSen: 0 });
  });

  it("does not detect when net is positive", async () => {
    await setupRun();
    const zeros = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.ruleId, "NET_ZERO"));
    expect(zeros).toHaveLength(0);
  });
});

describe("NET_NEGATIVE", () => {
  it("detects negative net with evidence", async () => {
    const lineId = await setupRun();
    await db
      .update(payLines)
      .set({ netSen: -1500 })
      .where(eq(payLines.id, lineId));
    await scanRunFindings(db, RUN_ID);

    const [finding] = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_ID),
          eq(anomalyFindings.ruleId, "NET_NEGATIVE")
        )
      );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("BLOCKING");
    expect(finding?.evidence).toEqual({ netSen: -1500 });
  });
});
