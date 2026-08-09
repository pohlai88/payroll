/**
 * @feature findings
 * @layer ui
 * @hub src/server/routes/pay-run.ts
 *
 * Workspace findings panel — scan trigger, severity-tagged list, and
 * acknowledge flow for OPEN warnings. BLOCKING findings cannot be
 * acknowledged (server rule); they must be fixed and re-scanned.
 *
 * Visual DNA: Card + Collapsible console panel with soft status badges.
 */

import { ChevronDownIcon, ShieldAlertIcon } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { severityBadgeVariant } from "@/components/payroll/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsyncLoad } from "@/hooks/use-async-load";
import { cn } from "@/lib/utils";
import { formatApiError } from "@/web/api/format-error";
import type { FindingRow, FindingsSummary } from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";

interface FindingsPanelProps {
  readonly runId: string;
  readonly findingsSummary: FindingsSummary | null;
  /** Called after scan or acknowledge so the workspace can refetch. */
  readonly onChanged: () => void;
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
      setError(formatApiError(err, "Acknowledge failed"));
    } finally {
      setAcking(false);
    }
  }, [finding.id, finding.severity, note, onAcknowledged, runId]);

  return (
    <li className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0 sm:px-5">
      <div className="flex flex-wrap items-start gap-2">
        <Badge
          className="h-auto shrink-0 rounded-sm px-1.5"
          variant={severityBadgeVariant(finding.severity)}
        >
          {finding.severity}
        </Badge>
        <Badge
          className="h-auto shrink-0 rounded-sm px-1.5 font-mono text-xs"
          variant="outline"
        >
          {finding.status}
        </Badge>
        <span className="min-w-0 flex-1 font-medium text-sm">
          {finding.title}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">{finding.detail}</p>
      <p className="font-mono text-muted-foreground text-xs">{finding.ruleId}</p>
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
        <Alert variant="destructive">
          <AlertDescription>
            Blocking — fix the condition and re-scan; cannot be acknowledged.
          </AlertDescription>
        </Alert>
      ) : null}
      {error === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
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
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const fetchFindings = useCallback(async () => {
    const res = await payrollApi.getFindings(runId);
    return res.findings;
  }, [runId]);

  const {
    data: findingsData,
    loading,
    error,
    reload: loadFindings,
  } = useAsyncLoad(fetchFindings, "Failed to load findings");

  const findings = findingsData ?? [];

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
    setScanError(null);
    try {
      await payrollApi.scanFindings(runId);
      setOpen(true);
      await loadFindings();
      onChanged();
    } catch (err) {
      setScanError(formatApiError(err, "Scan failed"));
    } finally {
      setScanning(false);
    }
  }, [loadFindings, onChanged, runId]);

  const handleAcknowledged = useCallback(() => {
    loadFindings().then(onChanged);
  }, [loadFindings, onChanged]);

  const blocking = findingsSummary?.blockingCount ?? 0;
  const warning = findingsSummary?.warningCount ?? 0;

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ShieldAlertIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-sm">Findings</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {hasSummary ? (
                  <>
                    <Badge
                      className="h-auto rounded-sm px-1.5"
                      variant={blocking > 0 ? "destructive" : "secondary"}
                    >
                      {blocking} blocking
                    </Badge>
                    <Badge
                      className="h-auto rounded-sm px-1.5"
                      variant={warning > 0 ? "outline" : "secondary"}
                    >
                      {warning} warning
                    </Badge>
                  </>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    No open findings
                  </span>
                )}
              </div>
            </div>
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
          {error !== null || scanError !== null ? (
            <div className="border-t px-4 py-3 sm:px-5">
              <Alert variant="destructive">
                <AlertDescription>{error ?? scanError}</AlertDescription>
              </Alert>
            </div>
          ) : null}
          {loading && findings.length === 0 ? (
            <div className="space-y-2 border-t px-4 py-4 sm:px-5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : null}
          {!loading && findings.length === 0 ? (
            <p className="border-t px-4 py-4 text-muted-foreground text-sm sm:px-5">
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
