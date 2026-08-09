/**
 * @feature control
 * @layer ui
 * @hub src/server/routes/pay-run-control.ts
 *
 * Release panel — appears once >=1 payment line is checked. Preview shows the
 * server's eligible/excluded/byBank breakdown verbatim (the SPA never
 * re-derives why a line was excluded); Commit creates the release batch.
 */

import { useCallback, useState } from "react";
import { MoneyCell } from "@/components/payroll/money-cell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatApiError } from "@/web/api/format-error";
import type {
  ReleaseMethod,
  ReleasePreviewResponse,
} from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";

interface ReleasePanelProps {
  readonly runId: string;
  readonly selectedLineIds: readonly string[];
  readonly onCleared: () => void;
  readonly onReleased: (batchId: string) => void;
}

function ReleasePanel({
  runId,
  selectedLineIds,
  onCleared,
  onReleased,
}: ReleasePanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ReleasePreviewResponse | null>(null);
  const [method, setMethod] = useState<ReleaseMethod>("BANK");
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!(next || committing)) {
        setOpen(false);
        setPreview(null);
        setError(null);
      }
    },
    [committing]
  );

  const handleCancelDialog = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  const handlePreview = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await payrollApi.previewRelease(runId, selectedLineIds);
      setPreview(res);
    } catch (err) {
      setError(formatApiError(err, "Preview failed"));
    } finally {
      setLoading(false);
    }
  }, [runId, selectedLineIds]);

  const handleMethodChange = useCallback((value: string | null) => {
    if (value === "BANK" || value === "CASH") {
      setMethod(value);
    }
  }, []);

  const handleCommit = useCallback(async () => {
    setCommitting(true);
    setError(null);
    try {
      const res = await payrollApi.commitRelease(
        runId,
        selectedLineIds,
        method
      );
      setOpen(false);
      setPreview(null);
      onCleared();
      onReleased(res.batchId);
    } catch (err) {
      setError(formatApiError(err, "Release failed"));
    } finally {
      setCommitting(false);
    }
  }, [method, onCleared, onReleased, runId, selectedLineIds]);

  if (selectedLineIds.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
      <span className="text-sm">
        {selectedLineIds.length} line{selectedLineIds.length === 1 ? "" : "s"}{" "}
        selected for release
      </span>
      <div className="flex items-center gap-2">
        <Button onClick={onCleared} size="sm" variant="ghost">
          Clear
        </Button>
        <Button onClick={handlePreview} size="sm">
          Preview release
        </Button>
      </div>

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>Release preview</DialogTitle>
            <DialogDescription>
              Excluded reasons and totals come directly from the server.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="text-muted-foreground text-sm">Evaluating…</p>
          ) : null}

          {!loading && preview !== null ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {preview.eligible.length} eligible · {preview.excluded.length}{" "}
                  excluded
                </span>
                <MoneyCell sen={preview.totalSen} />
              </div>

              {preview.byBank.length > 0 ? (
                <ul className="rounded-md border text-sm">
                  {preview.byBank.map((b) => (
                    <li
                      className="flex items-center justify-between border-b px-3 py-1.5 last:border-b-0"
                      key={b.bank}
                    >
                      <span>
                        {b.bank} ({b.count})
                      </span>
                      <MoneyCell sen={b.totalSen} />
                    </li>
                  ))}
                </ul>
              ) : null}

              {preview.excluded.length > 0 ? (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs">
                  {preview.excluded.map((e) => (
                    <li key={e.lineId}>
                      <span className="font-mono text-muted-foreground">
                        {e.lineId.slice(0, 8)}
                      </span>{" "}
                      — {e.reason}
                    </li>
                  ))}
                </ul>
              ) : null}

              <Select onValueChange={handleMethodChange} value={method}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK">Bank transfer</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {error === null ? null : (
            <p className="text-destructive text-sm">{error}</p>
          )}

          <DialogFooter>
            <Button
              disabled={committing}
              onClick={handleCancelDialog}
              size="sm"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                committing ||
                loading ||
                preview === null ||
                preview.eligible.length === 0
              }
              onClick={handleCommit}
              size="sm"
            >
              {committing ? "Releasing…" : "Commit release"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type { ReleasePanelProps };
export { ReleasePanel };
