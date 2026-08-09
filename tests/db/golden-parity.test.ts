/**
 * @feature pay-run
 * @layer test
 *
 * The July 2026 run, out of Postgres, to the sen.
 *
 * The golden master proves the engine. This proves the database feeds it the
 * same thing: the same 37 employees are loaded from real rows through the
 * repository layer, and the inputs it produces are compared field by field
 * against what the pure test builds in memory before a single figure is
 * checked. A totals-only assertion could pass while the inputs quietly differed.
 *
 * What the fixture does *not* exercise, recorded so nobody mistakes green here
 * for coverage there:
 *   - no employment is DAILY (payBasis is absent from all 37 rows, so every one
 *     is MONTHLY), so the pay-basis compatibility trigger is proved only in
 *     constraints.test.ts;
 *   - there is no overtime anywhere in the run — every employee has otHours 0
 *     and no OT item is constructed. The only quantity item here is MEAL, as
 *     mealDays x mealRateSen (PER_DAY), for 27 of the 37. When OT multipliers
 *     land as a domain change, they supersede nothing this test covers.
 */

import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeLine } from "@/domain/calc/compose";
import type {
  EmployeeSnapshot,
  LineInputs,
  LineItemInput,
  LineResult,
} from "@/domain/calc/types";
import { loadRunForCompute } from "@/repo/pay-run";
import {
  loadPayItems,
  loadRuleSettings,
  loadStatutoryTables,
} from "@/repo/rule-pack";
import { createRun, recomputeRun } from "@/service/payrun";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "./harness/database";

interface FixtureEmployee {
  id: string;
  name: string;
  dob: string;
  ic: string;
  basicSen: number;
  epfEligible: boolean;
  socsoEligible: boolean;
  eisEligible: boolean;
  eisPriorContribution: boolean;
  allowances: Record<string, number>;
  mealRateSen: number;
  mealDays: number;
  expected: {
    grossSen: number;
    epfEeSen: number;
    epfErSen: number;
    socsoCoreSen: number;
    skbbkSen: number;
    socsoErSen: number;
    eisEeSen: number;
    eisErSen: number;
    netSen: number;
  };
}

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "tests", "golden", "july-2026.json"),
    "utf8"
  )
) as {
  periodEnd: string;
  workingDays: number;
  paidDays: number;
  totals: {
    grossSen: number;
    epfEeSen: number;
    socsoEeTotalSen: number;
    eisEeSen: number;
    netSen: number;
    epfErSen: number;
    socsoErSen: number;
    eisErSen: number;
  };
  employees: FixtureEmployee[];
};

const database = connectTestDatabase();
const { db } = database;

const COMPANY_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const RUN_ID = "DLBB-2026-07";
const PCB = { pcbAmountSen: 0, zakatOffsetSen: 0, cp38Sen: 0, verified: true };

/** What the pure golden test builds in memory, for the same employee. */
function inMemoryInputs(e: FixtureEmployee): {
  employee: EmployeeSnapshot;
  inputs: LineInputs;
} {
  const items: LineItemInput[] = [];
  for (const [code, amountSen] of Object.entries(e.allowances)) {
    if (amountSen > 0) {
      items.push({ payItemCode: code, basis: "AMOUNT", amountSen });
    }
  }
  if (e.mealDays > 0 && e.mealRateSen > 0) {
    items.push({
      payItemCode: "MEAL",
      basis: "PER_DAY",
      qty: e.mealDays,
      rateSen: e.mealRateSen,
    });
  }

  return {
    employee: {
      id: e.id,
      name: e.name,
      isMalaysian: true,
      isPermanentResident: false,
      dob: e.dob,
      payBasis: "MONTHLY",
      baseRateSen: e.basicSen,
      epfApplicable: e.epfEligible,
      socsoApplicable: e.socsoEligible,
      eisApplicable: e.eisEligible,
      pcbApplicable: true,
      epfMemberBeforeAug1998: null,
      eisPriorContribution: e.eisPriorContribution,
      epfPartOverride: null,
      socsoCategoryOverride: null,
    },
    inputs: {
      workingDays: fixture.workingDays,
      paidDays: fixture.paidDays,
      hoursWorked: null,
      items,
      periodEnd: fixture.periodEnd,
    },
  };
}

