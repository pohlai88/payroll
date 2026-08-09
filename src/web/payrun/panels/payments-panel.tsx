/**
 * Workspace payments panel — one row per pay line's `line_payments` state.
 * Row actions mirror `PAY_TRANSITIONS` in `src/service/payments.ts` exactly:
 * Hold/Withdraw on READY, Unhold/Withdraw on HOLD, Withdraw on FAILED_RETURNED,
 * "Record distribution" on PAID/RECONCILED. No other state gets an action —
 * RELEASED/PAID move only through the release/batch flow (ReleasePanel,
 * BatchDrawer). The checkbox column (READY/FAILED_RETURNED only) feeds
 * ReleasePanel's selection. When `readOnly`, the panel renders with no
 * checkboxes and no action buttons.
 *
 * This component is presentational: `payments`/`loading`/`error` are provided
 * by the parent (workspace.tsx) from its single shared fetch; every mutation
 * calls `onChanged()` so the parent can refresh from the single source of truth.
 */

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { MoneyCell } from "@/components/payroll/money-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDialogSubmit } from "@/hooks/use-dialog-submit";
import { cn } from "@/lib/utils";
import { formatApiError } from "@/web/api/format-error";
import type {
  DistributionChannel,
  EmployeeLineDto,
  LinePaymentRow,
  LinePaymentState,
  WithdrawalReason,
} from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";

