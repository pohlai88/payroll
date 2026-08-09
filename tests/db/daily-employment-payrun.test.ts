/**
 * @feature pay-run
 * @layer test
 *
 * A DAILY-rated employment, through a real pay run, end to end.
 *
 * `constraints.test.ts` proves the `enforce_employment_item_compatibility`
 * trigger fires. It does not prove the rest of the pipeline handles a DAILY
 * employment correctly — `createRun`'s default-quantity logic, the repo's
 * basis-aware line-item loader, and the engine's DAILY proration path are all
 * untouched by a trigger-only test. `golden-parity.test.ts` cannot cover this
 * either: every one of its 37 employees is MONTHLY, a gap it documents itself.
 *
 * This closes that gap with the smallest real run that exercises it: one
 * DAILY employment, one PER_DAY allowance, through `createRun` and
 * `recomputeRun`, asserting the persisted figures — not just that an insert
 * succeeded.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRun, recomputeRun } from "@/service/payrun";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "./harness/database";

const database = connectTestDatabase();
const { db } = database;

const COMPANY_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const PERSON_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const EMPLOYMENT_ID = "bbbbbbbb-0000-4000-8000-000000000003";
const RUN_ID = "TEST-DAILY-2026-07";

// RM120.00 / day base rate, RM15.00 / day meal allowance.
const DAILY_RATE_SEN = 12_000;
const MEAL_RATE_SEN = 1500;
const WORKING_DAYS = 26;
const PAID_DAYS = 22;

// Expected, computed by hand from the same rules `proration.ts` and
// `resolve-items.ts` apply: DAILY basic is rate x paid days (no proration
// fraction — there is no month to divide by), and the PER_DAY meal allowance
// defaults its quantity to paid days, same as `createRun` does for any other
// PER_DAY item.
const EXPECTED_BASIC_SEN = DAILY_RATE_SEN * PAID_DAYS; // 264,000
const EXPECTED_MEAL_SEN = MEAL_RATE_SEN * PAID_DAYS; // 33,000
const EXPECTED_GROSS_SEN = EXPECTED_BASIC_SEN + EXPECTED_MEAL_SEN; // 297,000

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  const rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'DAILYCO', 'Daily Test Sdn Bhd', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'DAILY WORKER', '900101-10-1234', '1990-01-01')`);

  // No statutory schemes and no PCB, so the expected figures above are the
  // whole story: this test is about the DAILY pipeline, not the statutory
  // math already proven by golden-parity.test.ts.
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES (${EMPLOYMENT_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'D001', '2020-01-01',
            'DAILY', ${DAILY_RATE_SEN}, false, false, false, false)`);

  const meal = await db.execute<{ id: string }>(
    sql`SELECT id FROM pay_items WHERE code = 'MEAL'`
  );
  const mealItemId = meal.rows[0]?.id;
  if (mealItemId === undefined) {
    throw new Error("seed did not create the MEAL pay item");
  }

  // The compatibility trigger allows this: MEAL is PER_DAY, not FIXED_MONTHLY.
  await db.execute(sql`
    INSERT INTO employment_pay_items (employment_id, pay_item_id, rate_sen)
    VALUES (${EMPLOYMENT_ID}, ${mealItemId}, ${MEAL_RATE_SEN})`);

  await createRun(db, {
    runId: RUN_ID,
    companyId: COMPANY_ID,
    rulePackId,
    year: 2026,
    month: 7,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    workingDays: WORKING_DAYS,
    paidDays: PAID_DAYS,
    actor: "daily-employment-test",
  });
});

afterAll(async () => {
  await database.close();
});

describe("a DAILY employment's items flow through a real run", () => {
  it("defaults the PER_DAY allowance's quantity to paid days, not working days", async () => {
    const rows = await db.execute<{ quantity: string; rate_sen: string }>(
      sql`SELECT quantity, rate_sen FROM pay_line_items pli
          JOIN pay_lines pl ON pl.id = pli.line_id
          WHERE pl.run_id = ${RUN_ID} AND pli.item_code_snap = 'MEAL'`
    );
    expect(rows.rows).toHaveLength(1);
    expect(Number(rows.rows[0]?.quantity)).toBe(PAID_DAYS);
    expect(Number(rows.rows[0]?.rate_sen)).toBe(MEAL_RATE_SEN);
  });

  it("does not carry BASIC as a stored line item — the engine derives it", async () => {
    const rows = await db.execute(
      sql`SELECT 1 FROM pay_line_items pli
          JOIN pay_lines pl ON pl.id = pli.line_id
          WHERE pl.run_id = ${RUN_ID} AND pli.item_code_snap = 'BASIC'`
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("computes DAILY basic as rate x paid days, with no monthly proration fraction", async () => {
    const outcome = await recomputeRun(db, RUN_ID, "daily-employment-test");
    expect(outcome.failures).toEqual([]);
    expect(outcome.computed).toBe(1);

    const stored = await db.execute<{
      gross_sen: string;
      net_sen: string | null;
      hrdf_sen: string | null;
      employer_cost_sen: string | null;
    }>(
      sql`SELECT gross_sen, net_sen, hrdf_sen, employer_cost_sen
          FROM pay_lines WHERE run_id = ${RUN_ID}`
    );
    const [line] = stored.rows;
    expect(Number(line?.gross_sen)).toBe(EXPECTED_GROSS_SEN);
    // No statutory schemes and no PCB applicable: net is knowable and equals gross.
    expect(Number(line?.net_sen)).toBe(EXPECTED_GROSS_SEN);
    // Recompute must persist all 19 roots — HRDF off → 0; employer cost = gross.
    expect(Number(line?.hrdf_sen)).toBe(0);
    expect(Number(line?.employer_cost_sen)).toBe(EXPECTED_GROSS_SEN);
  });

  it("traces the daily proration, not the monthly one", async () => {
    const stored = await db.execute<{ trace: unknown }>(
      sql`SELECT trace FROM pay_lines WHERE run_id = ${RUN_ID}`
    );
    const trace = stored.rows[0]?.trace as
      | Array<{ label: string; detail: string }>
      | undefined;
    const regularPayStep = trace?.find((step) =>
      step.label.startsWith("Regular pay")
    );
    expect(regularPayStep?.label).toBe("Regular pay (Daily)");
    expect(regularPayStep?.detail).toBe(`Daily rate × ${PAID_DAYS} paid days`);
  });
});
