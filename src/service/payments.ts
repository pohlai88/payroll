/**
 * @feature control
 * @layer service
 * @hub src/server/routes/pay-run-control.ts
 *
 * Sole writer of `line_payments` transitions.
 *
 * release.ts / close.ts must call these helpers — never update line_payments
 * directly (Plan1 handoff §4.3).
 */

import { eq } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db/client";
import { linePayments, withdrawals } from "@/db/schema/control";
import { auditEvents, payLines } from "@/db/schema/run";
import { ControlError } from "./control-errors";

export type LinePaymentState =
  | "READY"
  | "HOLD"
  | "RELEASED"
  | "PAID"
  | "FAILED_RETURNED"
  | "RECONCILED"
  | "WITHDRAWN";

const PAY_TRANSITIONS: Readonly<
  Record<LinePaymentState, ReadonlySet<LinePaymentState>>
> = {
  READY: new Set(["HOLD", "RELEASED", "WITHDRAWN"]),
  HOLD: new Set(["READY", "WITHDRAWN"]),
  RELEASED: new Set(["PAID", "FAILED_RETURNED", "READY"]),
  PAID: new Set(["RECONCILED"]),
  FAILED_RETURNED: new Set(["RELEASED", "WITHDRAWN"]),
  RECONCILED: new Set(),
  WITHDRAWN: new Set(),
};

export type WithdrawalReason =
  | "MOVED_TO_OFFCYCLE"
  | "DUPLICATE_LINE"
  | "EMPLOYEE_NOT_PAYABLE"
  | "PAYMENT_CANCELLED_BY_AUTHORITY"
  | "OTHER_CONTROLLED_EXCEPTION";

async function loadPayment(db: DbOrTx, lineId: string) {
  const [row] = await db
    .select()
    .from(linePayments)
    .where(eq(linePayments.lineId, lineId))
    .limit(1);
  if (row === undefined) {
    throw new ControlError("NOT_FOUND", `no line_payment for line ${lineId}`);
  }
  return row;
}

function assertTransition(from: LinePaymentState, to: LinePaymentState): void {
  if (!PAY_TRANSITIONS[from].has(to)) {
    throw new ControlError(
      "INVALID_STATE",
      `line payment cannot move from ${from} to ${to}`
    );
  }
}

/** Insert READY rows for every line in the run (called at APPROVED). Idempotent. */
export async function createReadyPaymentsForRun(
  db: DbOrTx,
  runId: string
): Promise<number> {
  const lines = await db
    .select({ id: payLines.id })
    .from(payLines)
    .where(eq(payLines.runId, runId));

  if (lines.length === 0) {
    return 0;
  }

  const inserted = await db
    .insert(linePayments)
    .values(
      lines.map((l) => ({
        lineId: l.id,
        state: "READY" as const,
      }))
    )
    .onConflictDoNothing({ target: linePayments.lineId })
    .returning({ id: linePayments.id });
  return inserted.length;
}

/**
 * Current state of one line's payment.
 *
 * Named in the approved Plan-1 control-foundation contract as part of this
 * module's public surface, alongside `holdLine` / `unholdLine` / `withdrawLine`
 * (`docs/superpowers/plans/2026-08-08-plan1-control-foundation.md` §4.3).
 * Callers needing a single line — closure assertions, control checks — go
 * through this rather than reading `line_payments.state` directly; bulk readers
 * still select the column in their own query.
 *
 * Exported deliberately and currently without a runtime caller. The `@public`
 * tag is the machine-verifiable record of that intent (see `knip.json`), so an
 * absent consumer is not mistaken for dead code.
 *
 * @public
 */
export async function getPaymentState(
  db: DbOrTx,
  lineId: string
): Promise<LinePaymentState> {
  const row = await loadPayment(db, lineId);
  return row.state;
}

export async function holdLine(
  db: Database,
  lineId: string,
  reason: string,
  actor: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await loadPayment(tx, lineId);
    assertTransition(row.state, "HOLD");
    await tx
      .update(linePayments)
      .set({
        state: "HOLD",
        holdReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(linePayments.lineId, lineId));
    await tx.insert(auditEvents).values({
      actor,
      entity: "line_payments",
      entityId: lineId,
      action: "HOLD",
      after: { reason },
    });
  });
}

export async function unholdLine(
  db: Database,
  lineId: string,
  actor: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await loadPayment(tx, lineId);
    assertTransition(row.state, "READY");
    await tx
      .update(linePayments)
      .set({
        state: "READY",
        holdReason: null,
        updatedAt: new Date(),
      })
      .where(eq(linePayments.lineId, lineId));
    await tx.insert(auditEvents).values({
      actor,
      entity: "line_payments",
      entityId: lineId,
      action: "UNHOLD",
    });
  });
}

