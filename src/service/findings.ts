/**
 * @feature findings
 * @layer service
 * @hub src/server/routes/pay-run.ts
 *
 * Transfer findings engine: upsert / acknowledge / list + APPROVAL soft gate.
 * §8.6: scanTransferFindings on commit; scanRunTransferFindings from pay-run scan.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { anomalyFindings, findingEvents } from "@/db/schema/findings";
import { employments, persons } from "@/db/schema/parties";
import { payLines, payRuns } from "@/db/schema/run";
import { employmentPriorYtd, transfers } from "@/db/schema/transfer";
import { fingerprintOf } from "@/domain/findings/fingerprint";
import {
  collectTransferCommitFindings,
  detectPersonInBothEmployers,
  detectReceivingRegistrationInvalid,
  detectTransferFinalPayMissing,
  detectTransferPriorTaxMissing,
  type TransferLinkFacts,
} from "@/domain/findings/transfer-rules";
import type { DetectedFinding } from "@/domain/findings/types";
import { requirePermission } from "@/service/rbac";
import { ControlError } from "./control-errors";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;

export async function upsertFindings(
  db: Db,
  detected: readonly DetectedFinding[],
  actor = "system"
): Promise<void> {
  for (const d of detected) {
    const fingerprint = fingerprintOf(d.evidence);
    const existing = await findExisting(db, d);
    if (existing === undefined) {
      const [inserted] = await db
        .insert(anomalyFindings)
        .values({
          runId: d.runId ?? null,
          transferId: d.transferId ?? null,
          lineId: d.lineId ?? null,
          ruleId: d.ruleId,
          fingerprint,
          severity: d.severity,
          blocks: [...d.blocks],
          title: d.title,
          detail: d.detail,
          evidence: d.evidence,
          status: "OPEN",
        })
        .returning({ id: anomalyFindings.id });
      if (inserted) {
        await db.insert(findingEvents).values({
          findingId: inserted.id,
          kind: "DETECTED",
          evidence: d.evidence,
          actor,
        });
      }
      continue;
    }

    if (existing.fingerprint === fingerprint && existing.status === "OPEN") {
      continue;
    }

    if (existing.fingerprint !== fingerprint) {
      await db
        .update(anomalyFindings)
        .set({
          fingerprint,
          severity: d.severity,
          blocks: [...d.blocks],
          title: d.title,
          detail: d.detail,
          evidence: d.evidence,
          status: "OPEN",
          ackNote: null,
          ackActor: null,
          ackAt: null,
          updatedAt: new Date(),
        })
        .where(eq(anomalyFindings.id, existing.id));
      await db.insert(findingEvents).values({
        findingId: existing.id,
        kind: existing.status === "OPEN" ? "DETECTED" : "REOPENED",
        evidence: d.evidence,
        actor,
      });
    }
  }
}

async function findExisting(
  db: Db,
  d: DetectedFinding
): Promise<
  | {
      id: string;
      fingerprint: string;
      status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
    }
  | undefined
> {
  if (d.runId) {
    const [row] = await db
      .select({
        id: anomalyFindings.id,
        fingerprint: anomalyFindings.fingerprint,
        status: anomalyFindings.status,
      })
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.runId, d.runId),
          d.lineId
            ? eq(anomalyFindings.lineId, d.lineId)
            : isNull(anomalyFindings.lineId),
          eq(anomalyFindings.ruleId, d.ruleId)
        )
      )
      .limit(1);
    return row;
  }
  if (d.transferId) {
    const [row] = await db
      .select({
        id: anomalyFindings.id,
        fingerprint: anomalyFindings.fingerprint,
        status: anomalyFindings.status,
      })
      .from(anomalyFindings)
      .where(
        and(
          eq(anomalyFindings.transferId, d.transferId),
          eq(anomalyFindings.ruleId, d.ruleId),
          isNull(anomalyFindings.runId)
        )
      )
      .limit(1);
    return row;
  }
}

async function acknowledgeFinding(
  db: Db,
  findingId: string,
  opts: { actor: string; note?: string | null }
): Promise<void> {
  // Transfer-scoped acknowledgements only. Pay-run findings use
  // `acknowledgeRunFinding` (freeze + severity rules).
  const [row] = await db
    .select()
    .from(anomalyFindings)
    .where(eq(anomalyFindings.id, findingId))
    .limit(1);
  if (row === undefined) {
    throw new ControlError("NOT_FOUND", `no such finding: ${findingId}`);
  }
  if (row.runId !== null) {
    throw new ControlError(
      "INVALID_STATE",
      "pay-run findings must be acknowledged via acknowledgeRunFinding"
    );
  }
  if (row.severity === "BLOCKING") {
    throw new ControlError(
      "INVALID_STATE",
      "BLOCKING findings cannot be acknowledged — fix the condition"
    );
  }
  await db
    .update(anomalyFindings)
    .set({
      status: "ACKNOWLEDGED",
      ackActor: opts.actor,
      ackNote: opts.note ?? null,
      ackAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(anomalyFindings.id, findingId));
  await db.insert(findingEvents).values({
    findingId,
    kind: "ACKNOWLEDGED",
    evidence: { note: opts.note ?? null, fingerprint: row.fingerprint },
    actor: opts.actor,
  });
}

/**
 * Acknowledge a transfer-scoped finding on behalf of an actor.
 *
 * Doctrine (transfer-finding authority, see
 * `docs/superpowers/specs/2026-08-08-internal-group-transfer-design.md`):
 * a transfer finding that evaluates facts across the source and destination
 * employments is governed by both employment scopes. Acknowledgement requires
 * `EMPLOYMENT UPDATE` authority for both the source and destination companies.
 * Duplicate company scopes are evaluated once.
 *
 * The findings reachable here are the two from `collectTransferCommitFindings`
 * — TRANSFER_OVERLAP_DATES and SERVICE_DATES_INCONSISTENT — each comparing
 * Employment A's dates against Employment B's.
 *
 * Run-scoped findings are excluded by doctrine and by construction: the inner
 * join on `transferId` is null for them, so they resolve to NOT_FOUND before
 * `acknowledgeFinding`'s own run-scoped guard is reached.
 */