interface PaymentsPanelProps {
  readonly runId: string;
  readonly lines: readonly EmployeeLineDto[];
  readonly readOnly: boolean;
  readonly selectedLineIds: readonly string[];
  readonly onSelectionChange: (ids: readonly string[]) => void;
  readonly payments: readonly LinePaymentRow[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onChanged: () => void;
  readonly onViewBatch: (batchId: string) => void;
}

const WITHDRAWAL_REASONS: readonly {
  readonly value: WithdrawalReason;
  readonly label: string;
}[] = [
  { value: "MOVED_TO_OFFCYCLE", label: "Moved to off-cycle" },
  { value: "DUPLICATE_LINE", label: "Duplicate line" },
  { value: "EMPLOYEE_NOT_PAYABLE", label: "Employee not payable" },
  {
    value: "PAYMENT_CANCELLED_BY_AUTHORITY",
    label: "Payment cancelled by authority",
  },
  { value: "OTHER_CONTROLLED_EXCEPTION", label: "Other controlled exception" },
];

const DISTRIBUTION_CHANNELS: readonly {
  readonly value: DistributionChannel;
  readonly label: string;
}[] = [
  { value: "GENERATED", label: "Generated" },
  { value: "SENT", label: "Sent" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "HANDED", label: "Handed" },
  { value: "PRINTED", label: "Printed" },
];

/** Every `LinePaymentState` renders with the same neutral badge — payment
 * states are process states, not success/failure (see Global Constraints). */
const STATE_BADGE_CLASS = "border-border bg-muted text-muted-foreground";

type ActionDialog =
  | { readonly type: "hold"; readonly lineId: string }
  | { readonly type: "withdraw"; readonly lineId: string }
  | { readonly type: "distribute"; readonly lineId: string };

function PaymentsPanel({
  runId,
  lines,
  readOnly,
  selectedLineIds,
  onSelectionChange,
  payments,
  loading,
  error,
  onChanged,
  onViewBatch,
}: PaymentsPanelProps) {
  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (error !== null) {
      setActionError(null);
    }
  }, [error]);

  const employeeByEmploymentId = useMemo(() => {
    const map = new Map<string, EmployeeLineDto>();
    for (const line of lines) {
      map.set(line.employeeId, line);
    }
    return map;
  }, [lines]);

  const selectedSet = useMemo(
    () => new Set(selectedLineIds),
    [selectedLineIds]
  );

  const handleToggle = useCallback(
    (lineId: string, checked: boolean) => {
      const next = new Set(selectedSet);
      if (checked) {
        next.add(lineId);
      } else {
        next.delete(lineId);
      }
      onSelectionChange([...next]);
    },
    [onSelectionChange, selectedSet]
  );

  const closeDialog = useCallback(() => {
    setDialog(null);
  }, []);

  const handleUnhold = useCallback(
    async (lineId: string) => {
      setActionError(null);
      setBusyLineId(lineId);
      try {
        await payrollApi.unholdLine(runId, lineId);
        onChanged();
      } catch (err) {
        setActionError(formatApiError(err, "Unhold failed"));
      } finally {
        setBusyLineId(null);
      }
    },
    [onChanged, runId]
  );

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="font-medium text-sm">Payments</span>
        <span className="text-muted-foreground text-xs">
          {payments.length} line{payments.length === 1 ? "" : "s"}
        </span>
      </div>

      {error === null && actionError === null ? null : (
        <div className="space-y-1 px-3 py-2">
          {error === null ? null : (
            <p className="text-destructive text-sm">{error}</p>
          )}
          {actionError === null ? null : (
            <p className="text-destructive text-sm">{actionError}</p>
          )}
        </div>
      )}

      {loading && payments.length === 0 ? (
        <p className="px-3 py-4 text-muted-foreground text-sm">
          Loading payments…
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {readOnly ? null : <TableHead className="w-8" />}
                <TableHead>Employee</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="w-56">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <PaymentRow
                  busy={busyLineId === payment.lineId}
                  employee={employeeByEmploymentId.get(payment.employmentId)}
                  key={payment.lineId}
                  onOpenDialog={setDialog}
                  onToggle={handleToggle}
                  onUnhold={handleUnhold}
                  onViewBatch={onViewBatch}
                  payment={payment}
                  readOnly={readOnly}
                  selected={selectedSet.has(payment.lineId)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <HoldDialog
        onClose={closeDialog}
        onDone={onChanged}
        runId={runId}
        target={dialog?.type === "hold" ? dialog.lineId : null}
      />
      <WithdrawDialog
        onClose={closeDialog}
        onDone={onChanged}
        runId={runId}
        target={dialog?.type === "withdraw" ? dialog.lineId : null}
      />
      <DistributeDialog
        onClose={closeDialog}
        onDone={onChanged}
        runId={runId}
        target={dialog?.type === "distribute" ? dialog.lineId : null}
      />
    </div>
  );
}

interface PaymentRowProps {
  readonly payment: LinePaymentRow;
  readonly employee: EmployeeLineDto | undefined;
  readonly readOnly: boolean;
  readonly selected: boolean;
  readonly busy: boolean;
  readonly onToggle: (lineId: string, checked: boolean) => void;
  readonly onUnhold: (lineId: string) => void;
  readonly onOpenDialog: (dialog: ActionDialog) => void;
  readonly onViewBatch: (batchId: string) => void;
}

interface RowActionsProps {
  readonly state: LinePaymentState;
  readonly releaseBatchId: string | null;
  readonly busy: boolean;
  readonly onHold: () => void;
  readonly onUnhold: () => void;
  readonly onWithdraw: () => void;
  readonly onDistribute: () => void;
  readonly onViewBatch: () => void;
}

function RowActions({
  state,
  releaseBatchId,
  busy,
  onHold,
  onUnhold,
  onWithdraw,
  onDistribute,
  onViewBatch,
}: RowActionsProps) {
  const canWithdraw =
    state === "READY" || state === "HOLD" || state === "FAILED_RETURNED";
  const canDistribute = state === "PAID" || state === "RECONCILED";
  const canViewBatch =
    (state === "RELEASED" || state === "PAID" || state === "RECONCILED") &&
    releaseBatchId !== null;

  if (!(canWithdraw || canDistribute || canViewBatch)) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {state === "READY" ? (
        <Button disabled={busy} onClick={onHold} size="sm" variant="outline">
          Hold
        </Button>
      ) : null}
      {state === "HOLD" ? (
        <Button disabled={busy} onClick={onUnhold} size="sm" variant="outline">
          {busy ? "Working…" : "Unhold"}
        </Button>
      ) : null}
      {canWithdraw ? (
        <Button
          disabled={busy}
          onClick={onWithdraw}
          size="sm"
          variant="outline"
        >
          Withdraw
        </Button>
      ) : null}
      {canDistribute ? (
        <Button
          disabled={busy}
          onClick={onDistribute}
          size="sm"
          variant="outline"
        >
          Record distribution
        </Button>
      ) : null}
      {canViewBatch ? (
        <Button onClick={onViewBatch} size="sm" variant="outline">
          View batch
        </Button>
      ) : null}
    </div>
  );
}

