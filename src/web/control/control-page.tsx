/**
 * @feature control
 * @layer ui
 * @hub src/server/routes/pay-run-control.ts
 *
 * Control screen — cross-run findings/gate overview with tabbed filtering,
 * status distribution bar, and lifecycle-aware KPI strip.
 * Studio DNA: statistics-with-status (12) + statistics-category-card +
 * empty-state-01 + tabs primitive.
 */

import {
  AlertTriangleIcon,
  LockIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  TimerIcon,
  UsersIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import EmptyState01 from "@/components/shadcn-studio/blocks/empty-state-01/empty-state-01";
import StatisticsCategoryCard from "@/components/shadcn-studio/blocks/statistics-category-card";
import StatisticsWithStatus from "@/components/shadcn-studio/blocks/statistics-with-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  readonly seal: RunSeal | null;
}

type FilterTab = "all" | "needs-action" | "cleared" | "closed";

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

function tabFilter(row: RunControlState, tab: FilterTab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "needs-action":
      return row.gatePill === "BLOCKED" || row.gatePill === "UNKNOWN";
    case "cleared":
      return row.gatePill === "CLEAR" && row.run.status !== "CLOSED";
    case "closed":
      return row.run.status === "CLOSED";
    default:
      return true;
  }
}

const EMPTY_MESSAGES: Record<FilterTab, string> = {
  all: "No runs match the current filter.",
  "needs-action": "No runs need action — all gates are clear or closed.",
  cleared: "No runs with cleared gates in the current scope.",
  closed: "No sealed runs in the current scope.",
};

function emptyMessageForTab(tab: FilterTab): string {
  return EMPTY_MESSAGES[tab];
}

async function enrichRun(run: PayRunSummary): Promise<RunControlState> {
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
}

function filterRunsByScope(
  runs: PayRunSummary[],
  scope: { mode: "all" } | { mode: "selected"; companyIds: string[] }
): PayRunSummary[] {
  if (scope.mode !== "selected" || scope.companyIds.length === 1) {
    return runs;
  }
  if (scope.companyIds.length === 0) {
    return [];
  }
  const allowed = new Set(scope.companyIds);
  return runs.filter((run) => allowed.has(run.companyId));
}

function sortRuns(runs: PayRunSummary[]): PayRunSummary[] {
  return [...runs].sort((a, b) => {
    const monthCmp = `${b.year}-${b.month}`.localeCompare(
      `${a.year}-${a.month}`
    );
    if (monthCmp !== 0) {
      return monthCmp;
    }
    return a.companyName.localeCompare(b.companyName);
  });
}

interface ControlKpiStripProps {
  readonly rows: readonly RunControlState[];
  readonly pendingCount: number;
  readonly blockedCount: number;
  readonly closedCount: number;
}

function ControlKpiStrip({
  rows,
  pendingCount,
  blockedCount,
  closedCount,
}: ControlKpiStripProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatisticsWithStatus
        caption={rows.length > 0 ? "In current scope" : "Nothing in scope"}
        icon={<ShieldCheckIcon />}
        status={rows.length > 0 ? "pending" : "neutral"}
        title="Runs in view"
        value={String(rows.length)}
      />
      <StatisticsWithStatus
        caption={
          pendingCount > 0 ? "Awaiting a gate decision" : "Nothing awaiting"
        }
        icon={<TimerIcon />}
        status={pendingCount > 0 ? "attention" : "ok"}
        title="Pending review/approval"
        value={String(pendingCount)}
      />
      <StatisticsWithStatus
        caption={
          blockedCount > 0 ? "Blocked by findings" : "No blocking findings"
        }
        icon={<AlertTriangleIcon />}
        status={blockedCount > 0 ? "risk" : "ok"}
        title="Gate blocked"
        value={String(blockedCount)}
      />
      <StatisticsWithStatus
        caption={
          closedCount > 0
            ? `${closedCount} of ${rows.length} runs sealed`
            : "No sealed runs yet"
        }
        icon={<LockIcon />}
        status={closedCount > 0 ? "ok" : "neutral"}
        title="Sealed / closed"
        value={String(closedCount)}
      />
    </div>
  );
}

