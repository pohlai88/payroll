/**
 * Every constraint and trigger, provoked and asserted.
 *
 * A guard that exists but does not fire is worse than no guard, because it is
 * trusted. Each test here performs the illegal act and asserts on the message
 * the database raises; each is paired with the legal case it must not block.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ALL_TABLES,
  connectTestDatabase,
  expectRejected,
  type TestDatabase,
} from "./harness/database";

const database: TestDatabase = connectTestDatabase();
const { db } = database;

const RULE_PACK = "RP-TEST";
const COMPANY = "11111111-1111-1111-1111-111111111111";
const PERSON = "22222222-2222-2222-2222-222222222222";
const MONTHLY_EMPLOYMENT = "33333333-3333-3333-3333-333333333333";
const DAILY_EMPLOYMENT = "44444444-4444-4444-4444-444444444444";
const BASIC_ITEM = "55555555-5555-5555-5555-555555555555";
const MEAL_ITEM = "66666666-6666-6666-6666-666666666666";
const RUN = "TEST-2026-07";
const LINE = "77777777-7777-7777-7777-777777777777";

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.truncate(...ALL_TABLES);

  // Approved, because a payroll may only be produced under an approved pack —
  // that rule has its own tests in authority.test.ts.
  await db.execute(sql`
    INSERT INTO rule_packs (id, name, effective_from, content_hash, status, approved_by, approved_at)
    VALUES (${RULE_PACK}, 'test pack', '2026-06-01', ${"c".repeat(64)},
            'APPROVED', 'test-fixture', now())`);
  await db.execute(sql`
    INSERT INTO companies (id, code, name)
    VALUES (${COMPANY}, 'TESTCO', 'Test Sdn Bhd')`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON}, 'TEST PERSON', '920713-10-5913', '1992-07-13')`);
  await db.execute(sql`
    INSERT INTO employments (id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen)
    VALUES (${MONTHLY_EMPLOYMENT}, ${PERSON}, ${COMPANY}, 'M001', '2020-01-01', 'MONTHLY', 350000)`);
  await db.execute(sql`
    INSERT INTO employments (id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen)
    VALUES (${DAILY_EMPLOYMENT}, ${PERSON}, ${COMPANY}, 'D001', '2020-01-01', 'DAILY', 12000)`);
  await db.execute(sql`
    INSERT INTO pay_items (id, code, name_en, name_ms, kind, rate_basis, epf_wages, socso_wages, eis_wages, is_system)
    VALUES (${BASIC_ITEM}, 'BASIC', 'Basic', 'Gaji', 'EARNING', 'FIXED_MONTHLY', true, true, true, true)`);
  await db.execute(sql`
    INSERT INTO pay_items (id, code, name_en, name_ms, kind, rate_basis, epf_wages, socso_wages, eis_wages)
    VALUES (${MEAL_ITEM}, 'MEAL', 'Meal', 'Makan', 'EARNING', 'PER_DAY', true, true, true)`);
});

function insertRun(
  id: string,
  extra: { runType?: string; offcycleReason?: string | null } = {}
): Promise<unknown> {
  const runType = extra.runType ?? "REGULAR";
  const reason = extra.offcycleReason ?? null;
  return db.execute(sql`
    INSERT INTO pay_runs (id, company_id, run_type, offcycle_reason, year, month,
                          period_start, period_end, working_days, rule_pack_id)
    VALUES (${id}, ${COMPANY}, ${runType}::run_type, ${reason}::offcycle_reason,
            2026, 7, '2026-07-01', '2026-07-31', 26, ${RULE_PACK})`);
}

function insertLine(): Promise<unknown> {
  return db.execute(sql`
    INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days, paid_days, period_end)
    VALUES (${LINE}, ${RUN}, ${MONTHLY_EMPLOYMENT}, '{"id":"M001"}'::jsonb, 26, 26, '2026-07-31')`);
}

function assignItem(
  employmentId: string,
  itemId: string,
  column: "rate_sen" | "amount_sen",
  value: number
): Promise<unknown> {
  return column === "rate_sen"
    ? db.execute(sql`
        INSERT INTO employment_pay_items (employment_id, pay_item_id, rate_sen)
        VALUES (${employmentId}, ${itemId}, ${value})`)
    : db.execute(sql`
        INSERT INTO employment_pay_items (employment_id, pay_item_id, amount_sen)
        VALUES (${employmentId}, ${itemId}, ${value})`);
}

describe("employment_pay_items compatibility", () => {
  it("rejects a FIXED_MONTHLY item on a DAILY employment", async () => {
    await expectRejected(
      assignItem(DAILY_EMPLOYMENT, BASIC_ITEM, "amount_sen", 350_000),
      /pay item BASIC is FIXED_MONTHLY and cannot be assigned to a DAILY employment/
    );
  });

  it("accepts the same item on a MONTHLY employment", async () => {
    await expect(
      assignItem(MONTHLY_EMPLOYMENT, BASIC_ITEM, "amount_sen", 350_000)
    ).resolves.toBeDefined();
  });

  it("accepts a PER_DAY item on a DAILY employment", async () => {
    await expect(
      assignItem(DAILY_EMPLOYMENT, MEAL_ITEM, "rate_sen", 1500)
    ).resolves.toBeDefined();
  });

  it("rejects a quantity-based item given an amount instead of a rate", async () => {
    await expectRejected(
      assignItem(MONTHLY_EMPLOYMENT, MEAL_ITEM, "amount_sen", 1500),
      /pay item MEAL is PER_DAY: it needs rate_sen/
    );
  });

  it("rejects a fixed-amount item given a rate instead of an amount", async () => {
    await expectRejected(
      assignItem(MONTHLY_EMPLOYMENT, BASIC_ITEM, "rate_sen", 350_000),
      /pay item BASIC is FIXED_MONTHLY: it needs amount_sen/
    );
  });
});

describe("pay item identity", () => {
  it("refuses to change a code", async () => {
    await expectRejected(
      db.execute(
        sql`UPDATE pay_items SET code = 'BASIC2' WHERE code = 'BASIC'`
      ),
      /pay item code is immutable \(BASIC -> BASIC2\)/
    );
  });

  it("refuses to change a kind", async () => {
    await expectRejected(
      db.execute(
        sql`UPDATE pay_items SET kind = 'DEDUCTION' WHERE code = 'BASIC'`
      ),
      /pay item BASIC kind is immutable/
    );
  });

  it("refuses to deactivate a system item", async () => {
    await expectRejected(
      db.execute(sql`UPDATE pay_items SET active = false WHERE code = 'BASIC'`),
      /pay item BASIC is a system item/
    );
  });

  it("allows deactivating an ordinary item", async () => {
    await expect(
      db.execute(sql`UPDATE pay_items SET active = false WHERE code = 'MEAL'`)
    ).resolves.toBeDefined();
  });

  it("refuses a hard delete", async () => {
    await expectRejected(
      db.execute(sql`DELETE FROM pay_items WHERE code = 'MEAL'`),
      /cannot be deleted: deactivate it instead/
    );
  });
});

describe("pay run identity and period", () => {
  it("allows only one regular run per company period", async () => {
    await insertRun(RUN);
    await expectRejected(
      insertRun("TEST-2026-07-DUP"),
      /pay_runs_regular_period_unique/
    );
  });

  it("allows an off-cycle run alongside the regular one", async () => {
    await insertRun(RUN);
    await expect(
      insertRun("TEST-2026-07-OC1", {
        runType: "OFFCYCLE",
        offcycleReason: "CORRECTION",
      })
    ).resolves.toBeDefined();
  });

  it("requires an off-cycle run to say why it exists", async () => {
    await expectRejected(
      insertRun("TEST-2026-07-OC2", { runType: "OFFCYCLE" }),
      /pay_runs_offcycle_has_reason/
    );
  });
});

describe("pay line inputs", () => {
  beforeEach(async () => {
    await insertRun(RUN);
  });

  it("rejects more paid days than the period has", async () => {
    await expectRejected(
      db.execute(sql`
        INSERT INTO pay_lines (run_id, employment_id, employee_snapshot, working_days, paid_days, period_end)
        VALUES (${RUN}, ${MONTHLY_EMPLOYMENT}, '{"id":"M001"}'::jsonb, 26, 27, '2026-07-31')`),
      /pay_lines_paid_days_within_period/
    );
  });

  it("records hours beyond any statutory cap, because a breach is a fact", async () => {
    await expect(
      db.execute(sql`
        INSERT INTO pay_lines (run_id, employment_id, employee_snapshot, working_days, hours_worked, period_end)
        VALUES (${RUN}, ${MONTHLY_EMPLOYMENT}, '{"id":"M001"}'::jsonb, 26, 400, '2026-07-31')`)
    ).resolves.toBeDefined();
  });

  it("rejects a second line for the same employment in one run", async () => {
    await insertLine();
    // A fresh id, so the composite unique is what rejects this and not the key.
    await expectRejected(
      db.execute(sql`
        INSERT INTO pay_lines (run_id, employment_id, employee_snapshot, working_days, paid_days, period_end)
        VALUES (${RUN}, ${MONTHLY_EMPLOYMENT}, '{"id":"M001"}'::jsonb, 26, 26, '2026-07-31')`),
      /pay_lines_run_employment_unique/
    );
  });
});

describe("pay line item shape", () => {
  beforeEach(async () => {
    await insertRun(RUN);
    await insertLine();
  });

  const columns = sql`(line_id, item_code_snap, kind_snap, basis_snap, name_en_snap, name_ms_snap,
                       epf_wages_snap, socso_wages_snap, eis_wages_snap, prorates_snap,
                       quantity, rate_sen, amount_sen, resolved_amount_sen)`;

  it("accepts a well-formed quantity item", async () => {
    await expect(
      db.execute(sql`
        INSERT INTO pay_line_items ${columns}
        VALUES (${LINE}, 'MEAL', 'EARNING', 'PER_DAY', 'Meal', 'Makan', true, true, true, false,
                26, 1500, NULL, 39000)`)
    ).resolves.toBeDefined();
  });

  it("accepts a well-formed fixed-amount item", async () => {
    await expect(
      db.execute(sql`
        INSERT INTO pay_line_items ${columns}
        VALUES (${LINE}, 'PERF', 'EARNING', 'AMOUNT', 'Perf', 'Prestasi', true, true, true, false,
                NULL, NULL, 20000, 20000)`)
    ).resolves.toBeDefined();
  });

  /**
   * The case a single equivalence check misses: with a quantity, a rate *and* an
   * independent amount, both sides of the equivalence are false, so it holds.
   * This is the disagreement the discriminated union exists to prevent, so the
   * schema carries a second check for it.
   */
  it("rejects a quantity item that also carries its own amount", async () => {
    await expectRejected(
      db.execute(sql`
        INSERT INTO pay_line_items ${columns}
        VALUES (${LINE}, 'MEAL', 'EARNING', 'PER_DAY', 'Meal', 'Makan', true, true, true, false,
                26, 1500, 39000, 39000)`),
      /pay_line_items_quantity_shape_complete/
    );
  });

  it("rejects a fixed-amount item that carries a quantity", async () => {
    await expectRejected(
      db.execute(sql`
        INSERT INTO pay_line_items ${columns}
        VALUES (${LINE}, 'PERF', 'EARNING', 'AMOUNT', 'Perf', 'Prestasi', true, true, true, false,
                2, 100, NULL, 200)`),
      /pay_line_items_shape_matches_basis/
    );
  });
});

