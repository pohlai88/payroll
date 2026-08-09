/**
 * Release batches, payment attempts, generic payment register CSV.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  linePayments,
  paymentAttempts,
  releaseBatches,
} from "@/db/schema/control";
import { employments } from "@/db/schema/parties";
import { auditEvents, payLines } from "@/db/schema/run";
import type { ArtifactStore } from "@/domain/artifacts/store";
import { formatRM } from "@/domain/money";
import { storeArtifact } from "./artifacts";
import { ControlError } from "./control-errors";
import { evaluateGate } from "./gates";
import { releaseLine, returnToReady, settleLine } from "./payments";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ReleasePreview {
  readonly eligible: readonly {
    readonly lineId: string;
    readonly employmentId: string;
    readonly netSen: number;
    readonly bank: string;
    readonly account: string;
    readonly name: string;
  }[];
  readonly excluded: readonly {
    readonly lineId: string;
    readonly reason: string;
  }[];
  readonly totalSen: number;
  readonly byBank: readonly {
    readonly bank: string;
    readonly count: number;
    readonly totalSen: number;
  }[];
}

export async function previewRelease(
  db: Database,
  runId: string,
  lineIds: readonly string[]
): Promise<ReleasePreview> {
  const gate = await evaluateGate(db, runId, "RELEASE", { lineIds });

  // Run-scoped / prerequisite RELEASE issues have no lineId. Partial release
  // must not proceed when the whole gate is closed.
  const globalIssues = gate.issues.filter((i) => i.lineId === undefined);
  if (globalIssues.length > 0) {
    const reason = globalIssues[0]?.message ?? "RELEASE gate blocked";
    return {
      eligible: [],
      excluded: lineIds.map((lineId) => ({ lineId, reason })),
      totalSen: 0,
      byBank: [],
    };
  }

  const gateBlocked = new Set(
    gate.issues
      .filter((i) => i.lineId !== undefined)
      .map((i) => i.lineId as string)
  );

  const lines = await db
    .select({
      lineId: payLines.id,
      employmentId: payLines.employmentId,
      netSen: payLines.netSen,
      state: linePayments.state,
      bankName: employments.bankName,
      bankAccountNo: employments.bankAccountNo,
      bankAccountName: employments.bankAccountName,
      employeeCode: employments.employeeCode,
    })
    .from(payLines)
    .innerJoin(linePayments, eq(linePayments.lineId, payLines.id))
    .innerJoin(employments, eq(employments.id, payLines.employmentId))
    .where(and(eq(payLines.runId, runId), inArray(payLines.id, [...lineIds])));

  const eligible: ReleasePreview["eligible"][number][] = [];
  const excluded: ReleasePreview["excluded"][number][] = [];

  for (const line of lines) {
    if (line.state !== "READY" && line.state !== "FAILED_RETURNED") {
      excluded.push({
        lineId: line.lineId,
        reason: `payment state is ${line.state}`,
      });
      continue;
    }
    if (gateBlocked.has(line.lineId)) {
      const issue = gate.issues.find((i) => i.lineId === line.lineId);
      excluded.push({
        lineId: line.lineId,
        reason: issue?.message ?? "RELEASE gate blocked",
      });
      continue;
    }
    if (line.netSen === null) {
      excluded.push({ lineId: line.lineId, reason: "net pay unknown" });
      continue;
    }
    const bank = line.bankName?.trim() ?? "";
    const account = line.bankAccountNo?.trim() ?? "";
    if (bank === "" || account === "") {
      excluded.push({ lineId: line.lineId, reason: "bank details missing" });
      continue;
    }
    eligible.push({
      lineId: line.lineId,
      employmentId: line.employmentId,
      netSen: line.netSen,
      bank,
      account,
      name: line.bankAccountName?.trim() || line.employeeCode,
    });
  }

  for (const id of lineIds) {
    if (
      !(
        lines.some((l) => l.lineId === id) ||
        excluded.some((e) => e.lineId === id)
      )
    ) {
      excluded.push({
        lineId: id,
        reason: "line not in run or no payment row",
      });
    }
  }

  const totalSen = eligible.reduce((s, e) => s + e.netSen, 0);
  const byBankMap = new Map<string, { count: number; totalSen: number }>();
  for (const e of eligible) {
    const cur = byBankMap.get(e.bank) ?? { count: 0, totalSen: 0 };
    cur.count += 1;
    cur.totalSen += e.netSen;
    byBankMap.set(e.bank, cur);
  }

  return {
    eligible,
    excluded,
    totalSen,
    byBank: [...byBankMap.entries()].map(([bank, v]) => ({ bank, ...v })),
  };
}

function buildRegisterCsv(
  batchId: string,
  rows: ReleasePreview["eligible"]
): string {
  const header = "employeeId,name,bank,account,amountRM,reference";
  const lines = rows.map((r) => {
    // CSV wants plain decimals; formatRM may include thousands separators.
    const amountRm = formatRM(r.netSen).replace(/,/g, "");
    const ref = `${batchId}-${r.employmentId}`;
    return [
      r.employmentId,
      csvEscape(r.name),
      csvEscape(r.bank),
      csvEscape(r.account),
      amountRm,
      ref,
    ].join(",");
  });
  return [header, ...lines].join("\n");
}

const CSV_NEEDS_QUOTING_RE = /[",\n]/;

function csvEscape(value: string): string {
  if (CSV_NEEDS_QUOTING_RE.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

async function nextBatchId(db: Transaction, runId: string): Promise<string> {
  const existing = await db
    .select({ id: releaseBatches.id })
    .from(releaseBatches)
    .where(eq(releaseBatches.runId, runId))
    .orderBy(asc(releaseBatches.id));
  const n = existing.length + 1;
  return `${runId}-B${String(n).padStart(2, "0")}`;
}

export async function commitRelease(
  db: Database,
  runId: string,
  lineIds: readonly string[],
  opts: {
    readonly method: "BANK" | "CASH";
    readonly actor: string;
    readonly store?: ArtifactStore;
  }
): Promise<{ batchId: string; registerArtifactId: string }> {
  const preview = await previewRelease(db, runId, lineIds);
  // Commit releases the eligible subset; excluded selected lines are skipped.
  const eligibleIds = new Set(preview.eligible.map((e) => e.lineId));
  const eligible = preview.eligible.filter((e) => lineIds.includes(e.lineId));
  if (eligible.length === 0 || eligibleIds.size === 0) {
    throw new ControlError("VALIDATION_ERROR", "no eligible lines to release");
  }

  return await db.transaction(async (tx) => {
    const batchId = await nextBatchId(tx, runId);
    const csv = buildRegisterCsv(batchId, eligible);
    const body = new TextEncoder().encode(csv);

    // Insert batch first without artifact, then attach
    await tx.insert(releaseBatches).values({
      id: batchId,
      runId,
      method: opts.method,
      status: "OPEN",
      totalSen: eligible.reduce((s, e) => s + e.netSen, 0),
      lineCount: eligible.length,
      createdBy: opts.actor,
    });

    for (const row of eligible) {
      await tx.insert(paymentAttempts).values({
        batchId,
        lineId: row.lineId,
        amountSen: row.netSen,
        bankSnapshot: {
          bank: row.bank,
          account: row.account,
          name: row.name,
        },
        status: "PENDING",
      });
      await releaseLine(tx, row.lineId, batchId, opts.actor);
    }

    const stored = await storeArtifact(
      tx,
      {
        runId,
        type: opts.method === "CASH" ? "CASH_SHEET" : "PAYMENT_REGISTER",
        filename: `${batchId}-register.csv`,
        body,
        mimeType: "text/csv",
        createdBy: opts.actor,
        source: "GENERATED",
        entityId: batchId,
      },
      opts.store
    );

    await tx
      .update(releaseBatches)
      .set({ registerArtifactId: stored.id })
      .where(eq(releaseBatches.id, batchId));

    await tx.insert(auditEvents).values({
      actor: opts.actor,
      runId,
      entity: "release_batches",
      entityId: batchId,
      action: "COMMIT_RELEASE",
      after: { lineCount: eligible.length, totalSen: preview.totalSen },
    });

    return { batchId, registerArtifactId: stored.id };
  });
}

export async function settleAttempt(
  db: Database,
  attemptId: string,
  input: {
    readonly outcome: "PAID" | "FAILED";
    readonly actor: string;
    readonly paymentRef?: string;
    readonly failedReason?: string;
    readonly settledAt?: string;
  }
): Promise<void> {
  await db.transaction(async (tx) => {
    const [attempt] = await tx
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, attemptId))
      .limit(1);
    if (attempt === undefined) {
      throw new ControlError("NOT_FOUND", `no such attempt: ${attemptId}`);
    }
    if (attempt.status !== "PENDING") {
      throw new ControlError(
        "INVALID_STATE",
        `attempt already settled as ${attempt.status}`
      );
    }

    const settledAt = input.settledAt ? new Date(input.settledAt) : new Date();

    await tx
      .update(paymentAttempts)
      .set({
        status: input.outcome,
        paymentRef: input.paymentRef ?? null,
        failedReason:
          input.outcome === "FAILED" ? (input.failedReason ?? "failed") : null,
        settledAt,
      })
      .where(eq(paymentAttempts.id, attemptId));

    await settleLine(tx, attempt.lineId, input.outcome, {
      actor: input.actor,
      paymentRef: input.paymentRef,
      failedReason: input.failedReason,
      settledAt,
    });

    await recomputeBatchStatus(tx, attempt.batchId);
  });
}

async function recomputeBatchStatus(
  tx: Transaction,
  batchId: string
): Promise<void> {
  const attempts = await tx
    .select({ status: paymentAttempts.status })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.batchId, batchId));

  const pending = attempts.filter((a) => a.status === "PENDING").length;
  const paid = attempts.filter((a) => a.status === "PAID").length;
  const failed = attempts.filter((a) => a.status === "FAILED").length;

  let status:
    | "OPEN"
    | "SETTLED"
    | "PARTIALLY_SETTLED"
    | "SETTLED_WITH_FAILURES";
  if (pending > 0) {
    status = paid > 0 || failed > 0 ? "PARTIALLY_SETTLED" : "OPEN";
  } else if (failed > 0 && paid > 0) {
    status = "SETTLED_WITH_FAILURES";
  } else if (failed > 0) {
    status = "SETTLED_WITH_FAILURES";
  } else {
    status = "SETTLED";
  }

  await tx
    .update(releaseBatches)
    .set({ status })
    .where(eq(releaseBatches.id, batchId));
}

export async function cancelRelease(
  db: Database,
  batchId: string,
  actor: string,
  reason: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(releaseBatches)
      .where(eq(releaseBatches.id, batchId))
      .limit(1);
    if (batch === undefined) {
      throw new ControlError("NOT_FOUND", `no such batch: ${batchId}`);
    }

    const attempts = await tx
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.batchId, batchId));

    if (attempts.some((a) => a.status !== "PENDING")) {
      throw new ControlError(
        "INVALID_STATE",
        "cannot cancel release after settlement has started"
      );
    }

    for (const attempt of attempts) {
      await tx
        .update(paymentAttempts)
        .set({
          status: "FAILED",
          failedReason: `release cancelled: ${reason}`,
          settledAt: new Date(),
        })
        .where(eq(paymentAttempts.id, attempt.id));
      await returnToReady(tx, attempt.lineId, actor);
    }

    await tx
      .update(releaseBatches)
      .set({ status: "CANCELLED" })
      .where(eq(releaseBatches.id, batchId));

    await tx.insert(auditEvents).values({
      actor,
      runId: batch.runId,
      entity: "release_batches",
      entityId: batchId,
      action: "CANCEL_RELEASE",
      after: { reason },
    });
  });
}

export async function getBatch(db: Database, batchId: string) {
  const [batch] = await db
    .select()
    .from(releaseBatches)
    .where(eq(releaseBatches.id, batchId))
    .limit(1);
  if (batch === undefined) {
    throw new ControlError("NOT_FOUND", `no such batch: ${batchId}`);
  }
  const attempts = await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.batchId, batchId));
  return { batch, attempts };
}