export async function releaseLine(
  db: DbOrTx,
  lineId: string,
  batchId: string,
  actor: string
): Promise<void> {
  const row = await loadPayment(db, lineId);
  assertTransition(row.state, "RELEASED");
  await db
    .update(linePayments)
    .set({
      state: "RELEASED",
      releaseBatchId: batchId,
      releasedAt: new Date(),
      failedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(linePayments.lineId, lineId));
  await db.insert(auditEvents).values({
    actor,
    entity: "line_payments",
    entityId: lineId,
    action: "RELEASE",
    after: { batchId },
  });
}

/** Return RELEASED → READY when a batch is cancelled before settlement. */
export async function returnToReady(
  db: DbOrTx,
  lineId: string,
  actor: string
): Promise<void> {
  const row = await loadPayment(db, lineId);
  assertTransition(row.state, "READY");
  await db
    .update(linePayments)
    .set({
      state: "READY",
      releaseBatchId: null,
      releasedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(linePayments.lineId, lineId));
  await db.insert(auditEvents).values({
    actor,
    entity: "line_payments",
    entityId: lineId,
    action: "RETURN_TO_READY",
  });
}

export async function settleLine(
  db: DbOrTx,
  lineId: string,
  outcome: "PAID" | "FAILED",
  opts: {
    readonly actor: string;
    readonly paymentRef?: string;
    readonly failedReason?: string;
    readonly settledAt?: Date;
  }
): Promise<void> {
  const row = await loadPayment(db, lineId);
  if (outcome === "PAID") {
    assertTransition(row.state, "PAID");
    await db
      .update(linePayments)
      .set({
        state: "PAID",
        paidAt: opts.settledAt ?? new Date(),
        paymentRef: opts.paymentRef ?? null,
        updatedAt: new Date(),
      })
      .where(eq(linePayments.lineId, lineId));
  } else {
    assertTransition(row.state, "FAILED_RETURNED");
    await db
      .update(linePayments)
      .set({
        state: "FAILED_RETURNED",
        failedReason: opts.failedReason ?? "payment failed",
        releaseBatchId: null,
        updatedAt: new Date(),
      })
      .where(eq(linePayments.lineId, lineId));
  }
  await db.insert(auditEvents).values({
    actor: opts.actor,
    entity: "line_payments",
    entityId: lineId,
    action: outcome === "PAID" ? "SETTLE_PAID" : "SETTLE_FAILED",
  });
}

export async function reconcileLine(
  db: DbOrTx,
  lineId: string,
  actor: string,
  evidenceArtifactId?: string | null
): Promise<void> {
  const row = await loadPayment(db, lineId);
  assertTransition(row.state, "RECONCILED");
  await db
    .update(linePayments)
    .set({
      state: "RECONCILED",
      reconciledAt: new Date(),
      reconEvidenceArtifactId: evidenceArtifactId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(linePayments.lineId, lineId));
  await db.insert(auditEvents).values({
    actor,
    entity: "line_payments",
    entityId: lineId,
    action: "RECONCILE",
  });
}

export async function withdrawLine(
  db: Database,
  input: {
    readonly lineId: string;
    readonly reasonCode: WithdrawalReason;
    readonly note: string;
    readonly actor: string;
    readonly postApprovalApprover?: string;
    readonly replacementRunId?: string;
  }
): Promise<void> {
  if (
    input.reasonCode === "OTHER_CONTROLLED_EXCEPTION" &&
    input.note.trim().length < 30
  ) {
    throw new ControlError(
      "VALIDATION_ERROR",
      "OTHER_CONTROLLED_EXCEPTION requires a note of at least 30 characters"
    );
  }

  await db.transaction(async (tx) => {
    const row = await loadPayment(tx, input.lineId);
    if (row.state === "PAID" || row.state === "RECONCILED") {
      throw new ControlError(
        "INVALID_STATE",
        "PAID line can never become WITHDRAWN"
      );
    }
    if (row.state === "RELEASED") {
      throw new ControlError(
        "INVALID_STATE",
        "RELEASED line can only be withdrawn by cancelling the release batch"
      );
    }
    assertTransition(row.state, "WITHDRAWN");

    await tx
      .update(linePayments)
      .set({ state: "WITHDRAWN", updatedAt: new Date() })
      .where(eq(linePayments.lineId, input.lineId));

    await tx.insert(withdrawals).values({
      lineId: input.lineId,
      reasonCode: input.reasonCode,
      note: input.note,
      actor: input.actor,
      postApprovalApprover: input.postApprovalApprover ?? null,
      replacementRunId: input.replacementRunId ?? null,
    });

    await tx.insert(auditEvents).values({
      actor: input.actor,
      entity: "line_payments",
      entityId: input.lineId,
      action: "WITHDRAW",
      after: { reasonCode: input.reasonCode },
    });
  });
}
