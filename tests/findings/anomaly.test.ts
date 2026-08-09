/**
 * P0D — OT_OUTLIER and VARIABLE_ITEM_SPIKE.
 */

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anomalyFindings } from "@/db/schema/findings";
import { payLineItems, payLines } from "@/db/schema/run";
import {
  OT_HOURS_OUTLIER,
  VARIABLE_ITEM_SPIKE_SEN,
} from "@/domain/findings/catalog";
import { createRun, recomputeRun } from "@/service/payrun";
import { scanRunFindings } from "@/service/run-findings";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "../db/harness/database";

const database = connectTestDatabase();
const { db } = database;

const COMPANY_ID = "b2b2b2b2-0000-4000-8000-0000000000c2";
const PERSON_ID = "b2b2b2b2-0000-4000-8000-0000000000d2";
const EMP_ID = "b2b2b2b2-0000-4000-8000-0000000000e2";
const RUN_ID = "ANOM-ITEM-2026-07";

let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);
  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'ANCO', 'Anomaly Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'ANOM WORKER', '900101-10-2222', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
      bank_name, bank_account_no, bank_account_name)
    VALUES (${EMP_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'A001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false,
            'OCBC', '2222', 'ANOM WORKER')`);
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

async function setupLine(): Promise<string> {
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

describe("OT_OUTLIER", () => {
  it("detects OT hours above OT_HOURS_OUTLIER", async () => {
    const lineId = await setupLine();
    const hours = OT_HOURS_OUTLIER + 1;
    await db.insert(payLineItems).values({
      lineId,
      itemCodeSnap: "OT",
      kindSnap: "EARNING",
      basisSnap: "PER_HOUR",
      nameEnSnap: "Overtime",
      nameMsSnap: "Lebih masa",
      epfWagesSnap: false,
      socsoWagesSnap: false,
      eisWagesSnap: false,
      proratesSnap: false,
      pcbClassSnap: "ADDITIONAL",
      sortSnap: 10,
      quantity: String(hours),
      rateSen: 2500,
      amountSen: null,
      resolvedAmountSen: hours * 2500,
    });
    await scanRunFindings(db, RUN_ID);

    const [finding] = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_ID),
          eq(anomalyFindings.ruleId, "OT_OUTLIER")
        )
      );
    expect(finding).toBeDefined();
    expect(finding?.evidence).toMatchObject({
      hours,
      otPaySen: hours * 2500,
      basicSen: 500000,
    });
  });

  it("does not detect OT within thresholds", async () => {
    const lineId = await setupLine();
    await db.insert(payLineItems).values({
      lineId,
      itemCodeSnap: "OT",
      kindSnap: "EARNING",
      basisSnap: "PER_HOUR",
      nameEnSnap: "Overtime",
      nameMsSnap: "Lebih masa",
      epfWagesSnap: false,
      socsoWagesSnap: false,
      eisWagesSnap: false,
      proratesSnap: false,
      pcbClassSnap: "ADDITIONAL",
      sortSnap: 10,
      quantity: "10",
      rateSen: 2500,
      amountSen: null,
      resolvedAmountSen: 25_000,
    });
    await scanRunFindings(db, RUN_ID);

    const hits = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.ruleId, "OT_OUTLIER"));
    expect(hits).toHaveLength(0);
  });
});

describe("VARIABLE_ITEM_SPIKE", () => {
  it("detects non-basic non-OT amounts above VARIABLE_ITEM_SPIKE_SEN", async () => {
    const lineId = await setupLine();
    const amount = VARIABLE_ITEM_SPIKE_SEN + 1;
    await db.insert(payLineItems).values({
      lineId,
      itemCodeSnap: "BONUS",
      kindSnap: "EARNING",
      basisSnap: "AMOUNT",
      nameEnSnap: "Bonus",
      nameMsSnap: "Bonus",
      epfWagesSnap: true,
      socsoWagesSnap: false,
      eisWagesSnap: false,
      proratesSnap: false,
      pcbClassSnap: "ADDITIONAL",
      sortSnap: 20,
      quantity: null,
      rateSen: null,
      amountSen: amount,
      resolvedAmountSen: amount,
    });
    await scanRunFindings(db, RUN_ID);

    const [finding] = await db
      .select()
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, RUN_ID),
          eq(anomalyFindings.ruleId, "VARIABLE_ITEM_SPIKE")
        )
      );
    expect(finding).toBeDefined();
    expect(finding?.evidence).toEqual({
      itemCode: "BONUS",
      amountSen: amount,
    });
  });
});
