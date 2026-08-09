/**
 * @feature control
 * @layer ui
 * @hub src/server/routes/pay-run-control.ts
 *
 * Per-run control card — status, finding counts, gate pill, lifecycle
 * progress, and a context-appropriate action that navigates into the
 * workspace. Studio DNA: statistics-with-status + widget-component-20.
 */

import {
  Building2Icon,
  CheckCircle2Icon,
  ChevronRightIcon,
  LockIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";
import { useCallback } from "react";
import { HashChip } from "@/components/payroll/hash-chip";
import { isRunStatus, StatusBadge } from "@/components/payroll/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GateResult, PayRunSummary, RunSeal } from "@/web/api/payroll-api";

type GatePill = "CLEAR" | "BLOCKED" | "UNKNOWN" | "N/A";

interface RunControlCardProps {
  readonly run: PayRunSummary;
  readonly blockingCount: number | null;
  readonly warningCount: number | null;
  readonly gatePill: GatePill;
  readonly gateResult: GateResult | null;
  readonly onOpenWorkspace: (runId: string) => void;
  readonly onScan: (runId: string) => void;
  readonly scanning: boolean;
  readonly seal: RunSeal | null;
}

const LIFECYCLE_STEPS = ["DRAFT", "REVIEWED", "APPROVED", "CLOSED"] as const;

function lifecycleIndex(status: string): number {
  const idx = LIFECYCLE_STEPS.indexOf(
    status as (typeof LIFECYCLE_STEPS)[number]
  );
  return idx === -1 ? 0 : idx;
}

function LifecycleProgress({ status }: { readonly status: string }) {
  const currentIdx = lifecycleIndex(status);

  return (
    <div className="flex items-center gap-1">
      {LIFECYCLE_STEPS.map((step, idx) => {
        const isComplete = idx <= currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <div key={step} className="flex items-center gap-1">
            <div
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-xs transition-colors",
                isComplete
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {isComplete && !isCurrent ? (
                <CheckCircle2Icon className="size-3" />
              ) : (
                <span className="font-semibold text-[10px]">{idx + 1}</span>
              )}
            </div>
            {idx < LIFECYCLE_STEPS.length - 1 ? (
              <div
                className={cn(
                  "h-0.5 w-3 rounded-full transition-colors",
                  idx < currentIdx ? "bg-primary" : "bg-muted"
                )}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function gatePillVariant(pill: GatePill): "success" | "bad" | "outline" {
  if (pill === "CLEAR") {
    return "success";
  }
  if (pill === "BLOCKED") {
    return "bad";
  }
  return "outline";
}

function SealBadges({ seal }: { readonly seal: RunSeal }) {
  const intact = seal.ok && seal.chainOk;
  return (
    <Badge className="text-xs" variant={intact ? "success" : "bad"}>
      {intact
        ? `✓ Sealed #${seal.sequence}`
        : `✕ ${seal.ok ? "Chain broken" : "Seal broken"}`}
    </Badge>
  );
}

function actionLabel(status: string): string {
  if (status === "DRAFT") {
    return "Open to review";
  }
  if (status === "REVIEWED") {
    return "Open to approve";
  }
  return "Open workspace";
}

function FindingsBadges({
  blockingCount,
  warningCount,
  gatePill,
}: {
  readonly blockingCount: number | null;
  readonly warningCount: number | null;
  readonly gatePill: GatePill;
}) {
  if (blockingCount !== null && blockingCount > 0) {
    return (
      <>
        <Badge className="h-auto rounded-sm px-1.5 text-xs" variant="bad">
          {blockingCount} blocking
        </Badge>
        {warningCount !== null && warningCount > 0 ? (
          <Badge
            className="h-auto rounded-sm px-1.5 text-xs"
            variant="warning"
          >
            {warningCount} warning{warningCount === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </>
    );
  }
  if (warningCount !== null && warningCount > 0) {
    return (
      <Badge className="h-auto rounded-sm px-1.5 text-xs" variant="warning">
        {warningCount} warning{warningCount === 1 ? "" : "s"}
      </Badge>
    );
  }
  if (gatePill !== "N/A") {
    return (
      <Badge className="h-auto rounded-sm px-1.5 text-xs" variant="secondary">
        No findings
      </Badge>
    );
  }
  return null;
}

function RunControlCard({
  run,
  blockingCount,
  warningCount,
  gatePill,
  gateResult,
  onOpenWorkspace,
  onScan,
  scanning,
  seal,
}: RunControlCardProps) {
  const handleOpen = useCallback(() => {
    onOpenWorkspace(run.id);
  }, [onOpenWorkspace, run.id]);

  const handleScan = useCallback(() => {
    onScan(run.id);
  }, [onScan, run.id]);

  const mutable = run.status === "DRAFT" || run.status === "REVIEWED";
  const period = `${String(run.month).padStart(2, "0")}/${run.year}`;

  return (
    <Card className="group/control-card overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2Icon className="size-4.5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold text-base">{run.companyName}</h3>
              <Badge
                className="h-auto shrink-0 rounded-sm font-mono text-xs"
                variant="outline"
              >
                {period}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge
                status={isRunStatus(run.status) ? run.status : "DRAFT"}
              />
              {seal === null ? (
                <Badge
                  className="h-auto rounded-sm text-xs"
                  variant={gatePillVariant(gatePill)}
                >
                  Gate {gatePill}
                </Badge>
              ) : (
                <SealBadges seal={seal} />
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mutable ? (
            <Button
              disabled={scanning}
              onClick={handleScan}
              size="sm"
              variant="outline"
              className="gap-1.5"
            >
              <SearchIcon className="size-3.5" />
              {scanning ? "Scanning…" : "Scan"}
            </Button>
          ) : null}
          <Button
            onClick={handleOpen}
            size="sm"
            variant={mutable ? "default" : "outline"}
            className="gap-1.5"
          >
            {actionLabel(run.status)}
            <ChevronRightIcon className="size-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* Lifecycle + counts row */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-3">
            <LifecycleProgress status={run.status} />
            <span className="text-muted-foreground text-xs">
              {run.status === "CLOSED"
                ? "Closed"
                : LIFECYCLE_STEPS[lifecycleIndex(run.status)]}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <UsersIcon className="size-3.5 text-muted-foreground" />
              <span className="font-medium tabular-nums">
                {run.employeeCount}
              </span>
            </div>
            <FindingsBadges
              blockingCount={blockingCount}
              gatePill={gatePill}
              warningCount={warningCount}
            />
          </div>
        </div>

        {/* Seal details */}
        {seal === null ? null : (
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <LockIcon className="size-3 shrink-0" />
            <HashChip label="seal hash" value={seal.sealHash} />
            <span>
              #{seal.sequence} of {seal.chainLength} · closed by{" "}
              {seal.closedBy}
            </span>
          </div>
        )}

        {/* Seal problems */}
        {seal !== null && seal.problems.length > 0 ? (
          <ul className="space-y-1 rounded-md bg-destructive/10 p-2.5 text-destructive text-xs">
            {seal.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}

        {/* Gate issues */}
        {gateResult !== null &&
        !gateResult.ok &&
        gateResult.issues.length > 0 ? (
          <ul className="space-y-1 rounded-md border bg-muted/30 p-2.5 text-xs">
            {gateResult.issues.slice(0, 3).map((issue) => (
              <li
                key={`${issue.kind}-${issue.code}-${issue.findingId ?? issue.lineId ?? issue.message}`}
              >
                <span className="font-mono text-muted-foreground">
                  {issue.code}
                </span>
                {" — "}
                {issue.message}
              </li>
            ))}
            {gateResult.issues.length > 3 ? (
              <li className="text-muted-foreground">
                +{gateResult.issues.length - 3} more
              </li>
            ) : null}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

export type { GatePill, RunControlCardProps };
export { RunControlCard };
