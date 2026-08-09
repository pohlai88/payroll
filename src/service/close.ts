/**
 * Distributions, reconciliation helpers, closure checklist + sealed manifest.
 */

import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { artifacts } from "@/db/schema/artifacts";
import {
  distributions,
  linePayments,
  paymentAttempts,
  releaseBatches,
} from "@/db/schema/control";
import { auditEvents, payLines, payRuns } from "@/db/schema/run";
import type { ArtifactStore } from "@/domain/artifacts/store";
import { storeArtifact } from "./artifacts";
import { type IssuedSeal, issueClosureSeal } from "./closure-seal";
import { ControlError } from "./control-errors";
import { evaluateGate } from "./gates";
import {
  type TimestampManifestOptions,
  type TimestampOutcome,
  timestampClosureManifest,
} from "./manifest-timestamp";
import { reconcileLine } from "./payments";

export interface ChecklistItem {
  readonly item: string;
  readonly ok: boolean;
  readonly detail: string;
}

export async function recordDistribution(
  db: Database,
  input: {
    readonly lineId: string;
    readonly channel: "GENERATED" | "SENT" | "DELIVERED" | "HANDED" | "PRINTED";
    readonly actor: string;
    readonly artifactId?: string;
    readonly note?: string;
  }
): Promise<string> {
  const [payment] = await db
    .select()
    .from(linePayments)
    .where(eq(linePayments.lineId, input.lineId))
    .limit(1);
  if (payment === undefined) {
    throw new ControlError("NOT_FOUND", `no payment for line ${input.lineId}`);
  }
  if (payment.state !== "PAID" && payment.state !== "RECONCILED") {
    throw new ControlError(
      "INVALID_STATE",
      "distribution requires PAID or RECONCILED line"
    );
  }

  const [row] = await db
    .insert(distributions)
    .values({
      lineId: input.lineId,
      channel: input.channel,
      artifactId: input.artifactId ?? null,
      actor: input.actor,
      note: input.note ?? null,
    })
    .returning({ id: distributions.id });

  if (row === undefined) {
    throw new ControlError(
      "VALIDATION_ERROR",
      "failed to insert distribution row"
    );
  }

  await db.insert(auditEvents).values({
    actor: input.actor,
    entity: "distributions",
    entityId: row.id,
    action: "RECORD_DISTRIBUTION",
    after: { channel: input.channel, lineId: input.lineId },
  });

  return row.id;
}

export async function reconcileAttempt(
  db: Database,
  attemptId: string,
  actor: string,
  evidenceArtifactId?: string
): Promise<void> {
  const [attempt] = await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, attemptId))
    .limit(1);
  if (attempt === undefined) {
    throw new ControlError("NOT_FOUND", `no such attempt: ${attemptId}`);
  }
  if (attempt.status !== "PAID") {
    throw new ControlError(
      "INVALID_STATE",
      "only PAID attempts can be reconciled"
    );
  }
  await reconcileLine(db, attempt.lineId, actor, evidenceArtifactId);
}

export async function closureChecklist(
  db: Database,
  runId: string
): Promise<ChecklistItem[]> {
  const lines = await db
    .select({
      lineId: payLines.id,
      state: linePayments.state,
    })
    .from(payLines)
    .innerJoin(linePayments, eq(linePayments.lineId, payLines.id))
    .where(eq(payLines.runId, runId));

  const terminalOk = lines.every(
    (l) => l.state === "RECONCILED" || l.state === "WITHDRAWN"
  );
  const nonTerminal = lines.filter(
    (l) => l.state !== "RECONCILED" && l.state !== "WITHDRAWN"
  );

  const paidLineIds = lines
    .filter((l) => l.state === "RECONCILED" || l.state === "PAID")
    .map((l) => l.lineId);

  let undistributed = 0;
  if (paidLineIds.length > 0) {
    const dists = await db
      .select({ lineId: distributions.lineId })
      .from(distributions)
      .where(inArray(distributions.lineId, paidLineIds));
    const covered = new Set(dists.map((d) => d.lineId));
    // RECONCILED lines need distribution; WITHDRAWN do not
    const needDist = lines
      .filter((l) => l.state === "RECONCILED")
      .map((l) => l.lineId);
    undistributed = needDist.filter((id) => !covered.has(id)).length;
  }

  const batches = await db
    .select()
    .from(releaseBatches)
    .where(eq(releaseBatches.runId, runId));

  const terminalBatch = new Set([
    "SETTLED",
    "SETTLED_WITH_FAILURES",
    "CANCELLED",
  ]);
  const openBatches = batches.filter((b) => !terminalBatch.has(b.status));

  const attempts =
    batches.length === 0
      ? []
      : await db
          .select({ status: paymentAttempts.status })
          .from(paymentAttempts)
          .where(
            inArray(
              paymentAttempts.batchId,
              batches.map((b) => b.id)
            )
          );
  const pendingAttempts = attempts.filter((a) => a.status === "PENDING").length;

  const closeGate = await evaluateGate(db, runId, "CLOSE");

  return [
    {
      item: "terminal_dispositions",
      ok: terminalOk,
      detail: terminalOk
        ? "all lines RECONCILED or WITHDRAWN"
        : `${nonTerminal.length} line(s) still ${nonTerminal.map((l) => l.state).join(", ")}`,
    },
    {
      item: "distributions",
      ok: undistributed === 0,
      detail:
        undistributed === 0
          ? "every RECONCILED line has a distribution"
          : `${undistributed} RECONCILED line(s) lack distribution`,
    },
    {
      item: "batches_terminal",
      ok: openBatches.length === 0,
      detail:
        openBatches.length === 0
          ? "all batches terminal"
          : `open batches: ${openBatches.map((b) => `${b.id}:${b.status}`).join(", ")}`,
    },
    {
      item: "no_pending_attempts",
      ok: pendingAttempts === 0,
      detail:
        pendingAttempts === 0
          ? "no PENDING attempts"
          : `${pendingAttempts} PENDING attempt(s)`,
    },
    {
      item: "close_gate",
      ok: closeGate.ok,
      detail: closeGate.ok
        ? "CLOSE gate clear"
        : closeGate.issues.map((i) => i.message).join("; "),
    },
  ];
}

