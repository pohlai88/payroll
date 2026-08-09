/**
 * @feature pay-run
 * @layer ui
 * @hub src/server/routes/pay-run.ts
 *
 * Home dashboard — full-coverage payroll analytics wired to getPayRuns +
 * getEmployees + AuthContext (companies). Studio DNA: statistics-with-status,
 * chart-total-orders, statistics-category-card, widget-payment-history,
 * progress bar from widget-component-20.
 */

import {
  AlertTriangleIcon,
  Building2Icon,
  CheckCircle2Icon,
  LockIcon,
  ReceiptTextIcon,
  TrendingUpIcon,
  UserCheckIcon,
  UserMinusIcon,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { countClosed, countOpen, deriveBuckets } from "@/lib/pay-run-status";
import type { PayRunSummary } from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";
import type { EmployeeSummary } from "@/web/api/types";
import { useAuthContext } from "@/web/context/auth-context";
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

interface WorkforceCardProps {
  readonly scopeLabel: string;
  readonly employees: readonly EmployeeSummary[];
}

function WorkforceCard({ scopeLabel, employees: emps }: WorkforceCardProps) {
  const activeCount = emps.filter((e) => e.status === "ACTIVE").length;
  const terminatedCount = emps.filter((e) => e.status === "TERMINATED").length;
  const total = emps.length;
  const activePercent =
    total === 0 ? 0 : Math.round((activeCount / total) * 100);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="font-semibold text-base">Workforce</CardTitle>
        <span className="text-muted-foreground text-xs">{scopeLabel}</span>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-5">
        <div className="space-y-3">
          <Progress className="h-2" value={activePercent} />
          <div className="flex justify-between">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded-xs bg-primary" />
                <span className="font-medium text-sm">Active</span>
              </div>
              <div>
                <span className="font-semibold">{activeCount}</span>
                <span className="text-muted-foreground">
                  {" "}
                  ({activePercent}%)
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded-xs bg-primary/20" />
                <span className="font-medium text-sm">Terminated</span>
              </div>
              <div>
                <span className="font-semibold">{terminatedCount}</span>
                <span className="text-muted-foreground">
                  {" "}
                  ({total === 0 ? 0 : 100 - activePercent}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/40 p-3">
            <UserCheckIcon className="size-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{activeCount}</span>
            <span className="text-muted-foreground text-xs">Active</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/40 p-3">
            <UserMinusIcon className="size-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{terminatedCount}</span>
            <span className="text-muted-foreground text-xs">Termed</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/40 p-3">
            <TrendingUpIcon className="size-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{total}</span>
            <span className="text-muted-foreground text-xs">Total</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function useDashboardData() {
  const { scope, reportingMonth } = useScopeContext();
  const [runs, setRuns] = useState<PayRunSummary[]>([]);
  const [employees, setEmployees] = useState<readonly EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const singleCompanyId =
    scope.mode === "selected" && scope.companyIds.length === 1
      ? scope.companyIds[0]
      : undefined;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      payrollApi.getPayRuns({ reportingMonth }),
      payrollApi.getEmployees({ companyId: singleCompanyId }),
    ])
      .then(([runsResult, employeesResult]) => {
        if (!cancelled) {
          setRuns(runsResult);
          setEmployees(employeesResult);
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
  }, [reportingMonth, singleCompanyId]);

  const visibleRuns = useMemo(
    () =>
      scope.mode === "all"
        ? runs
        : runs.filter((run) => scope.companyIds.includes(run.companyId)),
    [runs, scope]
  );

  const visibleEmployees = useMemo(
    () =>
      scope.mode === "all"
        ? employees
        : employees.filter((e) => scope.companyIds.includes(e.companyId)),
    [employees, scope]
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

  return {
    loading,
    scope,
    reportingMonth,
    visibleRuns,
    visibleEmployees,
    buckets,
    openRuns,
    closedRuns,
    employeeTotal,
    sealedShare,
  };
}

function DashboardPage() {
  const [, navigate] = useLocation();
  const { me } = useAuthContext();
  const {
    loading,
    scope,
    reportingMonth,
    visibleRuns,
    visibleEmployees,
    buckets,
    openRuns,
    closedRuns,
    employeeTotal,
    sealedShare,
  } = useDashboardData();

  const companies = me?.companies ?? [];
  const hasRuns = visibleRuns.length > 0;

  const openRunsStatus: StatisticStatus = (() => {
    if (hasRuns) {
      return openRuns > 0 ? "attention" : "ok";
    }
    return "neutral";
  })();
  const closedRunsStatus: StatisticStatus = (() => {
    if (hasRuns) {
      return closedRuns > 0 ? "ok" : "attention";
    }
    return "neutral";
  })();

  const monthLabel = formatReportingMonthLabel(reportingMonth);

  const statusChartConfig = {
    value: { label: "Runs" },
    open: { label: "Open", color: "var(--foreground)" },
    sealed: { label: "Sealed", color: "var(--secondary-foreground)" },
    released: { label: "Released", color: "var(--primary)" },
  } satisfies ChartConfig;

  const statusChartData = [
    { key: "open", value: openRuns, fill: "var(--color-open)" },
    { key: "sealed", value: buckets.sealed, fill: "var(--color-sealed)" },
    { key: "released", value: buckets.released, fill: "var(--color-released)" },
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
        description={`Payroll analytics for ${monthLabel} — ${String(companies.length)} ${companies.length === 1 ? "company" : "companies"} in group`}
        title="Dashboard"
      />

      {/* --- KPI Row --- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {loading ? (
          (["stat-a", "stat-b", "stat-c", "stat-d", "stat-e"] as const).map(
            (key) => (
              <Skeleton className="h-28 w-full rounded-xl" key={key} />
            )
          )
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
            <StatisticsWithStatus
              caption={`${String(companies.length)} ${companies.length === 1 ? "entity" : "entities"}`}
              icon={<Building2Icon />}
              status={companies.length > 0 ? "ok" : "neutral"}
              title="Companies"
              value={String(companies.length)}
            />
          </>
        )}
      </div>

      {/* --- Charts + Workforce Section --- */}
      <div className="grid gap-6 lg:grid-cols-3">
        {loading ? (
          <>
            <Skeleton className="h-80 w-full rounded-xl lg:col-span-2" />
            <Skeleton className="h-80 w-full rounded-xl" />
          </>
        ) : (
          <>
            <div className="lg:col-span-2">
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
                title="Pay-run lifecycle"
                totalCaption="Visible in scope"
                totalValue={String(visibleRuns.length)}
              />
            </div>

            <WorkforceCard
              employees={visibleEmployees}
              scopeLabel={
                scope.mode === "all" ? "All companies" : "Filtered scope"
              }
            />
          </>
        )}
      </div>

      {/* --- Category Bars --- */}
      <div className="grid gap-4 sm:grid-cols-2">
        {loading ? (
          <>
            <Skeleton className="h-36 w-full rounded-xl" />
            <Skeleton className="h-36 w-full rounded-xl" />
          </>
        ) : (
          <>
            <StatisticsCategoryCard
              period={monthLabel}
              segments={[
                { label: "Open", value: openRuns, color: "bg-chart-1" },
                { label: "Sealed", value: buckets.sealed, color: "bg-chart-2" },
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
                { label: "Draft", value: buckets.draft, color: "bg-chart-1" },
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
          </>
        )}
      </div>

      {/* --- Activity Feed --- */}
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