export async function acknowledgeTransferFindingForActor(
  db: Database,
  actor: { readonly userId: string; readonly email: string },
  findingId: string,
  opts: { readonly note?: string | null } = {}
): Promise<void> {
  const [link] = await db
    .select({
      fromEmploymentId: transfers.fromEmploymentId,
      toEmploymentId: transfers.toEmploymentId,
    })
    .from(anomalyFindings)
    .innerJoin(transfers, eq(transfers.id, anomalyFindings.transferId))
    .where(eq(anomalyFindings.id, findingId))
    .limit(1);
  if (link === undefined) {
    throw new ControlError(
      "NOT_FOUND",
      `no such transfer finding: ${findingId}`
    );
  }

  const sides = await db
    .select({ companyId: employments.companyId })
    .from(employments)
    .where(
      inArray(employments.id, [link.fromEmploymentId, link.toEmploymentId])
    );
  if (sides.length === 0) {
    throw new ControlError(
      "NOT_FOUND",
      `transfer finding ${findingId} has no resolvable employments`
    );
  }

  // De-duplicated: an intra-company transfer asks for the permission once.
  for (const companyId of new Set(sides.map((side) => side.companyId))) {
    await requirePermission(
      db,
      actor.userId,
      "EMPLOYMENT",
      "UPDATE",
      companyId
    );
  }

  await acknowledgeFinding(db, findingId, {
    actor: actor.email,
    note: opts.note,
  });
}

export async function listFindings(
  db: Db,
  filter: { runId?: string; transferId?: string }
): Promise<(typeof anomalyFindings.$inferSelect)[]> {
  if (filter.runId) {
    return await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.runId, filter.runId));
  }
  if (filter.transferId) {
    return await db
      .select()
      .from(anomalyFindings)
      .where(eq(anomalyFindings.transferId, filter.transferId));
  }
  return [];
}

/**
 * Findings-only APPROVAL soft check (open BLOCKING/WARNING that block APPROVAL).
 * Full lifecycle gates use `evaluateGate` (scan stamp + prerequisites + findings).
 */
export async function assertApprovalAllowed(
  db: Db,
  runId: string
): Promise<void> {
  const open = await db
    .select()
    .from(anomalyFindings)
    .where(
      and(eq(anomalyFindings.runId, runId), eq(anomalyFindings.status, "OPEN"))
    );

  const blockers = open.filter((f) => {
    const blocks = f.blocks ?? [];
    if (!blocks.includes("APPROVAL")) {
      return false;
    }
    return f.severity === "BLOCKING" || f.severity === "WARNING";
  });

  if (blockers.length > 0) {
    const ids = blockers.map((b) => b.ruleId).join(", ");
    throw new ControlError(
      "GATE_BLOCKED",
      `approval blocked by open findings on run ${runId}: ${ids}`
    );
  }
}