export interface CloseRunResult {
  readonly manifestArtifactId: string;
  /**
   * Issued in the same transaction as the CLOSED status: a closed run without
   * a seal is not a state this system can reach.
   */
  readonly seal: IssuedSeal;
  /**
   * Best-effort, and off unless a client asks for it: an authority that is
   * down leaves the run closed and the manifest unstamped, to be picked up by
   * `timestampClosureManifest` later.
   */
  readonly timestamp: TimestampOutcome;
}

export async function closeRun(
  db: Database,
  runId: string,
  actor: string,
  store?: ArtifactStore,
  timestampOptions: TimestampManifestOptions = {}
): Promise<CloseRunResult> {
  const checklist = await closureChecklist(db, runId);
  const failed = checklist.filter((c) => !c.ok);
  if (failed.length > 0) {
    throw new ControlError(
      "GATE_BLOCKED",
      `closure blocked: ${failed.map((f) => f.item).join(", ")}`
    );
  }

  const [run] = await db
    .select()
    .from(payRuns)
    .where(eq(payRuns.id, runId))
    .limit(1);
  if (run === undefined) {
    throw new ControlError("NOT_FOUND", `no such run: ${runId}`);
  }
  if (run.status !== "APPROVED") {
    throw new ControlError(
      "INVALID_STATE",
      `run must be APPROVED to close (currently ${run.status})`
    );
  }

  const { manifestArtifactId, seal } = await db.transaction(async (tx) => {
    const artifactRows = await tx
      .select({
        id: artifacts.id,
        filename: artifacts.relativePath,
        type: artifacts.type,
        sha256: artifacts.sha256,
        byteSize: artifacts.byteSize,
        createdAt: artifacts.createdAt,
      })
      .from(artifacts)
      .where(eq(artifacts.runId, runId));

    // One instant for the manifest, the run and the seal: verification
    // compares them, so two calls to `new Date()` would be a disagreement.
    const closedAt = new Date();

    const manifest = {
      runId,
      calcRevision: run.calcRevision,
      approvedRevision: run.approvedRevision,
      statutoryPackId: run.rulePackId,
      approval: { by: run.approvedBy, at: run.approvedAt },
      artifacts: artifactRows.map((a) => ({
        artifactId: a.id,
        filename: a.filename,
        type: a.type,
        sha256: a.sha256,
        byteSize: a.byteSize,
        createdAt: a.createdAt?.toISOString() ?? null,
      })),
      closedAt: closedAt.toISOString(),
      closedBy: actor,
      checklist,
    };

    const body = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    const stored = await storeArtifact(
      tx,
      {
        runId,
        type: "MANIFEST",
        filename: "manifest.json",
        body,
        mimeType: "application/json",
        createdBy: actor,
        source: "GENERATED",
      },
      store
    );

    await tx
      .update(payRuns)
      .set({
        status: "CLOSED",
        closedManifestArtifactId: stored.id,
        closedAt,
        closedBy: actor,
      })
      .where(eq(payRuns.id, runId));

    const issued = await issueClosureSeal(tx, {
      runId,
      companyId: run.companyId,
      manifestArtifactId: stored.id,
      manifestSha256: stored.sha256,
      calcRevision: run.calcRevision,
      approvedRevision: run.approvedRevision,
      closedAt,
      closedBy: actor,
    });

    await tx.insert(auditEvents).values({
      actor,
      runId,
      entity: "pay_runs",
      entityId: runId,
      action: "CLOSE",
      after: {
        manifestArtifactId: stored.id,
        sealHash: issued.sealHash,
        sealSequence: issued.sequence,
        previousSealHash: issued.previousSealHash,
      },
    });

    return { manifestArtifactId: stored.id, seal: issued };
  });

  const timestamp = await timestampClosureManifest(db, runId, actor, {
    store,
    ...timestampOptions,
  });

  return { manifestArtifactId, seal, timestamp };
}
