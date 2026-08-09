/**
 * Control screen — cross-run findings/gate overview. Replaces the Phase 5B
 * EmptyState placeholder. Fetches pay runs for the current scope, then loads
 * findings counts + the relevant gate for DRAFT/REVIEWED runs.
 */

import { ShieldCheckIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { EmptyState } from "@/components/ui/empty-state";
import { formatApiError } from "@/web/api/format-error";
import type {
  FindingRow,
  GateKind,
  GateResult,
  PayRunSummary,
  RunSeal,
} from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";
import { useScopeContext } from "@/web/context/scope-context";
import { PageTitle } from "@/web/shell/page-title";
import { type GatePill, RunControlCard } from "./run-control-card";

interface RunControlState {
  readonly run: PayRunSummary;
  readonly blockingCount: number | null;
  readonly warningCount: number | null;
  readonly gatePill: GatePill;
  readonly gateResult: GateResult | null;
  /** Closed runs only: a gate has nothing left to say about them, a seal does. */
  readonly seal: RunSeal | null;
}

function countOpenFindings(findings: readonly FindingRow[]): {
  blockingCount: number;
  warningCount: number;
} {
  let blockingCount = 0;
  let warningCount = 0;
  for (const finding of findings) {
    if (finding.status !== "OPEN") {
      continue;
    }
    if (finding.severity === "BLOCKING") {
      blockingCount += 1;
    } else if (finding.severity === "WARNING") {
      warningCount += 1;
    }
  }
  return { blockingCount, warningCount };
}

/**
 * A run whose seal cannot be fetched is shown without one rather than failing
 * the whole overview — an unverifiable seal is not the same claim as a broken
 * one, and the card must not conflate them.
 */
async function loadSealOrNull(run: PayRunSummary): Promise<RunSeal | null> {
  if (run.status !== "CLOSED") {
    return null;
  }
  try {
    return (await payrollApi.getRunSeal(run.id)).seal;
  } catch {
    return null;
  }
}

function gateForStatus(status: string): GateKind | null {
  if (status === "DRAFT") {
    return "REVIEW";
  }
  if (status === "REVIEWED") {
    return "APPROVAL";
  }
  if (status === "APPROVED") {
    return "RELEASE";
  }
  return null;
}

function ControlPage() {
  const { scope, reportingMonth } = useScopeContext();
  const [, setLocation] = useLocation();
  const [rows, setRows] = useState<RunControlState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const companyId =
        scope.mode === "selected" && scope.companyIds.length === 1
          ? scope.companyIds[0]
          : undefined;
      const runs = await payrollApi.getPayRuns({
        companyId,
        reportingMonth,
      });

      let filtered = runs;
      if (scope.mode === "selected" && scope.companyIds.length !== 1) {
        const allowed = new Set(scope.companyIds);
        filtered =
          scope.companyIds.length === 0
            ? []
            : runs.filter((run) => allowed.has(run.companyId));
      }

      const sorted = [...filtered].sort((a, b) => {
        const monthCmp = `${b.year}-${b.month}`.localeCompare(
          `${a.year}-${a.month}`
        );
        if (monthCmp !== 0) {
          return monthCmp;
        }
        return a.companyName.localeCompare(b.companyName);
      });

      const enriched = await Promise.all(
        sorted.map(async (run): Promise<RunControlState> => {
          const gate = gateForStatus(run.status);
          if (gate === null) {
            return {
              run,
              blockingCount: null,
              warningCount: null,
              gatePill: "N/A",
              gateResult: null,
              seal: await loadSealOrNull(run),
            };
          }
          try {
            const [findingsRes, gateResult] = await Promise.all([
              payrollApi.getFindings(run.id),
              payrollApi.evaluateGate(run.id, gate),
            ]);
            const counts = countOpenFindings(findingsRes.findings);
            return {
              run,
              blockingCount: counts.blockingCount,
              warningCount: counts.warningCount,
              gatePill: gateResult.ok ? "CLEAR" : "BLOCKED",
              gateResult,
              seal: null,
            };
          } catch {
            return {
              run,
              blockingCount: null,
              warningCount: null,
              gatePill: "UNKNOWN",
              gateResult: null,
              seal: null,
            };
          }
        })
      );
      setRows(enriched);
    } catch (err) {
      setError(formatApiError(err, "Failed to load control"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [reportingMonth, scope]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpenWorkspace = useCallback(
    (runId: string) => {
      setLocation(`/pay-runs/${runId}`);
    },
    [setLocation]
  );

  const handleScan = useCallback(
    async (runId: string) => {
      setScanningId(runId);
      try {
        await payrollApi.scanFindings(runId);
        await load();
      } catch (err) {
        setError(formatApiError(err, "Scan failed"));
      } finally {
        setScanningId(null);
      }
    },
    [load]
  );

  const pendingCount = useMemo(
    () =>
      rows.filter(
        (row) => row.run.status === "DRAFT" || row.run.status === "REVIEWED"
      ).length,
    [rows]
  );

  if (loading && rows.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
        Loading control overview…
      </div>
    );
  }

  if (error !== null && rows.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-destructive text-sm">
        {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        description="No pay runs in the current company scope and reporting month."
        icon={<ShieldCheckIcon />}
        title="Control"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        description={`${reportingMonth} · ${pendingCount} run${pendingCount === 1 ? "" : "s"} pending review/approval`}
        title="Control"
      />

      {error === null ? null : (
        <p className="text-destructive text-sm">{error}</p>
      )}

      <div className="grid gap-3">
        {rows.map((row) => (
          <RunControlCard
            blockingCount={row.blockingCount}
            gatePill={row.gatePill}
            gateResult={row.gateResult}
            key={row.run.id}
            onOpenWorkspace={handleOpenWorkspace}
            onScan={handleScan}
            run={row.run}
            scanning={scanningId === row.run.id}
            seal={row.seal}
            warningCount={row.warningCount}
          />
        ))}
      </div>
    </div>
  );
}

export { ControlPage };
