/**
 * @feature gates
 * @layer ui
 * @hub src/server/routes/pay-run.ts
 *
 * Gate-check confirmation dialog — evaluates REVIEW/APPROVAL before the
 * mutation. Confirm is enabled only when the gate is clear (`ok === true`).
 * The browser never bypasses a blocked gate.
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
import type { GateKind, GateResult } from "@/web/api/payroll-api";

interface GateCheckDialogProps {
  readonly open: boolean;
  readonly gate: GateKind | null;
  readonly result: GateResult | null;
  readonly loading: boolean;
  readonly submitting: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

function gateLabel(gate: GateKind | null): string {
  if (gate === "REVIEW") {
    return "Review";
  }
  if (gate === "APPROVAL") {
    return "Approve";
  }
  return "Proceed";
}

function descriptionFor(loading: boolean, result: GateResult | null): string {
  if (loading) {
    return "Evaluating gate…";
  }
  if (result?.ok === true) {
    return "Gate is clear. Confirm to apply the transition.";
  }
  return "Gate is blocked. Resolve the issues below before proceeding.";
}

function GateCheckDialog({
  open,
  gate,
  result,
  loading,
  submitting,
  error,
  onClose,
  onConfirm,
}: GateCheckDialogProps) {
  const canConfirm = Boolean(result?.ok) && !loading && !submitting;
  const hasBlockingFinding = (result?.issues ?? []).some(
    (issue) => issue.kind === "finding"
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
          <DialogTitle>{gateLabel(gate)} gate check</DialogTitle>
          <DialogDescription>
            {descriptionFor(loading, result)}
          </DialogDescription>
        </DialogHeader>

        {result !== null && result.issues.length > 0 ? (
          <ul className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
            {result.issues.map((issue) => (
              <li
                className="text-sm"
                key={`${issue.kind}-${issue.code}-${issue.findingId ?? issue.lineId ?? issue.message}`}
              >
                <span className="font-mono text-muted-foreground text-xs">
                  {issue.kind}/{issue.code}
                </span>
                <p className="text-foreground">{issue.message}</p>
              </li>
            ))}
          </ul>
        ) : null}

        {result?.ok === true ? (
          <p className="text-muted-foreground text-sm">
            No blocking issues. Ready to {gateLabel(gate).toLowerCase()}.
          </p>
        ) : null}

        {hasBlockingFinding && result?.ok === false ? (
          <p className="text-destructive text-xs">
            Finding issues must be fixed or warnings acknowledged, then
            re-scanned. Proceed is disabled while the gate is blocked.
          </p>
        ) : null}

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
            {submitting
              ? "Working…"
              : `Confirm ${gateLabel(gate).toLowerCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { GateCheckDialogProps };
export { GateCheckDialog };
