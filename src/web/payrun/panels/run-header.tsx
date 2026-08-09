/**
 * @feature workspace
 * @layer ui
 * @hub src/server/routes/pay-run-workspace.ts
 *
 * Workspace run header — company/period/status metadata plus the
 * Recompute/Review/Approve action buttons. Button visibility is driven
 * entirely by the server's `actionAvailability`; status is never
 * re-derived client-side to decide which actions are legal.
 *
 * Visual DNA: studio dashboard-header (title band + action cluster).
 */

import { ArrowLeftIcon, GitCompareArrowsIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "wouter";
import { isRunStatus, StatusBadge } from "@/components/payroll/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { PayRunWorkspaceView } from "@/web/api/payroll-api";
import { RunDiffPanel } from "./run-diff-panel";

interface RunHeaderProps {
  readonly view: PayRunWorkspaceView;
  readonly onRecompute: () => void;
  readonly onReview: () => void;
  readonly onApprove: () => void;
  readonly onDemote: () => void;
  readonly onClose: () => void;
}

function RunHeader({
  view,
  onRecompute,
  onReview,
  onApprove,
  onDemote,
  onClose,
}: RunHeaderProps) {
  const { run, actionAvailability: avail } = view;
  const hasPrior = view.lines.some((l) => l.previousRoots !== null);
  const [showCompare, setShowCompare] = useState(false);
  const toggleCompare = useCallback(() => setShowCompare((v) => !v), []);

  return (
    <>
      <div className="border-b bg-card">
        <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                render={<Link href="/pay-runs" />}
                size="sm"
                variant="ghost"
              >
                <ArrowLeftIcon className="size-4" />
                Pay runs
              </Button>
              <Separator className="hidden h-4 sm:block" orientation="vertical" />
              <h1 className="truncate font-semibold text-foreground text-lg tracking-tight">
                {run.companyName}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="font-mono text-xs" variant="outline">
                {run.reportingMonth}
              </Badge>
              <StatusBadge
                status={isRunStatus(run.status) ? run.status : "DRAFT"}
              />
              {run.label ? (
                <span className="truncate text-muted-foreground text-sm">
                  {run.label}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {hasPrior ? (
              <Button onClick={toggleCompare} size="sm" variant="ghost">
                <GitCompareArrowsIcon className="size-4" />
                {showCompare ? "Hide compare" : "Compare"}
              </Button>
            ) : null}
            <Button
              render={
                <Link
                  href={`/reports?type=payment-register&runId=${run.id}`}
                />
              }
              size="sm"
              variant="outline"
            >
              Reports
            </Button>
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
            {avail.canDemote ? (
              <Button onClick={onDemote} size="sm" variant="outline">
                Demote to draft
              </Button>
            ) : null}
            {avail.canClose ? (
              <Button onClick={onClose} size="sm">
                Close run
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      {hasPrior && showCompare ? <RunDiffPanel lines={view.lines} /> : null}
    </>
  );
}

export type { RunHeaderProps };
export { RunHeader };
