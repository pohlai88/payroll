/**
 * Workspace findings panel — scan trigger, severity-tagged list, and
 * acknowledge flow for OPEN warnings. BLOCKING findings cannot be
 * acknowledged (server rule); they must be fixed and re-scanned.
 */

import { ChevronDownIcon, ShieldAlertIcon } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  FindingRow,
  FindingSeverity,
  FindingsSummary,
} from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";

interface FindingsPanelProps {
  readonly runId: string;
  readonly findingsSummary: FindingsSummary | null;
  /** Called after scan or acknowledge so the workspace can refetch. */
  readonly onChanged: () => void;
}

function severityBadgeClass(severity: FindingSeverity): string {
  if (severity === "BLOCKING") {
    return "border-0 bg-[var(--status-bad-fill)] text-[var(--status-bad-ink)]";
  }
  if (severity === "WARNING") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200";
  }
  return "border-border bg-muted text-muted-foreground";
}

function FindingRowView({
  finding,
  runId,
  busy,
  onAcknowledged,
}: {
  readonly finding: FindingRow;
  readonly runId: string;
  readonly busy: boolean;
  readonly onAcknowledged: () => void;
}) {
  const [note, setNote] = useState("");
  const [acking, setAcking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAck =
    finding.status === "OPEN" &&
    finding.severity !== "BLOCKING" &&
    finding.severity !== "INFO";

  const handleNoteChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setNote(e.target.value);
  }, []);

  const handleAck = useCallback(async () => {
    setAcking(true);
    setError(null);
    try {
      await payrollApi.acknowledgeFinding(
        runId,
        finding.id,
        finding.severity === "WARNING" ? note.trim() : undefined
      );
      onAcknowledged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Acknowledge failed");
    } finally {
      setAcking(false);
    }
  }, [finding.id, finding.severity, note, onAcknowledged, runId]);

  return (
    <li className="flex flex-col gap-2 border-b px-3 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start gap-2">
        <Badge className={cn("shrink-0", severityBadgeClass(finding.severity))}>
          {finding.severity}
        </Badge>
        <Badge className="shrink-0 font-mono text-xs" variant="outline">
          {finding.status}
        </Badge>
        <span className="min-w-0 flex-1 font-medium text-sm">
          {finding.title}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">{finding.detail}</p>
      <p className="font-mono text-muted-foreground text-xs">
        {finding.ruleId}
      </p>
      {finding.status === "ACKNOWLEDGED" && finding.ackNote !== null ? (
        <p className="text-muted-foreground text-xs">
          Ack by {finding.ackActor ?? "—"}: {finding.ackNote}
        </p>
      ) : null}
      {canAck ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {finding.severity === "WARNING" ? (
            <Input
              className="sm:flex-1"
              disabled={busy || acking}
              onChange={handleNoteChange}
              placeholder="Acknowledgment note (required)"
              value={note}
            />
          ) : null}
          <Button
            disabled={
              busy ||
              acking ||
              (finding.severity === "WARNING" && note.trim() === "")
            }
            onClick={handleAck}
            size="sm"
            variant="outline"
          >
            {acking ? "Acknowledging…" : "Acknowledge"}
          </Button>
        </div>
      ) : null}
      {finding.severity === "BLOCKING" && finding.status === "OPEN" ? (
        <p className="text-[var(--status-bad-ink)] text-xs">
          Blocking — fix the condition and re-scan; cannot be acknowledged.
        </p>
      ) : null}
      {error === null ? null : (
        <p className="text-destructive text-xs">{error}</p>
      )}
    </li>
  );
}

function FindingsPanel({
  runId,
  findingsSummary,
  onChanged,
}: FindingsPanelProps) {
  const hasSummary = findingsSummary !== null;
  const [open, setOpen] = useState(hasSummary);
  const [findings, setFindings] = useState<readonly FindingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFindings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await payrollApi.getFindings(runId);
      setFindings(res.findings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load findings");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    if (open) {
      loadFindings();
    }
  }, [open, loadFindings]);

  useEffect(() => {
    if (hasSummary) {
      setOpen(true);
    }
  }, [hasSummary]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      await payrollApi.scanFindings(runId);
      setOpen(true);
      await loadFindings();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }, [loadFindings, onChanged, runId]);

  const handleAcknowledged = useCallback(() => {
    loadFindings().then(onChanged);
  }, [loadFindings, onChanged]);

  const blocking = findingsSummary?.blockingCount ?? 0;
  const warning = findingsSummary?.warningCount ?? 0;
  const summaryLabel = hasSummary
    ? `${blocking} blocking · ${warning} warning`
    : "No open findings";

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 px-3 py-2">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <ShieldAlertIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium text-sm">Findings</span>
            <span className="truncate text-muted-foreground text-xs">
              {summaryLabel}
            </span>
            <ChevronDownIcon
              className={cn(
                "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180"
              )}
            />
          </CollapsibleTrigger>
          <Button
            disabled={scanning}
            onClick={handleScan}
            size="sm"
            variant="outline"
          >
            {scanning ? "Scanning…" : "Scan"}
          </Button>
        </div>
        <CollapsibleContent>
          {error === null ? null : (
            <p className="border-t px-3 py-2 text-destructive text-sm">
              {error}
            </p>
          )}
          {loading && findings.length === 0 ? (
            <p className="border-t px-3 py-4 text-muted-foreground text-sm">
              Loading findings…
            </p>
          ) : null}
          {!loading && findings.length === 0 ? (
            <p className="border-t px-3 py-4 text-muted-foreground text-sm">
              No findings for this run. Run a scan after recompute.
            </p>
          ) : null}
          {findings.length > 0 ? (
            <ul className="border-t">
              {findings.map((finding) => (
                <FindingRowView
                  busy={scanning}
                  finding={finding}
                  key={finding.id}
                  onAcknowledged={handleAcknowledged}
                  runId={runId}
                />
              ))}
            </ul>
          ) : null}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export type { FindingsPanelProps };
export { FindingsPanel };
