/**
 * Per-run control card — status, finding counts, gate pill, and a
 * context-appropriate action that navigates into the workspace.
 */

import { useCallback } from "react";
import { HashChip } from "@/components/payroll/hash-chip";
import { isRunStatus, StatusBadge } from "@/components/payroll/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  /** Null for runs that are not closed, and for a seal that could not be read. */
  readonly seal: RunSeal | null;
}

function pillClass(pill: GatePill): string {
  if (pill === "CLEAR") {
    return "border-0 bg-[var(--status-ok-fill)] text-[var(--status-ok-ink)]";
  }
  if (pill === "BLOCKED") {
    return "border-0 bg-[var(--status-bad-fill)] text-[var(--status-bad-ink)]";
  }
  return "border-border text-muted-foreground";
}

/**
 * Two claims, kept apart: this run's own seal recomputes, and the company's
 * chain around it is unbroken. A run can be fine while the chain is not.
 */
function SealBadges({ seal }: { readonly seal: RunSeal }) {
  const intact = seal.ok && seal.chainOk;
  return (
    <Badge
      className={cn(
        "border-0 text-xs",
        intact
          ? "bg-[var(--status-ok-fill)] text-[var(--status-ok-ink)]"
          : "bg-[var(--status-bad-fill)] text-[var(--status-bad-ink)]"
      )}
    >
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="truncate text-base">
            {run.companyName}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="font-mono text-xs" variant="outline">
              {period}
            </Badge>
            <StatusBadge
              status={isRunStatus(run.status) ? run.status : "DRAFT"}
            />
            {seal === null ? (
              <Badge className={cn("text-xs", pillClass(gatePill))}>
                Gate {gatePill}
              </Badge>
            ) : (
              <SealBadges seal={seal} />
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {mutable ? (
            <Button
              disabled={scanning}
              onClick={handleScan}
              size="sm"
              variant="outline"
            >
              {scanning ? "Scanning…" : "Scan"}
            </Button>
          ) : null}
          <Button
            onClick={handleOpen}
            size="sm"
            variant={mutable ? "default" : "outline"}
          >
            {actionLabel(run.status)}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-3 text-muted-foreground">
          <span>
            Blocking:{" "}
            <span className="font-medium text-foreground">
              {blockingCount ?? "—"}
            </span>
          </span>
          <span>
            Warnings:{" "}
            <span className="font-medium text-foreground">
              {warningCount ?? "—"}
            </span>
          </span>
          <span>
            Employees:{" "}
            <span className="font-medium text-foreground">
              {run.employeeCount}
            </span>
          </span>
        </div>
        {seal === null ? null : (
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <span>Seal</span>
            <HashChip label="seal hash" value={seal.sealHash} />
            <span>
              #{seal.sequence} of {seal.chainLength} · closed by {seal.closedBy}
            </span>
          </div>
        )}
        {seal === null || seal.problems.length === 0 ? null : (
          <ul className="space-y-1 rounded-md bg-[var(--status-bad-fill)] p-2 text-[var(--status-bad-ink)] text-xs">
            {seal.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        {gateResult !== null &&
        !gateResult.ok &&
        gateResult.issues.length > 0 ? (
          <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
            {gateResult.issues.slice(0, 3).map((issue) => (
              <li key={`${issue.code}-${issue.message}`}>
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