describe("PCB is never verified without a source", () => {
  beforeEach(async () => {
    await insertRun(RUN);
    await insertLine();
  });

  it("rejects a verified entry with no amount or source", async () => {
    await expectRejected(
      db.execute(
        sql`INSERT INTO pcb_entries (line_id, verified) VALUES (${LINE}, true)`
      ),
      /pcb_entries_verified_needs_amount_and_source/
    );
  });

  it("accepts an unverified entry with no amount — net pay is simply unknown", async () => {
    await expect(
      db.execute(sql`INSERT INTO pcb_entries (line_id) VALUES (${LINE})`)
    ).resolves.toBeDefined();
  });

  it("accepts a verified entry backed by a source", async () => {
    await expect(
      db.execute(sql`
        INSERT INTO pcb_entries (line_id, pcb_amount_sen, verified, source)
        VALUES (${LINE}, 12500, true, 'e-PCB')`)
    ).resolves.toBeDefined();
  });
});

describe("run lifecycle", () => {
  beforeEach(async () => {
    await insertRun(RUN);
    await insertLine();
  });

  const setStatus = (status: string): Promise<unknown> =>
    db.execute(
      sql`UPDATE pay_runs SET status = ${status}::run_status WHERE id = ${RUN}`
    );

  it("refuses to skip review", async () => {
    await expectRejected(
      setStatus("APPROVED"),
      /run TEST-2026-07 cannot move from DRAFT to APPROVED/
    );
  });

  it("walks the lifecycle forward", async () => {
    await expect(setStatus("REVIEWED")).resolves.toBeDefined();
    await expect(setStatus("APPROVED")).resolves.toBeDefined();
    await expect(setStatus("CLOSED")).resolves.toBeDefined();
  });

  it("allows the REVIEWED to DRAFT demotion a calculation edit forces", async () => {
    await setStatus("REVIEWED");
    await expect(setStatus("DRAFT")).resolves.toBeDefined();
  });

  it("refuses to reopen a closed run", async () => {
    await setStatus("REVIEWED");
    await setStatus("APPROVED");
    await setStatus("CLOSED");
    await expectRejected(
      setStatus("DRAFT"),
      /cannot move from CLOSED to DRAFT/
    );
  });
});

