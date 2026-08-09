/**
 * @feature pay-run
 * @layer ui
 * @hub src/server/routes/pay-run.ts
 *
 * Home dashboard — Studio analytics blocks wired to getPayRuns:
 * statistics-category-card (18), chart-total-orders (03), widget-payment-history (14).
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
import StatisticsCard from "@/components/shadcn-studio/blocks/statistics-card-02";
import StatisticsCategoryCard from "@/components/shadcn-studio/blocks/statistics-category-card";
import PaymentHistoryCard from "@/components/shadcn-studio/blocks/widget-payment-history";
import type { ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
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

interface StatusBuckets {
  draft: number;
  computed: number;
  reviewed: number;
  approved: number;
  sealed: number;
  released: number;
  other: number;
}

function bucketStatus(status: string): keyof StatusBuckets {
  switch (status) {
    case "DRAFT":
      return "draft";
    case "COMPUTED":
      return "computed";
    case "REVIEWED":
      return "reviewed";
    case "APPROVED":
      return "approved";
    case "SEALED":
      return "sealed";
    case "RELEASED":
      return "released";
    default:
      return "other";
  }
}

function deriveBuckets(runs: readonly PayRunSummary[]): StatusBuckets {
  const buckets: StatusBuckets = {
    draft: 0,
    computed: 0,
    reviewed: 0,
    approved: 0,
    sealed: 0,
    released: 0,
    other: 0,
  };
  for (const run of runs) {
    const key = bucketStatus(run.status);
    buckets[key] += 1;
  }
  return buckets;
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

  const openRuns =
    buckets.draft +
    buckets.computed +
    buckets.reviewed +
    buckets.approved +
    buckets.other;
  const closedRuns = buckets.sealed + buckets.released;
  const employeeTotal = useMemo(
    () => visibleRuns.reduce((sum, run) => sum + run.employeeCount, 0),
    [visibleRuns]
  );
  const sealedShare =
    visibleRuns.length === 0
      ? 0
      : Math.round((closedRuns / visibleRuns.length) * 100);

  const monthLabel = formatReportingMonthLabel(reportingMonth);

  // Status-valence tokens for lifecycle outcome; categorical chart-* for stage depth.
  const statusChartConfig = {
    value: { label: "Runs" },
    open: {
      label: "Open",
      color: "var(--status-warn-ink)",
    },
    sealed: {
      label: "Sealed",
      color: "var(--status-ok-ink)",
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
            <StatisticsCard
              icon={<ReceiptTextIcon />}
              showPeriodFilter={false}
              title="Pay runs"
              value={String(visibleRuns.length)}
            />
            <StatisticsCard
              icon={<AlertTriangleIcon />}
              iconClassName="bg-status-warn-fill text-status-warn-ink"
              showPeriodFilter={false}
              title="Open runs"
              value={String(openRuns)}
            />
            <StatisticsCard
              icon={<CheckCircle2Icon />}
              iconClassName="bg-status-ok-fill text-status-ok-ink"
              showPeriodFilter={false}
              title="Sealed / released"
              value={String(closedRuns)}
            />
            <StatisticsCard
              icon={<UsersIcon />}
              showPeriodFilter={false}
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
                    color: "bg-status-warn-ink",
                  },
                  {
                    label: "Sealed",
                    value: buckets.sealed,
                    color: "bg-status-ok-ink",
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
