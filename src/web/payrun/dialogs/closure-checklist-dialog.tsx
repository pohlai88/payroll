/**
 * Closure checklist dialog — pure renderer of the server's mechanical
 * `closureChecklist` (`src/service/close.ts`). Confirm is enabled only when
 * every item is `ok`; the dialog never computes its own close eligibility.
 *
 * Once the run closes it switches to showing the seal that was issued, because
 * the seal is the outcome of the action the user just took and burying it in a
 * panel behind the dialog would be the wrong moment to first mention it.
 */

import { useCallback } from "react";
import { HashChip } from "@/components/payroll/hash-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ChecklistItem,
  IssuedSeal,
  TimestampOutcome,
} from "@/web/api/payroll-api";

interface ClosureOutcome {
  readonly seal: IssuedSeal;
  readonly timestamp: TimestampOutcome;
}

interface ClosureChecklistDialogProps {
  readonly open: boolean;
  readonly checklist: readonly ChecklistItem[] | null;
  readonly loading: boolean;
  readonly submitting: boolean;
  readonly error: string | null;
  /** Set once the run is closed; the dialog then reports rather than asks. */
  readonly outcome: ClosureOutcome | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

function descriptionFor(
  loading: boolean,
  checklist: readonly ChecklistItem[] | null
): string {
  if (loading) {
    return "Evaluating closure checklist…";
  }
  if (
    checklist !== null &&
    checklist.length > 0 &&
    checklist.every((c) => c.ok)
  ) {
    return "All checklist items pass. Confirm to close the run.";
  }
  return "One or more checklist items are not satisfied.";
}

function SealedSummary({ outcome }: { readonly outcome: ClosureOutcome }) {
  const { seal, timestamp } = outcome;
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs">Seal</span>
        <HashChip label="seal hash" value={seal.sealHash} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs">Position</span>
        <span className="text-sm">
          #{seal.sequence} in this company's closure chain
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs">Links to</span>
        {seal.previousSealHash === null ? (
          <span className="text-muted-foreground text-sm">
            nothing — first closure
          </span>
        ) : (
          <HashChip label="previous seal hash" value={seal.previousSealHash} />
        )}
      </div>
      {timestamp.state === "STAMPED" ? (
        <p className="text-muted-foreground text-xs">
          Also countersigned externally at {timestamp.genTime}.
        </p>
      ) : null}
      {timestamp.state === "FAILED" ? (
        <p className="text-muted-foreground text-xs">
          The external authority did not answer ({timestamp.detail}). The run is
          closed and sealed regardless; a token can still be obtained later.
        </p>
      ) : null}
    </div>
  );
}

function ClosureChecklistDialog({
  open,
  checklist,
  loading,
  submitting,
  error,
  outcome,
  onClose,
  onConfirm,
}: ClosureChecklistDialogProps) {
  const canConfirm = Boolean(
    checklist !== null &&
      checklist.length > 0 &&
      checklist.every((c) => c.ok) &&
      !loading &&
      !submitting
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>
            {outcome === null ? "Close run checklist" : "Run closed and sealed"}
          </DialogTitle>
          <DialogDescription>
            {outcome === null
              ? descriptionFor(loading, checklist)
              : "The manifest is frozen and this closure is now part of the company's chain."}
          </DialogDescription>
        </DialogHeader>

        {outcome === null ? null : <SealedSummary outcome={outcome} />}

        {outcome !== null || checklist === null ? null : (
          <ul className="space-y-2 rounded-md border p-3">
            {checklist.map((item) => (
              <li className="flex items-start gap-2 text-sm" key={item.item}>
                <Badge
                  className="mt-0.5 font-mono"
                  variant={item.ok ? "success" : "bad"}
                >
                  {item.ok ? "OK" : "BLOCKED"}
                </Badge>
                <div>
                  <p className="font-medium text-foreground">{item.item}</p>
                  <p className="text-muted-foreground text-xs">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {error === null ? null : (
          <p className="text-destructive text-sm">{error}</p>
        )}

        <DialogFooter>
          {outcome === null ? (
            <>
              <Button
                disabled={submitting}
                onClick={onClose}
                size="sm"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={!canConfirm} onClick={onConfirm} size="sm">
                {submitting ? "Closing…" : "Confirm close"}
              </Button>
            </>
          ) : (
            <Button onClick={onClose} size="sm">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { ClosureChecklistDialogProps, ClosureOutcome };
export { ClosureChecklistDialog };