function PaymentRow({
  payment,
  employee,
  readOnly,
  selected,
  busy,
  onToggle,
  onUnhold,
  onOpenDialog,
  onViewBatch,
}: PaymentRowProps) {
  const { state, lineId, releaseBatchId } = payment;
  const checkable = state === "READY" || state === "FAILED_RETURNED";

  const handleToggle = useCallback(
    (checked: boolean) => onToggle(lineId, checked),
    [lineId, onToggle]
  );
  const handleHold = useCallback(
    () => onOpenDialog({ type: "hold", lineId }),
    [lineId, onOpenDialog]
  );
  const handleWithdraw = useCallback(
    () => onOpenDialog({ type: "withdraw", lineId }),
    [lineId, onOpenDialog]
  );
  const handleDistribute = useCallback(
    () => onOpenDialog({ type: "distribute", lineId }),
    [lineId, onOpenDialog]
  );
  const handleUnhold = useCallback(() => onUnhold(lineId), [lineId, onUnhold]);
  const handleViewBatch = useCallback(() => {
    if (releaseBatchId !== null) {
      onViewBatch(releaseBatchId);
    }
  }, [releaseBatchId, onViewBatch]);

  return (
    <TableRow>
      {readOnly ? null : (
        <TableCell>
          <Checkbox
            checked={selected}
            disabled={!checkable}
            onCheckedChange={handleToggle}
          />
        </TableCell>
      )}
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-mono text-muted-foreground text-xs">
            {employee?.employeeCode ?? "—"}
          </span>
          <span className="text-foreground text-sm">
            {employee?.employeeName ?? "Unknown employee"}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Badge className={cn("w-fit text-xs", STATE_BADGE_CLASS)}>
            {state}
          </Badge>
          {state === "HOLD" && payment.holdReason !== null ? (
            <span className="text-muted-foreground text-xs">
              {payment.holdReason}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <MoneyCell sen={payment.netSen} />
      </TableCell>
      <TableCell>
        {readOnly ? null : (
          <RowActions
            busy={busy}
            onDistribute={handleDistribute}
            onHold={handleHold}
            onUnhold={handleUnhold}
            onViewBatch={handleViewBatch}
            onWithdraw={handleWithdraw}
            releaseBatchId={releaseBatchId}
            state={state}
          />
        )}
        {readOnly &&
        releaseBatchId !== null &&
        (state === "RELEASED" || state === "PAID" || state === "RECONCILED") ? (
          <Button onClick={handleViewBatch} size="sm" variant="outline">
            View batch
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

interface DialogBaseProps {
  readonly runId: string;
  readonly target: string | null;
  readonly onClose: () => void;
  readonly onDone: () => void;
}

function HoldDialog({ runId, target, onClose, onDone }: DialogBaseProps) {
  const [reason, setReason] = useState("");
  const { submitting, error, reset, run } = useDialogSubmit();

  const handleReasonChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setReason(e.target.value),
    []
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!(next || submitting)) {
        setReason("");
        reset();
        onClose();
      }
    },
    [onClose, reset, submitting]
  );

  const handleConfirm = useCallback(() => {
    if (target === null || reason.trim() === "") {
      return;
    }
    return run(async () => {
      await payrollApi.holdLine(runId, target, reason.trim());
      setReason("");
      onClose();
      await onDone();
    }, "Hold failed");
  }, [onClose, onDone, reason, run, runId, target]);

  return (
    <Dialog onOpenChange={handleOpenChange} open={target !== null}>
      <DialogContent className="sm:max-w-sm" showCloseButton>
        <DialogHeader>
          <DialogTitle>Hold payment</DialogTitle>
          <DialogDescription>
            Reason is recorded on the audit trail.
          </DialogDescription>
        </DialogHeader>
        <Input
          disabled={submitting}
          onChange={handleReasonChange}
          placeholder="Hold reason (required)"
          value={reason}
        />
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
          <Button
            disabled={submitting || reason.trim() === ""}
            onClick={handleConfirm}
            size="sm"
          >
            {submitting ? "Working…" : "Hold"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawDialog({ runId, target, onClose, onDone }: DialogBaseProps) {
  const [reasonCode, setReasonCode] = useState<WithdrawalReason | null>(null);
  const [note, setNote] = useState("");
  const { submitting, error, reset, run } = useDialogSubmit();

  const handleNoteChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setNote(e.target.value),
    []
  );
  const handleReasonChange = useCallback((value: string | null) => {
    setReasonCode(value as WithdrawalReason | null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!(next || submitting)) {
        setReasonCode(null);
        setNote("");
        reset();
        onClose();
      }
    },
    [onClose, reset, submitting]
  );

  const canConfirm = reasonCode !== null && note.trim() !== "";

  const handleConfirm = useCallback(() => {
    if (target === null || !canConfirm || reasonCode === null) {
      return;
    }
    return run(async () => {
      await payrollApi.withdrawLine(runId, target, {
        reasonCode,
        note: note.trim(),
      });
      setReasonCode(null);
      setNote("");
      onClose();
      await onDone();
    }, "Withdraw failed");
  }, [canConfirm, note, onClose, onDone, reasonCode, run, runId, target]);

  return (
    <Dialog onOpenChange={handleOpenChange} open={target !== null}>
      <DialogContent className="sm:max-w-sm" showCloseButton>
        <DialogHeader>
          <DialogTitle>Withdraw line</DialogTitle>
          <DialogDescription>
            Removes this line from payment. This does not affect run totals.
          </DialogDescription>
        </DialogHeader>
        <Select
          onValueChange={handleReasonChange}
          value={reasonCode ?? undefined}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Reason (required)" />
          </SelectTrigger>
          <SelectContent>
            {WITHDRAWAL_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          disabled={submitting}
          onChange={handleNoteChange}
          placeholder="Note (required)"
          value={note}
        />
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
          <Button
            disabled={submitting || !canConfirm}
            onClick={handleConfirm}
            size="sm"
          >
            {submitting ? "Working…" : "Withdraw"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DistributeDialog({ runId, target, onClose, onDone }: DialogBaseProps) {
  const [channel, setChannel] = useState<DistributionChannel | null>(null);
  const [note, setNote] = useState("");
  const { submitting, error, reset, run } = useDialogSubmit();

  const handleNoteChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setNote(e.target.value),
    []
  );
  const handleChannelChange = useCallback((value: string | null) => {
    setChannel(value as DistributionChannel | null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!(next || submitting)) {
        setChannel(null);
        setNote("");
        reset();
        onClose();
      }
    },
    [onClose, reset, submitting]
  );

  const handleConfirm = useCallback(() => {
    if (target === null || channel === null) {
      return;
    }
    return run(async () => {
      await payrollApi.recordDistribution(runId, target, {
        channel,
        note: note.trim() === "" ? undefined : note.trim(),
      });
      setChannel(null);
      setNote("");
      onClose();
      await onDone();
    }, "Record failed");
  }, [channel, note, onClose, onDone, run, runId, target]);

  return (
    <Dialog onOpenChange={handleOpenChange} open={target !== null}>
      <DialogContent className="sm:max-w-sm" showCloseButton>
        <DialogHeader>
          <DialogTitle>Record distribution</DialogTitle>
          <DialogDescription>
            How was the payslip/advice delivered for this line?
          </DialogDescription>
        </DialogHeader>
        <Select
          onValueChange={handleChannelChange}
          value={channel ?? undefined}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Channel (required)" />
          </SelectTrigger>
          <SelectContent>
            {DISTRIBUTION_CHANNELS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          disabled={submitting}
          onChange={handleNoteChange}
          placeholder="Note (optional)"
          value={note}
        />
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
          <Button
            disabled={submitting || channel === null}
            onClick={handleConfirm}
            size="sm"
          >
            {submitting ? "Working…" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { PaymentsPanelProps };
export { PaymentsPanel };
