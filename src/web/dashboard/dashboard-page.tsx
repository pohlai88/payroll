/**
 * @feature pay-run
 * @layer ui
 * @hub src/server/routes/pay-run.ts
 *
 * Home dashboard — Studio analytics blocks wired to getPayRuns:
 * statistics-with-status (12), statistics-category-card (18),
 * chart-total-orders (03), widget-payment-history (14).
 */

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  LockIcon,
  ReceiptTextIcon,
  UsersIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import TotalOrdersCard from "@/components/shadcn-studio/blocks/chart-total-orders";
import StatisticsCategoryCard from "@/components/shadcn-studio/blocks/statistics-category-card";
import StatisticsWithStatus, {
  type StatisticStatus,
} from "@/components/shadcn-studio/blocks/statistics-with-status";
import PaymentHistoryCard from "@/components/shadcn-studio/blocks/widget-payment-history";
import type { ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { countClosed, countOpen, deriveBuckets } from "@/lib/pay-run-status";
import type { PayRunSummary } from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";
import { useScopeContext } from "@/web/context/scope-context";
import { PageTitle } from "@/web/shell/page-title";

function formatPeriod(run: PayRunSummary): string {
  return `${String(run.month).padStart(2, "0")}/${run.year}`;
}

function formatReportingMonthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (year === undefined || month === undefined || Number.isNaN(year)) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function DashboardPage() {
  const [, navigate] = useLocation();
  const { scope, reportingMonth } = useScopeContext();
  const [runs, setRuns] = useState<PayRunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    payrollApi
      .getPayRuns({ reportingMonth })
      .then((result) => {
        if (!cancelled) {
          setRuns(result);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reportingMonth]);

  const visibleRuns = useMemo(
    () =>
      scope.mode === "all"
        ? runs
        : runs.filter((run) => scope.companyIds.includes(run.companyId)),
    [runs, scope]
  );

  const buckets = useMemo(() => deriveBuckets(visibleRuns), [visibleRuns]);

  const openRuns = countOpen(buckets);
  const closedRuns = countClosed(buckets);
  const employeeTotal = useMemo(
    () => visibleRuns.reduce((sum, run) => sum + run.employeeCount, 0),
    [visibleRuns]
  );
  const sealedShare =
    visibleRuns.length === 0
      ? 0
      : Math.round((closedRuns / visibleRuns.length) * 100);

  // Governance valence for the KPI row: a count alone doesn't tell an approver
  // whether anything is owed. Empty scope reads neutral, not "on track".
  const hasRuns = visibleRuns.length > 0;
  const openRunsStatus: StatisticStatus = (() => {
    if (!hasRuns) {
      return "neutral";
    }
    return openRuns > 0 ? "attention" : "ok";
  })();
  const closedRunsStatus: StatisticStatus = (() => {
    if (!hasRuns) {
      return "neutral";
    }
    return closedRuns > 0 ? "ok" : "attention";
  })();

  const monthLabel = formatReportingMonthLabel(reportingMonth);

  // Status-valence tokens for lifecycle outcome; categorical chart-* for stage depth.
  const statusChartConfig = {
    value: { label: "Runs" },
    open: {
      label: "Open",
      color: "var(--foreground)",
    },
    sealed: {
      label: "Sealed",
      color: "var(--secondary-foreground)",
    },
    released: {
      label: "Released",
      color: "var(--primary)",
    },
  } satisfies ChartConfig;

  const statusChartData = [
    {
      key: "open",
      value: openRuns,
      fill: "var(--color-open)",
    },
    {
      key: "sealed",
      value: buckets.sealed,
      fill: "var(--color-sealed)",
    },
    {
      key: "released",
      value: buckets.released,
      fill: "var(--color-released)",
    },
  ].filter((slice) => slice.value > 0);

  const hasStatusSlices = statusChartData.length > 0;

  const openRun = useCallback(
    (runId: string) => {
      navigate(`/pay-runs/${runId}`);
    },
    [navigate]
  );

  const historyRows = visibleRuns.slice(0, 8).map((run) => ({
    id: run.id,
    primary: run.companyName,
    secondary: run.label,
    meta: formatPeriod(run),
    value: String(run.employeeCount),
    subValue: run.status,
    onClick: () => {
      openRun(run.id);
    },
  }));

  return (
    <div className="space-y-6">
      <PageTitle
        description={`Pay-run analytics for ${monthLabel}`}
        title="Dashboard"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          (["stat-a", "stat-b", "stat-c", "stat-d"] as const).map((key) => (
            <Skeleton className="h-28 w-full rounded-xl" key={key} />
          ))
        ) : (
          <>
            <StatisticsWithStatus
              caption={monthLabel}
              icon={<ReceiptTextIcon />}
              status={hasRuns ? "pending" : "neutral"}
              title="Pay runs"
              value={String(visibleRuns.length)}
            />
            <StatisticsWithStatus
              caption={
                hasRuns
                  ? `${String(openRuns)} of ${String(visibleRuns.length)} in pipeline`
                  : "Nothing in scope"
              }
              icon={<AlertTriangleIcon />}
              status={openRunsStatus}
              title="Open runs"
              value={String(openRuns)}
            />
            <StatisticsWithStatus
              caption={
                hasRuns
                  ? `${String(sealedShare)}% of runs closed`
                  : "No runs yet"
              }
              icon={<CheckCircle2Icon />}
              status={closedRunsStatus}
              title="Sealed / released"
              value={String(closedRuns)}
            />
            <StatisticsWithStatus
              caption={`Across ${String(visibleRuns.length)} ${visibleRuns.length === 1 ? "run" : "runs"}`}
              icon={<UsersIcon />}
              status={employeeTotal > 0 ? "ok" : "neutral"}
              title="Employees on runs"
              value={String(employeeTotal)}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {loading ? (
          <>
            <Skeleton className="h-80 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
          </>
        ) : (
          <>
            <TotalOrdersCard
              categories={[
                {
                  icon: <AlertTriangleIcon className="size-5" />,
                  title: "Open pipeline",
                  detail: "Draft → approved",
                  value: String(openRuns),
                },
                {
                  icon: <LockIcon className="size-5" />,
                  title: "Sealed",
                  detail: "Closure complete",
                  value: String(buckets.sealed),
                },
                {
                  icon: <CheckCircle2Icon className="size-5" />,
                  title: "Released",
                  detail: "Payments cleared",
                  value: String(buckets.released),
                },
              ]}
              centerLabel={hasStatusSlices ? "closed" : "no runs"}
              centerValue={hasStatusSlices ? `${String(sealedShare)}%` : "—"}
              chartConfig={statusChartConfig}
              chartData={statusChartData}
              emptyMessage="No pay runs in this reporting month and scope."
              menuItems={[{ label: "View pay runs", href: "/pay-runs" }]}
              subtitle={monthLabel}
              title="Pay-run status"
              totalCaption="Visible in scope"
              totalValue={String(visibleRuns.length)}
            />

            <div className="grid gap-4">
              <StatisticsCategoryCard
                period={monthLabel}
                segments={[
                  {
                    label: "Open",
                    value: openRuns,
                    color: "bg-chart-1",
                  },
                  {
                    label: "Sealed",
                    value: buckets.sealed,
                    color: "bg-chart-2",
                  },
                  {
                    label: "Released",
                    value: buckets.released,
                    color: "bg-primary",
                  },
                ]}
                title="Status mix"
                value={`${String(visibleRuns.length)} runs`}
              />
              <StatisticsCategoryCard
                period="Stage depth in open pipeline"
                segments={[
                  {
                    label: "Draft",
                    value: buckets.draft,
                    color: "bg-chart-1",
                  },
                  {
                    label: "Computed",
                    value: buckets.computed,
                    color: "bg-chart-2",
                  },
                  {
                    label: "Reviewed",
                    value: buckets.reviewed,
                    color: "bg-chart-3",
                  },
                  {
                    label: "Approved",
                    value: buckets.approved,
                    color: "bg-chart-4",
                  },
                ]}
                title="Open stages"
                value={`${String(openRuns)} open`}
              />
            </div>
          </>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : (
        <PaymentHistoryCard
          columns={{
            lead: "Company / run",
            meta: "Period",
            value: "Headcount",
          }}
          emptyMessage="No pay runs found for the current scope and reporting month."
          menuItems={[{ label: "View all pay runs", href: "/pay-runs" }]}
          paymentData={historyRows}
          title="Recent pay runs"
        />
      )}
    </div>
  );
}

export { DashboardPage };
