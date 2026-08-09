/**
 * Closure checklist dialog — pure renderer of the server's mechanical
 * `closureChecklist` (`src/service/close.ts`). Confirm is enabled only when
 * every item is `ok`; the dialog never computes its own close eligibility.
 */

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ChecklistItem } from "@/web/api/payroll-api";

interface ClosureChecklistDialogProps {
  readonly open: boolean;
  readonly checklist: readonly ChecklistItem[] | null;
  readonly loading: boolean;
  readonly submitting: boolean;
  readonly error: string | null;
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

function ClosureChecklistDialog({
  open,
  checklist,
  loading,
  submitting,
  error,
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
          <DialogTitle>Close run checklist</DialogTitle>
          <DialogDescription>
            {descriptionFor(loading, checklist)}
          </DialogDescription>
        </DialogHeader>

        {checklist === null ? null : (
          <ul className="space-y-2 rounded-md border p-3">
            {checklist.map((item) => (
              <li className="flex items-start gap-2 text-sm" key={item.item}>
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-xs",
                    item.ok
                      ? "bg-[var(--status-ok-fill)] text-[var(--status-ok-ink)]"
                      : "bg-[var(--status-bad-fill)] text-[var(--status-bad-ink)]"
                  )}
                >
                  {item.ok ? "OK" : "BLOCKED"}
                </span>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { ClosureChecklistDialogProps };
export { ClosureChecklistDialog };