async function loadTransferLinkFacts(
  db: Db,
  transferId: string
): Promise<TransferLinkFacts> {
  const [row] = await db
    .select({
      transferId: transfers.id,
      personId: transfers.personId,
      fromEmploymentId: transfers.fromEmploymentId,
      toEmploymentId: transfers.toEmploymentId,
      toJoinDate: transfers.effectiveDate,
      groupServiceContinuity: transfers.groupServiceContinuity,
      finalPayRunId: transfers.finalPayRunId,
      commencementRunId: transfers.commencementRunId,
      fromTerminationDate: employments.terminationDate,
      groupServiceDate: persons.groupServiceDate,
    })
    .from(transfers)
    .innerJoin(employments, eq(employments.id, transfers.fromEmploymentId))
    .innerJoin(persons, eq(persons.id, transfers.personId))
    .where(eq(transfers.id, transferId))
    .limit(1);

  if (row === undefined) {
    throw new Error(`no such transfer: ${transferId}`);
  }

  return {
    transferId: row.transferId,
    personId: row.personId,
    fromEmploymentId: row.fromEmploymentId,
    toEmploymentId: row.toEmploymentId,
    fromTerminationDate: row.fromTerminationDate,
    toJoinDate: row.toJoinDate,
    groupServiceContinuity: row.groupServiceContinuity,
    groupServiceDate: row.groupServiceDate,
    finalPayRunId: row.finalPayRunId,
    commencementRunId: row.commencementRunId,
  };
}

export async function scanTransferFindings(
  db: Db,
  transferId: string,
  actor = "system"
): Promise<DetectedFinding[]> {
  const facts = await loadTransferLinkFacts(db, transferId);
  const detected = collectTransferCommitFindings(facts);
  await upsertFindings(db, detected, actor);
  await resolveClearedTransferFindings(db, transferId, detected, actor);
  return detected;
}

async function resolveClearedTransferFindings(
  db: Db,
  transferId: string,
  detected: readonly DetectedFinding[],
  actor: string
): Promise<void> {
  const keep = new Set(detected.map((d) => d.ruleId));
  const open = await db
    .select()
    .from(anomalyFindings)
    .where(
      and(
        eq(anomalyFindings.transferId, transferId),
        isNull(anomalyFindings.runId),
        eq(anomalyFindings.status, "OPEN")
      )
    );
  for (const prev of open) {
    if (keep.has(prev.ruleId)) {
      continue;
    }
    await db
      .update(anomalyFindings)
      .set({
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolutionType: "CONDITION_CLEARED",
        updatedAt: new Date(),
      })
      .where(eq(anomalyFindings.id, prev.id));
    await db.insert(findingEvents).values({
      findingId: prev.id,
      kind: "RESOLVED",
      actor,
      evidence: { resolutionType: "CONDITION_CLEARED" },
    });
  }
}

