/**
 * @feature pay-run
 * @layer ui
 * @hub src/server/routes/pay-run.ts
 *
 * Pay-run list — `GET /v1/pay-runs`, scoped by `ScopeContext`.
 * Mutations: `createPayRun`.
 * Studio: datatable-pay-run + empty-state-01 + form-layout dialog.
 */

import {
  CheckCircle2Icon,
  ClockIcon,
  PlusIcon,
  ReceiptTextIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "wouter";
import PayRunDatatable from "@/components/shadcn-studio/blocks/datatable-pay-run";
import EmptyState01 from "@/components/shadcn-studio/blocks/empty-state-01/empty-state-01";
import StatisticsWithStatus, {
  type StatisticStatus,
} from "@/components/shadcn-studio/blocks/statistics-with-status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { countClosed, countOpen, deriveBuckets } from "@/lib/pay-run-status";
import { formatApiError } from "@/web/api/format-error";
import type { PayRunSummary } from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";
import { useAuthContext } from "@/web/context/auth-context";
import { useScopeContext } from "@/web/context/scope-context";
import { PageTitle } from "@/web/shell/page-title";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function PayRunListPage() {
  const [, navigate] = useLocation();
  const { me } = useAuthContext();
  const { scope, reportingMonth } = useScopeContext();
  const [runs, setRuns] = useState<PayRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [companyId, setCompanyId] = useState("");
  const [year, setYear] = useState(() =>
    Number.parseInt(reportingMonth.slice(0, 4), 10)
  );
  const [month, setMonth] = useState(() =>
    Number.parseInt(reportingMonth.slice(5, 7), 10)
  );
  const [workingDays, setWorkingDays] = useState(22);

  const companies = me?.companies ?? [];

  const reload = useCallback(async () => {
    const result = await payrollApi.getPayRuns({ reportingMonth });
    setRuns(result);
    setError(null);
  }, [reportingMonth]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reload()
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(formatApiError(cause, "Failed to load pay runs"));
          setRuns([]);
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
  }, [reload]);

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

  const openCreate = useCallback(() => {
    const y = Number.parseInt(reportingMonth.slice(0, 4), 10);
    const m = Number.parseInt(reportingMonth.slice(5, 7), 10);
    setYear(Number.isFinite(y) ? y : new Date().getFullYear());
    setMonth(Number.isFinite(m) ? m : new Date().getMonth() + 1);
    setWorkingDays(22);
    const preferred =
      scope.mode === "selected" && scope.companyIds.length === 1
        ? (scope.companyIds[0] ?? "")
        : (companies[0]?.id ?? "");
    setCompanyId(preferred);
    setCreateOpen(true);
  }, [companies, reportingMonth, scope]);

  const onYear = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setYear(Number.parseInt(e.currentTarget.value, 10) || 0);
  }, []);
  const onMonth = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setMonth(Number.parseInt(e.currentTarget.value, 10) || 0);
  }, []);
  const onWorkingDays = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setWorkingDays(Number.parseInt(e.currentTarget.value, 10) || 0);
  }, []);

  const submitCreate = useCallback(async () => {
    if (companyId === "" || year < 2000 || month < 1 || month > 12) {
      return;
    }
    const last = daysInMonth(year, month);
    const periodStart = `${year}-${pad2(month)}-01`;
    const periodEnd = `${year}-${pad2(month)}-${pad2(last)}`;
    setBusy(true);
    setError(null);
    try {
      const envelope = await payrollApi.createPayRun({
        runId: crypto.randomUUID(),
        companyId,
        year,
        month,
        periodStart,
        periodEnd,
        workingDays,
      });
      setCreateOpen(false);
      navigate(`/pay-runs/${envelope.run.id}`);
    } catch (cause) {
      setError(formatApiError(cause, "Create pay run failed"));
    } finally {
      setBusy(false);
    }
  }, [companyId, month, navigate, workingDays, year]);

  const buckets = useMemo(() => deriveBuckets(visibleRuns), [visibleRuns]);
  const openRuns = countOpen(buckets);
  const closedRuns = countClosed(buckets);
  const hasRuns = visibleRuns.length > 0;
  const closedShare = hasRuns
    ? Math.round((closedRuns / visibleRuns.length) * 100)
    : 0;

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
        actions={
          <Button
            disabled={companies.length === 0}
            onClick={openCreate}
            type="button"
          >
            <PlusIcon className="size-4" />
            Create pay run
          </Button>
        }
        description="Lifecycle directory for the current scope and reporting month."
        title="Pay Runs"
      />

      {error === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

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

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create pay run</DialogTitle>
            <DialogDescription>
              Opens a DRAFT run for the company and calendar month. Statutory
              rule pack resolves from the period end date.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>Company</Label>
              <Select
                onValueChange={(v) => setCompanyId(v ?? "")}
                value={companyId === "" ? null : companyId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-year">Year</Label>
              <Input
                id="create-year"
                max={2999}
                min={2000}
                onChange={onYear}
                type="number"
                value={Number.isFinite(year) ? year : ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-month">Month</Label>
              <Input
                id="create-month"
                max={12}
                min={1}
                onChange={onMonth}
                type="number"
                value={Number.isFinite(month) ? month : ""}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="create-wd">Working days</Label>
              <Input
                id="create-wd"
                min={1}
                onChange={onWorkingDays}
                type="number"
                value={Number.isFinite(workingDays) ? workingDays : ""}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={() => setCreateOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                busy ||
                companyId === "" ||
                year < 2000 ||
                month < 1 ||
                month > 12 ||
                workingDays < 1
              }
              onClick={submitCreate}
              type="button"
            >
              {busy ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { PayRunListPage };
