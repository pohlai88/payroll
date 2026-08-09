/**
 * @feature treatments
 * @layer test
 *
 * S06 APPROVED_DEPARTURE: actor ≠ approver, reason required, system items blocked.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  recordPcbClassDeparture,
  recordWageTreatmentDeparture,
} from "@/service/treatments";
import { seed } from "../../scripts/seed";
import {
  ALL_TABLES,
  connectTestDatabase,
  expectRejected,
  type TestDatabase,
} from "./harness/database";

const database: TestDatabase = connectTestDatabase();
const { db } = database;

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.truncate(...ALL_TABLES);
  await seed(db);
});

async function nonSystemItemId(): Promise<string> {
  const row = await db.execute<{ id: string }>(sql`
    SELECT id FROM pay_items WHERE is_system = false AND kind = 'EARNING'
    ORDER BY code LIMIT 1`);
  const id = row.rows[0]?.id;
  if (id === undefined) {
    throw new Error("expected a non-system earning in seed");
  }
  return id;
}

describe("recordWageTreatmentDeparture", () => {
  it("rejects when actor equals approvedBy", async () => {
    const payItemId = await nonSystemItemId();
    await expectRejected(
      recordWageTreatmentDeparture(db, {
        payItemId,
        scheme: "EPF",
        subject: false,
        effectiveFrom: "2026-10-01",
        reason: "policy exception",
        actor: "same@test",
        approvedBy: "same@test",
      }),
      /approvedBy must differ from actor/
    );
  });

  it("supersedes open treatment and inserts APPROVED_DEPARTURE", async () => {
    const payItemId = await nonSystemItemId();
    const { id } = await recordWageTreatmentDeparture(db, {
      payItemId,
      scheme: "HRD",
      subject: false,
      effectiveFrom: "2026-10-01",
      reason: "HRD levy base excludes this allowance",
      actor: "admin@test",
      approvedBy: "compliance@test",
    });

    const row = await db.execute<{ source: string; subject: boolean }>(sql`
      SELECT source::text, subject FROM pay_item_treatments WHERE id = ${id}`);
    expect(row.rows[0]?.source).toBe("APPROVED_DEPARTURE");
    expect(row.rows[0]?.subject).toBe(false);
  });

  it("rejects departure on system items", async () => {
    const row = await db.execute<{ id: string }>(sql`
      SELECT id FROM pay_items WHERE code = 'BASIC' LIMIT 1`);
    const payItemId = row.rows[0]?.id;
    expect(payItemId).toBeTruthy();
    await expectRejected(
      recordWageTreatmentDeparture(db, {
        payItemId: payItemId as string,
        scheme: "EPF",
        subject: false,
        effectiveFrom: "2026-10-01",
        reason: "should fail",
        actor: "admin@test",
        approvedBy: "compliance@test",
      }),
      /system pay items cannot change/
    );
  });
});

describe("recordPcbClassDeparture", () => {
  it("records ADDITIONAL class with distinct approver", async () => {
    const payItemId = await nonSystemItemId();
    const { id } = await recordPcbClassDeparture(db, {
      payItemId,
      class: "ADDITIONAL",
      effectiveFrom: "2026-10-01",
      reason: "LHDN additional remuneration",
      actor: "admin@test",
      approvedBy: "compliance@test",
    });
    const row = await db.execute<{ class: string }>(sql`
      SELECT class::text FROM pay_item_pcb_classes WHERE id = ${id}`);
    expect(row.rows[0]?.class).toBe("ADDITIONAL");
  });
});