describe("an approved run's calculation is frozen", () => {
  beforeEach(async () => {
    await insertRun(RUN);
    await insertLine();
    await db.execute(
      sql`UPDATE pay_runs SET status = 'REVIEWED' WHERE id = ${RUN}`
    );
    await db.execute(
      sql`UPDATE pay_runs SET status = 'APPROVED' WHERE id = ${RUN}`
    );
  });

  it("refuses to edit a line", async () => {
    await expectRejected(
      db.execute(sql`UPDATE pay_lines SET paid_days = 20 WHERE id = ${LINE}`),
      /run TEST-2026-07 is APPROVED: its calculation is frozen and UPDATE on pay_lines/
    );
  });

  it("refuses to add an item", async () => {
    await expectRejected(
      db.execute(sql`
        INSERT INTO pay_line_items (line_id, item_code_snap, kind_snap, basis_snap, name_en_snap,
                                    name_ms_snap, epf_wages_snap, socso_wages_snap, eis_wages_snap,
                                    prorates_snap, amount_sen, resolved_amount_sen)
        VALUES (${LINE}, 'BONUS', 'EARNING', 'AMOUNT', 'Bonus', 'Bonus', true, false, false, false,
                100000, 100000)`),
      /INSERT on pay_line_items/
    );
  });

  it("refuses to change the PCB entry", async () => {
    await expectRejected(
      db.execute(
        sql`INSERT INTO pcb_entries (line_id, pcb_amount_sen) VALUES (${LINE}, 5000)`
      ),
      /INSERT on pcb_entries/
    );
  });

  it("refuses to delete a line", async () => {
    await expectRejected(
      db.execute(sql`DELETE FROM pay_lines WHERE id = ${LINE}`),
      /DELETE on pay_lines/
    );
  });

  it("still allows the run itself to move to CLOSED", async () => {
    await expect(
      db.execute(sql`UPDATE pay_runs SET status = 'CLOSED' WHERE id = ${RUN}`)
    ).resolves.toBeDefined();
  });
});

describe("audit log", () => {
  beforeEach(async () => {
    await db.execute(sql`
      INSERT INTO audit_events (actor, entity, entity_id, action)
      VALUES ('jack', 'pay_runs', ${RUN}, 'CREATE')`);
  });

  it("refuses updates", async () => {
    await expectRejected(
      db.execute(sql`UPDATE audit_events SET actor = 'someone else'`),
      /audit_events is append-only: UPDATE is not allowed/
    );
  });

  it("refuses deletes", async () => {
    await expectRejected(
      db.execute(sql`DELETE FROM audit_events`),
      /audit_events is append-only: DELETE is not allowed/
    );
  });

  it("accepts new events", async () => {
    await expect(
      db.execute(sql`
        INSERT INTO audit_events (actor, entity, entity_id, action)
        VALUES ('jack', 'pay_lines', ${LINE}, 'RECOMPUTE')`)
    ).resolves.toBeDefined();
  });
});