interface StatusDistributionProps {
  readonly rows: readonly RunControlState[];
  readonly blockedCount: number;
  readonly clearedCount: number;
  readonly closedCount: number;
  readonly pendingCount: number;
  readonly reportingMonth: string;
}

function StatusDistribution({
  rows,
  blockedCount,
  clearedCount,
  closedCount,
  pendingCount,
  reportingMonth,
}: StatusDistributionProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StatisticsCategoryCard
        period={`${reportingMonth} · gate overview`}
        segments={[
          { label: "Blocked", value: blockedCount, color: "bg-destructive" },
          { label: "Cleared", value: clearedCount, color: "bg-primary" },
          { label: "Closed", value: closedCount, color: "bg-chart-2" },
        ]}
        title="Gate distribution"
        value={`${rows.length} runs`}
      />
      <StatisticsCategoryCard
        period="Lifecycle stage breakdown"
        segments={[
          {
            label: "Draft",
            value: rows.filter((r) => r.run.status === "DRAFT").length,
            color: "bg-chart-1",
          },
          {
            label: "Reviewed",
            value: rows.filter((r) => r.run.status === "REVIEWED").length,
            color: "bg-chart-3",
          },
          {
            label: "Approved",
            value: rows.filter((r) => r.run.status === "APPROVED").length,
            color: "bg-chart-4",
          },
          {
            label: "Closed",
            value: closedCount,
            color: "bg-chart-2",
          },
        ]}
        title="Pipeline stages"
        value={`${pendingCount} pending`}
      />
    </div>
  );
}