/** Order-independent comparison: the store has no obligation to preserve entry order. */
function sortItems(items: readonly LineItemInput[]): LineItemInput[] {
  return [...items].sort((a, b) => a.payItemCode.localeCompare(b.payItemCode));
}

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  const rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'DLBB', 'DLB Bina Sdn Bhd', false)`);

  const itemIds = new Map<string, string>();
  const catalog = await db.execute<{ id: string; code: string }>(
    sql`SELECT id, code FROM pay_items`
  );
  for (const row of catalog.rows) {
    itemIds.set(row.code, row.id);
  }

  for (const e of fixture.employees) {
    const employmentId = await db
      .execute<{ id: string }>(
        sql`
        WITH new_person AS (
          INSERT INTO persons (name, ic, dob) VALUES (${e.name}, ${e.ic}, ${e.dob})
          RETURNING id
        )
        INSERT INTO employments (
          person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
          epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
          eis_prior_contribution)
        SELECT new_person.id, ${COMPANY_ID}, ${e.id}, '2020-01-01', 'MONTHLY', ${e.basicSen},
               ${e.epfEligible}, ${e.socsoEligible}, ${e.eisEligible}, true,
               ${e.eisPriorContribution}
        FROM new_person
        RETURNING id`
      )
      .then((r) => r.rows[0]?.id);

    if (employmentId === undefined) {
      throw new Error(`failed to create employment for ${e.id}`);
    }

    for (const [code, amountSen] of Object.entries(e.allowances)) {
      if (amountSen > 0) {
        await db.execute(sql`
          INSERT INTO employment_pay_items (employment_id, pay_item_id, amount_sen)
          VALUES (${employmentId}, ${itemIds.get(code)}, ${amountSen})`);
      }
    }
    if (e.mealDays > 0 && e.mealRateSen > 0) {
      await db.execute(sql`
        INSERT INTO employment_pay_items (employment_id, pay_item_id, rate_sen)
        VALUES (${employmentId}, ${itemIds.get("MEAL")}, ${e.mealRateSen})`);
    }
  }

  await createRun(db, {
    runId: RUN_ID,
    companyId: COMPANY_ID,
    rulePackId,
    year: 2026,
    month: 7,
    periodStart: "2026-07-01",
    periodEnd: fixture.periodEnd,
    workingDays: fixture.workingDays,
    paidDays: fixture.paidDays,
    actor: "golden-parity-test",
  });
});

afterAll(async () => {
  await database.close();
});

describe("the database feeds the engine exactly what the pure test builds", () => {
  it("includes all 37 employees by employment-period overlap", async () => {
    const run = await loadRunForCompute(db, RUN_ID);
    expect(run.lines.length).toBe(37);
  });

  it("produces byte-identical engine inputs, per employee", async () => {
    const run = await loadRunForCompute(db, RUN_ID);
    const loaded = new Map(run.lines.map((l) => [l.employee.id, l]));

    for (const e of fixture.employees) {
      const line = loaded.get(e.id);
      expect(line, `line for ${e.id}`).toBeDefined();
      if (line === undefined) {
        continue;
      }

      const expectedInput = inMemoryInputs(e);

      expect(line.employee, `${e.id} employee snapshot`).toEqual(
        expectedInput.employee
      );
      expect(
        { ...line.inputs, items: sortItems(line.inputs.items) },
        `${e.id} line inputs`
      ).toEqual({
        ...expectedInput.inputs,
        items: sortItems(expectedInput.inputs.items),
      });
    }
  });

  it("loads the same statutory tables the fixture was verified against", async () => {
    const run = await loadRunForCompute(db, RUN_ID);
    const tables = await loadStatutoryTables(db, run.rulePackId);
    expect(tables.epf.A.length).toBeGreaterThan(0);
    expect(tables.epf.C.length).toBeGreaterThan(0);
    expect(tables.epf.E.length).toBeGreaterThan(0);
    expect(tables.socso.length).toBeGreaterThan(0);
    expect(tables.eis.length).toBeGreaterThan(0);
  });
});

describe("computing from the database reproduces the July 2026 run", () => {
  async function computeAll(): Promise<LineResult[]> {
    const run = await loadRunForCompute(db, RUN_ID);
    const [tables, settings, payItems] = await Promise.all([
      loadStatutoryTables(db, run.rulePackId),
      loadRuleSettings(db, run.rulePackId),
      loadPayItems(db),
    ]);

    return run.lines.map((line) =>
      computeLine({
        employee: line.employee,
        inputs: line.inputs,
        payItems,
        tables,
        settings,
        overrides: line.overrides,
        pcb: PCB,
      })
    );
  }

  it("matches every employee's figures to the sen", async () => {
    const run = await loadRunForCompute(db, RUN_ID);
    const [tables, settings, payItems] = await Promise.all([
      loadStatutoryTables(db, run.rulePackId),
      loadRuleSettings(db, run.rulePackId),
      loadPayItems(db),
    ]);
    const byId = new Map(run.lines.map((l) => [l.employee.id, l]));

    for (const e of fixture.employees) {
      const line = byId.get(e.id);
      if (line === undefined) {
        throw new Error(`no line for ${e.id}`);
      }
      const r = computeLine({
        employee: line.employee,
        inputs: line.inputs,
        payItems,
        tables,
        settings,
        overrides: line.overrides,
        pcb: PCB,
      });

      expect(r.grossSen, `${e.id} gross`).toBe(e.expected.grossSen);
      expect(r.epfEeSen, `${e.id} EPF EE`).toBe(e.expected.epfEeSen);
      expect(r.epfErSen, `${e.id} EPF ER`).toBe(e.expected.epfErSen);
      expect(r.socsoEeCoreSen, `${e.id} SOCSO core`).toBe(
        e.expected.socsoCoreSen
      );
      expect(r.socsoEeSkbbkSen, `${e.id} SKBBK`).toBe(e.expected.skbbkSen);
      expect(r.socsoErSen, `${e.id} SOCSO ER`).toBe(e.expected.socsoErSen);
      expect(r.eisEeSen, `${e.id} EIS EE`).toBe(e.expected.eisEeSen);
      expect(r.eisErSen, `${e.id} EIS ER`).toBe(e.expected.eisErSen);
      expect(r.netSen, `${e.id} net`).toBe(e.expected.netSen);
    }
  });

  it("matches the run totals to the sen", async () => {
    const results = await computeAll();
    const sum = (pick: (r: LineResult) => number | null): number =>
      results.reduce((total, r) => total + (pick(r) ?? 0), 0);

    expect(sum((r) => r.grossSen)).toBe(fixture.totals.grossSen);
    expect(sum((r) => r.epfEeSen)).toBe(fixture.totals.epfEeSen);
    expect(sum((r) => r.socsoEeCoreSen + r.socsoEeSkbbkSen)).toBe(
      fixture.totals.socsoEeTotalSen
    );
    expect(sum((r) => r.eisEeSen)).toBe(fixture.totals.eisEeSen);
    expect(sum((r) => r.netSen)).toBe(fixture.totals.netSen);
    expect(sum((r) => r.epfErSen)).toBe(fixture.totals.epfErSen);
    expect(sum((r) => r.socsoErSen)).toBe(fixture.totals.socsoErSen);
    expect(sum((r) => r.eisErSen)).toBe(fixture.totals.eisErSen);
  });

  it("persists what it computed", async () => {
    // PCB is absent in the database, so net is unknown until it is entered —
    // the run computes and stores every statutory figure regardless.
    const outcome = await recomputeRun(db, RUN_ID, "golden-parity-test");
    expect(outcome.failures).toEqual([]);
    expect(outcome.computed).toBe(37);

    const stored = await db.execute<{
      gross: string;
      epf_ee: string;
      net: string | null;
    }>(
      sql`SELECT COALESCE(SUM(gross_sen), 0)::text AS gross,
                 COALESCE(SUM(epf_ee_sen), 0)::text AS epf_ee,
                 SUM(net_sen)::text AS net
          FROM pay_lines WHERE run_id = ${RUN_ID}`
    );
    const [row] = stored.rows;
    expect(Number(row?.gross)).toBe(fixture.totals.grossSen);
    expect(Number(row?.epf_ee)).toBe(fixture.totals.epfEeSen);
    // Net is null for every line: PCB has not been entered, so it is unknown.
    expect(row?.net).toBeNull();
  });
});
