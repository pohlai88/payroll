/**
 * Workspace run header — company/period/status metadata plus the
 * Recompute/Review/Approve action buttons. Button visibility is driven
 * entirely by the server's `actionAvailability`; status is never
 * re-derived client-side to decide which actions are legal.
 */

import type { RunStatus } from "@/components/payroll/status-badge";
import { StatusBadge } from "@/components/payroll/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PayRunWorkspaceView } from "@/web/api/payroll-api";

function isRunStatus(status: string): status is RunStatus {
  return (
    status === "DRAFT" ||
    status === "REVIEWED" ||
    status === "APPROVED" ||
    status === "CLOSED"
  );
}

interface RunHeaderProps {
  readonly view: PayRunWorkspaceView;
  readonly onRecompute: () => void;
  readonly onReview: () => void;
  readonly onApprove: () => void;
  readonly onClose: () => void;
}

function RunHeader({
  view,
  onRecompute,
  onReview,
  onApprove,
  onClose,
}: RunHeaderProps) {
  const { run, actionAvailability: avail } = view;

  return (
    <div className="flex items-center gap-3 border-b bg-card px-6 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-foreground">
            {run.companyName}
          </span>
          <Badge className="font-mono text-xs" variant="outline">
            {run.reportingMonth}
          </Badge>
          <StatusBadge
            status={isRunStatus(run.status) ? run.status : "DRAFT"}
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {avail.canRecompute ? (
          <Button onClick={onRecompute} size="sm" variant="outline">
            Recompute
          </Button>
        ) : null}
        {avail.canReview ? (
          <Button onClick={onReview} size="sm" variant="outline">
            Review
          </Button>
        ) : null}
        {avail.canApprove ? (
          <Button onClick={onApprove} size="sm">
            Approve
          </Button>
        ) : null}
        {avail.canClose ? (
          <Button onClick={onClose} size="sm">
            Close run
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export type { RunHeaderProps };
export { RunHeader };