function ControlPage() {
  const { scope, reportingMonth } = useScopeContext();
  const [, setLocation] = useLocation();
  const [rows, setRows] = useState<RunControlState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [scanAllLoading, setScanAllLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const companyId =
        scope.mode === "selected" && scope.companyIds.length === 1
          ? scope.companyIds[0]
          : undefined;
      const runs = await payrollApi.getPayRuns({ companyId, reportingMonth });
      const filtered = filterRunsByScope(runs, scope);
      const sorted = sortRuns(filtered);
      const enriched = await Promise.all(sorted.map(enrichRun));
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

  const handleTabChange = useCallback(
    (v: string | number | null) => {
      setActiveTab((v as FilterTab) ?? "all");
    },
    []
  );

  const handleScanAll = useCallback(async () => {
    const mutableRuns = rows.filter(
      (r) => r.run.status === "DRAFT" || r.run.status === "REVIEWED"
    );
    if (mutableRuns.length === 0) {
      return;
    }
    setScanAllLoading(true);
    try {
      await Promise.all(
        mutableRuns.map((r) => payrollApi.scanFindings(r.run.id))
      );
      await load();
    } catch (err) {
      setError(formatApiError(err, "Scan all failed"));
    } finally {
      setScanAllLoading(false);
    }
  }, [rows, load]);

  // --- Derived counts ---
  const pendingCount = useMemo(
    () =>
      rows.filter(
        (r) => r.run.status === "DRAFT" || r.run.status === "REVIEWED"
      ).length,
    [rows]
  );

  const blockedCount = useMemo(
    () => rows.filter((r) => r.gatePill === "BLOCKED").length,
    [rows]
  );

  const clearedCount = useMemo(
    () =>
      rows.filter(
        (r) => r.gatePill === "CLEAR" && r.run.status !== "CLOSED"
      ).length,
    [rows]
  );

  const closedCount = useMemo(
    () => rows.filter((r) => r.run.status === "CLOSED").length,
    [rows]
  );

  const totalEmployees = useMemo(
    () => rows.reduce((sum, r) => sum + r.run.employeeCount, 0),
    [rows]
  );

  const needsActionCount = useMemo(
    () =>
      rows.filter(
        (r) => r.gatePill === "BLOCKED" || r.gatePill === "UNKNOWN"
      ).length,
    [rows]
  );

  const filteredRows = useMemo(
    () => rows.filter((r) => tabFilter(r, activeTab)),
    [rows, activeTab]
  );

  const mutableRunCount = useMemo(
    () =>
      rows.filter(
        (r) => r.run.status === "DRAFT" || r.run.status === "REVIEWED"
      ).length,
    [rows]
  );

  // --- Loading skeleton ---
  if (loading && rows.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <PageTitle
          description={`${reportingMonth} · gate and findings overview`}
          title="Control"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(["kpi-a", "kpi-b", "kpi-c", "kpi-d"] as const).map((key) => (
            <Skeleton className="h-28 w-full rounded-xl" key={key} />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
        <div className="grid gap-3">
          {(["card-a", "card-b", "card-c"] as const).map((key) => (
            <Skeleton className="h-36 w-full rounded-xl" key={key} />
          ))}
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error !== null && rows.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <PageTitle
          description={`${reportingMonth} · gate and findings overview`}
          title="Control"
        />
        <div className="flex h-64 items-center justify-center rounded-xl border bg-card text-destructive text-sm">
          {error}
        </div>
      </div>
    );
  }

  // --- Empty state ---
  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <PageTitle
          description={`${reportingMonth} · gate and findings overview`}
          title="Control"
        />
        <EmptyState01
          className="max-w-none"
          description="Control overview"
          emptyDetail="No pay runs in the current company scope and reporting month."
          emptyTitle="Nothing to review"
          icon={
            <ShieldCheckIcon className="mx-auto size-12 text-muted-foreground" />
          }
          title="0"
        />
      </div>
    );
  }

  // --- Main view ---
  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        actions={
          mutableRunCount > 0 ? (
            <Button
              className="gap-1.5"
              disabled={scanAllLoading}
              onClick={handleScanAll}
              size="sm"
              variant="outline"
            >
              <RefreshCwIcon
                className={`size-3.5 ${scanAllLoading ? "animate-spin" : ""}`}
              />
              {scanAllLoading
                ? "Scanning…"
                : `Scan all (${mutableRunCount})`}
            </Button>
          ) : undefined
        }
        description={`${reportingMonth} · ${pendingCount} run${pendingCount === 1 ? "" : "s"} pending review/approval · ${totalEmployees} employees`}
        title="Control"
      />

      {/* --- KPI Strip --- */}
      <ControlKpiStrip
        blockedCount={blockedCount}
        closedCount={closedCount}
        pendingCount={pendingCount}
        rows={rows}
      />

      {/* --- Status Distribution --- */}
      <StatusDistribution
        blockedCount={blockedCount}
        clearedCount={clearedCount}
        closedCount={closedCount}
        pendingCount={pendingCount}
        reportingMonth={reportingMonth}
        rows={rows}
      />

      {/* --- Inline error (background refresh fail) --- */}
      {error === null ? null : (
        <p className="text-destructive text-sm">{error}</p>
      )}

      {/* --- Tabbed Run List --- */}
      <Tabs
        onValueChange={handleTabChange}
        value={activeTab}
      >
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="all">
              All
              <span className="ml-1 font-normal text-muted-foreground tabular-nums">
                {rows.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="needs-action">
              Needs action
              {needsActionCount > 0 ? (
                <span className="ml-1 font-normal text-destructive tabular-nums">
                  {needsActionCount}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="cleared">
              Cleared
              {clearedCount > 0 ? (
                <span className="ml-1 font-normal text-muted-foreground tabular-nums">
                  {clearedCount}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="closed">
              Closed
              {closedCount > 0 ? (
                <span className="ml-1 font-normal text-muted-foreground tabular-nums">
                  {closedCount}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <UsersIcon className="size-3.5" />
            <span className="tabular-nums">{totalEmployees} employees across {rows.length} runs</span>
          </div>
        </div>

        {(
          ["all", "needs-action", "cleared", "closed"] as const
        ).map((tab) => (
          <TabsContent key={tab} value={tab}>
            {filteredRows.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-lg border bg-muted/20 text-muted-foreground text-sm">
                {emptyMessageForTab(tab)}
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredRows.map((row) => (
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
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export { ControlPage };
