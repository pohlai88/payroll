/**
 * Batch drawer — one release batch's attempts. Settle records the bank
 * outcome per attempt; Reconcile (PAID attempts only) closes the loop with
 * optional evidence; Cancel (OPEN batches only) returns all lines to READY.
 * Mirrors `PAY_TRANSITIONS`/batch status logic in `src/service/release.ts` —
 * this component never computes a batch or attempt status itself, it only
 * refetches `getBatch` after every mutation.
 */

import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { MoneyCell } from "@/components/payroll/money-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  ArtifactRow,
  GetBatchResponse,
  PaymentAttempt,
} from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";

interface BatchDrawerProps {
  readonly runId: string;
  readonly batchId: string | null;
  readonly open: boolean;
  readonly artifacts?: readonly ArtifactRow[];
  readonly onClose: () => void;
  readonly onChanged: () => void;
}

function BatchDrawer({
  runId,
  batchId,
  open,
  artifacts = [],
  onClose,
  onChanged,
}: BatchDrawerProps) {
  const [data, setData] = useState<GetBatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (batchId === null) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await payrollApi.getBatch(runId, batchId);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load batch");
    } finally {
      setLoading(false);
    }
  }, [batchId, runId]);

  useEffect(() => {
    if (open && batchId !== null) {
      load();
    }
  }, [open, batchId, load]);

  const handleChanged = useCallback(async () => {
    await load();
    onChanged();
  }, [load, onChanged]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl" side="right">
        <SheetHeader className="pb-3">
          <SheetTitle>Release batch {batchId ?? ""}</SheetTitle>
        </SheetHeader>

        {error === null ? null : (
          <p className="px-4 text-destructive text-sm">{error}</p>
        )}

        {loading && data === null ? (
          <p className="px-4 text-muted-foreground text-sm">Loading batch…</p>
        ) : null}

        {data === null ? null : (
          <div className="flex flex-col gap-4 px-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{data.batch.method}</Badge>
              <Badge variant="outline">{data.batch.status}</Badge>
              <span className="text-muted-foreground">
                {data.batch.lineCount} line
                {data.batch.lineCount === 1 ? "" : "s"}
              </span>
              <MoneyCell className="ml-auto" sen={data.batch.totalSen} />
            </div>

            <ul className="divide-y rounded-md border">
              {data.attempts.map((attempt) => (
                <AttemptRow
                  artifacts={artifacts}
                  attempt={attempt}
                  key={attempt.id}
                  onChanged={handleChanged}
                  runId={runId}
                />
              ))}
            </ul>

            {data.batch.status === "OPEN" ? (
              <CancelBatchAction
                batchId={data.batch.id}
                onChanged={handleChanged}
                runId={runId}
              />
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface AttemptRowProps {
  readonly runId: string;
  readonly attempt: PaymentAttempt;
  readonly artifacts: readonly ArtifactRow[];
  readonly onChanged: () => void;
}

function filenameOf(artifact: ArtifactRow): string {
  return artifact.relativePath.split("/").pop() ?? artifact.relativePath;
}

function AttemptRow({ runId, attempt, artifacts, onChanged }: AttemptRowProps) {
  const [outcome, setOutcome] = useState<"PAID" | "FAILED">("PAID");
  const [ref, setRef] = useState("");
  const [evidenceArtifactId, setEvidenceArtifactId] = useState<string | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOutcomeChange = useCallback((value: string | null) => {
    if (value === "PAID" || value === "FAILED") {
      setOutcome(value);
    }
  }, []);
  const handleRefChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setRef(e.target.value),
    []
  );
  const handleEvidenceChange = useCallback((value: string | null) => {
    setEvidenceArtifactId(value);
  }, []);

  const handleSettle = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await payrollApi.settleAttempt(runId, attempt.id, {
        outcome,
        paymentRef:
          outcome === "PAID" && ref.trim() !== "" ? ref.trim() : undefined,
        failedReason:
          outcome === "FAILED" && ref.trim() !== "" ? ref.trim() : undefined,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settle failed");
    } finally {
      setSubmitting(false);
    }
  }, [attempt.id, onChanged, outcome, ref, runId]);

  const handleReconcile = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await payrollApi.reconcileAttempt(
        runId,
        attempt.id,
        evidenceArtifactId ?? undefined
      );
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconcile failed");
    } finally {
      setSubmitting(false);
    }
  }, [attempt.id, evidenceArtifactId, onChanged, runId]);

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-mono text-muted-foreground text-xs">
          {attempt.bankSnapshot.name}
        </span>
        <Badge variant="outline">{attempt.status}</Badge>
        <MoneyCell sen={attempt.amountSen} />
      </div>

      {attempt.status === "PENDING" ? (
        <div className="flex flex-wrap items-end gap-2">
          <Select onValueChange={handleOutcomeChange} value={outcome}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="max-w-40"
            disabled={submitting}
            onChange={handleRefChange}
            placeholder={outcome === "PAID" ? "Payment ref" : "Failure reason"}
            value={ref}
          />
          <Button disabled={submitting} onClick={handleSettle} size="sm">
            {submitting ? "Working…" : "Settle"}
          </Button>
        </div>
      ) : null}

      {attempt.status === "PAID" ? (
        <div className="flex flex-wrap items-end gap-2">
          <Select
            onValueChange={handleEvidenceChange}
            value={evidenceArtifactId ?? undefined}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Evidence (optional)" />
            </SelectTrigger>
            <SelectContent>
              {artifacts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {filenameOf(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={submitting} onClick={handleReconcile} size="sm">
            {submitting ? "Working…" : "Reconcile"}
          </Button>
        </div>
      ) : null}

      {error === null ? null : (
        <p className="text-destructive text-xs">{error}</p>
      )}
    </li>
  );
}

interface CancelBatchActionProps {
  readonly runId: string;
  readonly batchId: string;
  readonly onChanged: () => void;
}

function CancelBatchAction({
  runId,
  batchId,
  onChanged,
}: CancelBatchActionProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReasonChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setReason(e.target.value),
    []
  );

  const handleCancel = useCallback(async () => {
    if (reason.trim() === "") {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await payrollApi.cancelRelease(runId, batchId, reason.trim());
      setReason("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setSubmitting(false);
    }
  }, [batchId, onChanged, reason, runId]);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/30 p-3">
      <span className="text-sm">Cancel this batch</span>
      <div className="flex items-end gap-2">
        <Input
          disabled={submitting}
          onChange={handleReasonChange}
          placeholder="Reason (required)"
          value={reason}
        />
        <Button
          disabled={submitting || reason.trim() === ""}
          onClick={handleCancel}
          size="sm"
          variant="destructive"
        >
          {submitting ? "Working…" : "Cancel batch"}
        </Button>
      </div>
      {error === null ? null : (
        <p className="text-destructive text-xs">{error}</p>
      )}
    </div>
  );
}

export type { BatchDrawerProps };
export { BatchDrawer };
