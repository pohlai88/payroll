/**
 * @feature pay-run
 * @layer ui
 * @hub src/server/routes/pay-run.ts
 *
 * Pay-run list — `GET /v1/pay-runs`, scoped by `ScopeContext`.
 * Studio: datatable-pay-run + empty-state-01.
 */

import { ReceiptTextIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import PayRunDatatable from "@/components/shadcn-studio/blocks/datatable-pay-run";
import EmptyState01 from "@/components/shadcn-studio/blocks/empty-state-01/empty-state-01";
import { Card } from "@/components/ui/card";
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

  return (
    <div className="space-y-6">
      <PageTitle
        description="Runs for the current scope and reporting month."
        title="Pay Runs"
      />

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