export async function scanRunTransferFindings(
  db: Db,
  runId: string,
  actor = "system"
): Promise<DetectedFinding[]> {
  const [run] = await db
    .select()
    .from(payRuns)
    .where(eq(payRuns.id, runId))
    .limit(1);
  if (run === undefined) {
    throw new Error(`no such run: ${runId}`);
  }

  const detected: DetectedFinding[] = [];
  const calendarYear = Number(run.periodEnd.slice(0, 4));

  const lines = await db
    .select({
      lineId: payLines.id,
      employmentId: payLines.employmentId,
      personId: employments.personId,
      companyId: employments.companyId,
      epfApplicable: employments.epfApplicable,
      socsoApplicable: employments.socsoApplicable,
      eisApplicable: employments.eisApplicable,
      epfNo: employments.epfNo,
      socsoNo: employments.socsoNo,
      pcbApplicable: employments.pcbApplicable,
      priorEmploymentId: employments.priorEmploymentId,
    })
    .from(payLines)
    .innerJoin(employments, eq(employments.id, payLines.employmentId))
    .where(eq(payLines.runId, runId));

  // PERSON_IN_BOTH_EMPLOYERS: within this run's company, also check other
  // regular runs covering the same period for the same person.
  const personIds = [...new Set(lines.map((l) => l.personId))];
  for (const personId of personIds) {
    const other = await db.execute<{ company_id: string }>(sql`
      SELECT DISTINCT e.company_id
      FROM pay_lines pl
      JOIN employments e ON e.id = pl.employment_id
      JOIN pay_runs r ON r.id = pl.run_id
      WHERE e.person_id = ${personId}
        AND r.run_type = 'REGULAR'
        AND r.period_start <= ${run.periodEnd}
        AND r.period_end >= ${run.periodStart}
    `);
    const companyIds = other.rows.map((r) => r.company_id);
    let explainingTransferId: string | null = null;
    if (companyIds.length >= 2) {
      // Transfer explains dual-employer presence only when from/to companies
      // are both among the companies seen in overlapping regular runs.
      const companyList = sql.join(
        companyIds.map((id) => sql`${id}`),
        sql`, `
      );
      const explaining = await db.execute<{ id: string }>(sql`
        SELECT t.id
        FROM transfers t
        JOIN employments fa ON fa.id = t.from_employment_id
        JOIN employments tb ON tb.id = t.to_employment_id
        WHERE t.person_id = ${personId}
          AND fa.company_id IN (${companyList})
          AND tb.company_id IN (${companyList})
        LIMIT 1
      `);
      explainingTransferId = explaining.rows[0]?.id ?? null;
    }
    const finding = detectPersonInBothEmployers({
      runId,
      personId,
      companyIds,
      explainingTransferId,
    });
    if (finding) {
      detected.push(finding);
    }
  }

  const seenTransfers = new Set<string>();

  for (const line of lines) {
    if (line.priorEmploymentId) {
      const [transfer] = await db
        .select()
        .from(transfers)
        .where(eq(transfers.toEmploymentId, line.employmentId))
        .limit(1);
      if (transfer && !seenTransfers.has(transfer.id)) {
        seenTransfers.add(transfer.id);

        const [prior] = await db
          .select()
          .from(employmentPriorYtd)
          .where(
            and(
              eq(employmentPriorYtd.employmentId, line.employmentId),
              eq(employmentPriorYtd.calendarYear, calendarYear)
            )
          )
          .limit(1);
        const priorFinding = detectTransferPriorTaxMissing({
          runId,
          transferId: transfer.id,
          employmentId: line.employmentId,
          pcbApplicable: line.pcbApplicable,
          calendarYear,
          priorYtdVerified: prior?.verified === true,
        });
        if (priorFinding) {
          detected.push(priorFinding);
        }

        let hasFinalPayCoveringLastPeriod = transfer.finalPayRunId !== null;
        if (!hasFinalPayCoveringLastPeriod) {
          const [fromEmp] = await db
            .select({ terminationDate: employments.terminationDate })
            .from(employments)
            .where(eq(employments.id, transfer.fromEmploymentId))
            .limit(1);
          const terminationDate = fromEmp?.terminationDate;
          if (terminationDate) {
            const finalCover = await db.execute<{ id: string }>(sql`
              SELECT r.id FROM pay_runs r
              JOIN pay_lines pl ON pl.run_id = r.id
              WHERE pl.employment_id = ${transfer.fromEmploymentId}
                AND r.period_start <= ${terminationDate}
                AND r.period_end >= ${terminationDate}
                AND (r.run_type = 'REGULAR' OR r.offcycle_reason = 'FINAL_PAYMENT')
              LIMIT 1
            `);
            hasFinalPayCoveringLastPeriod = finalCover.rows.length > 0;
          }
        }

        const finalFinding = detectTransferFinalPayMissing({
          runId,
          transferId: transfer.id,
          commencementRunId: transfer.commencementRunId,
          hasFinalPayCoveringLastPeriod,
        });
        if (finalFinding) {
          detected.push(finalFinding);
        }
      }
    }

    const reg = detectReceivingRegistrationInvalid({
      runId,
      lineId: line.lineId,
      employmentId: line.employmentId,
      epfApplicable: line.epfApplicable,
      socsoApplicable: line.socsoApplicable,
      eisApplicable: line.eisApplicable,
      epfNo: line.epfNo,
      socsoNo: line.socsoNo,
    });
    if (reg) {
      detected.push(reg);
    }
  }

  await upsertFindings(db, detected, actor);
  return detected;
}
