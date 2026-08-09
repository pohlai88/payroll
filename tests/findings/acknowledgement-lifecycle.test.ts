/**
 * P0B — acknowledgement is revision-bound for gate-relevant findings.
 * Spec: docs/superpowers/specs/2026-08-09-code-quality-findings-assurance-design.md §0B
 *
 * Note: calcRevision is a content hash. Identical recompute keeps the same
 * revision; tests that need a new revision must change calc-relevant state.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anomalyFindings, findingEvents } from "@/db/schema/findings";
import { payLines, payRuns } from "@/db/schema/run";
import { createRun, recomputeRun } from "@/service/payrun";
import { acknowledgeRunFinding } from "@/service/run-findings";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "../db/harness/database";

const database = connectTestDatabase();
const { db } = database;

const COMPANY_ID = "bbbbbbbb-0000-4000-8000-0000000000c2";
const PERSON_ID = "bbbbbbbb-0000-4000-8000-0000000000d2";
const EMPLOYMENT_ID = "bbbbbbbb-0000-4000-8000-0000000000e2";
const RUN_ID = "ACK-REV-2026-07";

let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'ACKCO', 'Ack Revision Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'ACK WORKER', '900101-10-2222', '1990-01-01')`);
  // EPF applicable without registration number → MISSING_STATUTORY_NO (REVIEW)
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
      bank_name, bank_account_no, bank_account_name)
    VALUES (${EMPLOYMENT_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'ACK001', '2020-01-01',
            'MONTHLY', 500000, true, false, false, false,
            'OCBC', '2222222222', 'ACK WORKER')`);
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

async function setupMissingStatutory(): Promise<{
  revision: string;
  findingId: string;
}> {
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
  if (outcome.failures.length > 0) {
    throw new Error(`recompute failed: ${JSON.stringify(outcome.failures)}`);
  }
  const [run] = await db
    .select()
    .from(payRuns)
    .where(eq(payRuns.id, RUN_ID))
    .limit(1);
  if (run?.calcRevision === null || run?.calcRevision === undefined) {
    throw new Error("missing calcRevision");
  }

  const [finding] = await db
    .select()
    .from(anomalyFindings)
    .where(
      and(
        eq(anomalyFindings.runId, RUN_ID),
        eq(anomalyFindings.ruleId, "MISSING_STATUTORY_NO")
      )
    )
    .limit(1);
  if (finding === undefined) {
    throw new Error("expected MISSING_STATUTORY_NO finding");
  }
  expect(finding.severity).toBe("REVIEW");
  return { revision: run.calcRevision, findingId: finding.id };
}

/** Change paid days so content-hash calcRevision advances; evidence of missing EPF no stays stable. */
async function bumpCalcRevision(): Promise<string> {
  await db
    .update(payLines)
    .set({ paidDays: "21" })
    .where(eq(payLines.runId, RUN_ID));
  const outcome = await recomputeRun(db, RUN_ID, "tester@example.com");
  if (outcome.failures.length > 0) {
    throw new Error(`recompute failed: ${JSON.stringify(outcome.failures)}`);
  }
  const [run] = await db
    .select()
    .from(payRuns)
    .where(eq(payRuns.id, RUN_ID))
    .limit(1);
  if (run?.calcRevision === null || run?.calcRevision === undefined) {
    throw new Error("missing calcRevision after bump");
  }
  return run.calcRevision;
}

describe("acknowledgement revision binding", () => {
  it("acknowledgement event captures calcRevision", async () => {
    const { revision, findingId } = await setupMissingStatutory();
    await acknowledgeRunFinding(db, findingId, "tester@example.com");

    const [event] = await db
      .select()
      .from(findingEvents)
      .where(
        and(
          eq(findingEvents.findingId, findingId),
          eq(findingEvents.kind, "ACKNOWLEDGED")
        )
      )
      .limit(1);

    expect(event?.evidence).toMatchObject({ calcRevision: revision });
  });

  it("identical recompute preserves acknowledgement when calcRevision is unchanged", async () => {
    const { revision: r1, findingId } = await setupMissingStatutory();
    await acknowledgeRunFinding(db, findingId, "tester@example.com");

    await recomputeRun(db, RUN_ID, "tester@example.com");
    const [run] = await db.select().from(payRuns).where(eq(payRuns.id, RUN_ID));
    expect(run?.calcRevision).toBe(r1);

    const [after] = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.id, findingId));
    expect(after?.status).toBe("ACKNOWLEDGED");
  });

  it("new calcRevision reopens acknowledged gate-relevant finding with identical evidence", async () => {
    const { revision: r1, findingId } = await setupMissingStatutory();
    await acknowledgeRunFinding(db, findingId, "tester@example.com");

    const [acked] = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.id, findingId));
    expect(acked?.status).toBe("ACKNOWLEDGED");
    const fingerprintBefore = acked?.fingerprint;

    const r2 = await bumpCalcRevision();
    expect(r2).not.toBe(r1);

    const [after] = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.id, findingId));
    expect(after?.status).toBe("OPEN");
    expect(after?.ackActor).toBeNull();
    expect(after?.fingerprint).toBe(fingerprintBefore);
    expect(after?.detectedRevision).toBe(r2);

    const [reopen] = await db
      .select()
      .from(findingEvents)
      .where(
        and(
          eq(findingEvents.findingId, findingId),
          eq(findingEvents.kind, "REOPENED")
        )
      )
      .orderBy(desc(findingEvents.at))
      .limit(1);

    expect(reopen?.evidence).toMatchObject({ reason: "REVISION_CHANGED" });
  });

  it("OPEN finding on new revision updates detectedRevision", async () => {
    const { revision: r1, findingId } = await setupMissingStatutory();
    expect(
      (
        await db
          .select()
          .from(anomalyFindings)
          .where(eq(anomalyFindings.id, findingId))
      )[0]?.status
    ).toBe("OPEN");

    const r2 = await bumpCalcRevision();
    expect(r2).not.toBe(r1);

    const [finding] = await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.id, findingId));
    expect(finding?.status).toBe("OPEN");
    expect(finding?.detectedRevision).toBe(r2);
  });
});
