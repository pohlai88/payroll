/**
 * @feature pay-run
 * @layer ui
 * @hub src/server/routes/pay-run.ts
 *
 * Pay-run list — `GET /v1/pay-runs`, scoped by `ScopeContext`.
 * Studio: datatable-pay-run + empty-state-01.
 */

import { CheckCircle2Icon, ClockIcon, ReceiptTextIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import PayRunDatatable from "@/components/shadcn-studio/blocks/datatable-pay-run";
import EmptyState01 from "@/components/shadcn-studio/blocks/empty-state-01/empty-state-01";
import StatisticsWithStatus, {
  type StatisticStatus,
} from "@/components/shadcn-studio/blocks/statistics-with-status";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { countClosed, countOpen, deriveBuckets } from "@/lib/pay-run-status";
import type { PayRunSummary } from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";
import { useScopeContext } from "@/web/context/scope-context";
import { PageTitle } from "@/web/shell/page-title";

function PayRunListPage() {
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

  const visibleRuns =
    scope.mode === "all"
      ? runs
      : runs.filter((run) => scope.companyIds.includes(run.companyId));

  const openRun = useCallback(
    (runId: string) => {
      navigate(`/pay-runs/${runId}`);
    },
    [navigate]
  );

  const buckets = useMemo(() => deriveBuckets(visibleRuns), [visibleRuns]);
  const openRuns = countOpen(buckets);
  const closedRuns = countClosed(buckets);
  const hasRuns = visibleRuns.length > 0;
  const closedShare = hasRuns
    ? Math.round((closedRuns / visibleRuns.length) * 100)
    : 0;

  // Empty scope reads neutral, never "on track" — nothing has been proven closed.
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

  return (
    <div className="space-y-6">
      <PageTitle
        description="Runs for the current scope and reporting month."
        title="Pay Runs"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {loading ? (
          (["run-a", "run-b", "run-c"] as const).map((key) => (
            <Skeleton className="h-28 w-full rounded-xl" key={key} />
          ))
        ) : (
          <>
            <StatisticsWithStatus
              caption={hasRuns ? "In current scope" : "Nothing in scope"}
              icon={<ReceiptTextIcon />}
              status={hasRuns ? "pending" : "neutral"}
              title="Total runs"
              value={String(visibleRuns.length)}
            />
            <StatisticsWithStatus
              caption={
                hasRuns ? `${String(openRuns)} awaiting close` : "No runs yet"
              }
              icon={<ClockIcon />}
              status={openRunsStatus}
              title="Open"
              value={String(openRuns)}
            />
            <StatisticsWithStatus
              caption={
                hasRuns ? `${String(closedShare)}% closed` : "No runs yet"
              }
              icon={<CheckCircle2Icon />}
              status={closedRunsStatus}
              title="Sealed / released"
              value={String(closedRuns)}
            />
          </>
        )}
      </div>

      {!loading && visibleRuns.length === 0 ? (
        <EmptyState01
          className="max-w-none"
          description="Pay runs this month"
          emptyDetail="No pay runs found for the current scope and reporting month."
          emptyTitle="No pay runs"
          icon={
            <ReceiptTextIcon className="mx-auto size-12 text-muted-foreground" />
          }
          title="0"
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <PayRunDatatable
            data={visibleRuns}
            loading={loading}
            onOpen={openRun}
            title="Directory"
          />
        </Card>
      )}
    </div>
  );
}

export { PayRunListPage };
