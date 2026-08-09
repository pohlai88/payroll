/**
 * Reports portal — URL-driven state: /reports?type=<type>&runId=<id>
 * Report types: payment-register | statutory-summary | exception-report | annual-remuneration
 */

import {
  AlertTriangleIcon,
  BarChart2Icon,
  CalendarIcon,
  FileTextIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatApiError } from "@/web/api/format-error";
import {
  type AnnualRemunerationSummaryDto,
  type EmployeeSummary,
  type ExceptionReportDto,
  type PaymentRegisterDto,
  type PayRunSummary,
  payrollApi,
  type StatutorySummaryDto,
} from "@/web/api/payroll-api";
import { useAuthContext } from "@/web/context/auth-context";
import { useScopeContext } from "@/web/context/scope-context";
import { PageTitle } from "@/web/shell/page-title";
import { AnnualRemunerationSummary } from "./annual-remuneration-summary";
import { ExceptionReport } from "./exception-report";
import { PaymentRegister } from "./payment-register";
import { StatutorySummary } from "./statutory-summary";

type ReportType =
  | "payment-register"
  | "statutory-summary"
  | "exception-report"
  | "annual-remuneration";

const REPORT_TYPES: Array<{
  id: ReportType;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    id: "payment-register",
    label: "Payment Register",
    icon: <BarChart2Icon className="size-4" />,
  },
  {
    id: "statutory-summary",
    label: "Statutory Summary",
    icon: <FileTextIcon className="size-4" />,
  },
  {
    id: "exception-report",
    label: "Exception Report",
    icon: <AlertTriangleIcon className="size-4" />,
  },
  {
    id: "annual-remuneration",
    label: "Annual Remuneration Summary",
    icon: <CalendarIcon className="size-4" />,
  },
];

function getParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key);
}

function ReportsPage() {
  const { scope } = useScopeContext();
  const { me } = useAuthContext();
  const [activeType, setActiveType] = useState<ReportType>(
    (getParam("type") as ReportType | null) ?? "payment-register"
  );
  const [selectedRunId, setSelectedRunId] = useState<string>(
    getParam("runId") ?? ""
  );
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [runs, setRuns] = useState<PayRunSummary[]>([]);
  const [emps, setEmps] = useState<EmployeeSummary[]>([]);
  const [data, setData] = useState<
    | PaymentRegisterDto
    | StatutorySummaryDto
    | ExceptionReportDto
    | AnnualRemunerationSummaryDto
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const singleCompanyId = useMemo(
    () =>
      scope.mode === "selected" && scope.companyIds.length === 1
        ? scope.companyIds[0]
        : undefined,
    [scope]
  );

  const selectedCompanyIds = useMemo(() => {
    if (scope.mode === "all") {
      return new Set(me?.companies?.map((c) => c.id) ?? []);
    }
    return new Set(scope.companyIds);
  }, [scope, me]);

  const filteredRuns = useMemo(
    () => runs.filter((run) => selectedCompanyIds.has(run.companyId)),
    [runs, selectedCompanyIds]
  );

  const filteredEmps = useMemo(
    () => emps.filter((emp) => selectedCompanyIds.has(emp.companyId)),
    [emps, selectedCompanyIds]
  );

  useEffect(() => {
    payrollApi
      .getPayRuns({ companyId: singleCompanyId })
      .then((result) => {
        setRuns(result);
      })
      .catch(() => undefined);

    payrollApi
      .getEmployees({ companyId: singleCompanyId })
      .then((result) => {
        setEmps(result);
      })
      .catch(() => undefined);
  }, [singleCompanyId]);

  const loadAnnualReport = useCallback(async () => {
    if (!selectedEmpId) {
      return;
    }
    return await payrollApi.getAnnualRemunerationSummary(
      selectedEmpId,
      selectedYear
    );
  }, [selectedEmpId, selectedYear]);

  const loadRunReport = useCallback(async () => {
    if (!selectedRunId) {
      return;
    }
    if (activeType === "payment-register") {
      return await payrollApi.getPaymentRegister(selectedRunId);
    }
    if (activeType === "statutory-summary") {
      return await payrollApi.getStatutorySummary(selectedRunId);
    }
    if (activeType === "exception-report") {
      return await payrollApi.getExceptionReport(selectedRunId);
    }
  }, [activeType, selectedRunId]);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    setLoading(true);
    try {
      let result:
        | PaymentRegisterDto
        | StatutorySummaryDto
        | ExceptionReportDto
        | AnnualRemunerationSummaryDto
        | undefined;
      if (activeType === "annual-remuneration") {
        result = await loadAnnualReport();
      } else {
        result = await loadRunReport();
      }
      if (result) {
        setData(result);
      }
    } catch (e) {
      setError(formatApiError(e, "Failed to load report"));
    } finally {
      setLoading(false);
    }
  }, [activeType, loadAnnualReport, loadRunReport]);

  return (
    <div className="space-y-6">
      <PageTitle
        description="Payment, statutory, exception, and annual remuneration reports."
        title="Reports"
      />

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
        <nav className="w-56 shrink-0 space-y-1 border-r p-4">
          <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            Report type
          </p>
          {REPORT_TYPES.map((rt) => (
            <Button
              className={cn(
                "h-auto w-full justify-start gap-2 px-3 py-2 text-left font-normal",
                activeType === rt.id
                  ? "bg-primary/10 font-medium text-primary hover:bg-primary/10 hover:text-primary"
                  : "text-foreground"
              )}
              key={rt.id}
              onClick={() => {
                setActiveType(rt.id);
                setData(null);
              }}
              type="button"
              variant="ghost"
            >
              {rt.icon}
              <span className="truncate">{rt.label}</span>
            </Button>
          ))}
        </nav>

        <main className="flex-1 space-y-4 overflow-auto p-6">
          <div className="flex flex-wrap items-end gap-3">
            {activeType === "annual-remuneration" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="emp-picker">Employee</Label>
                  <Select
                    onValueChange={(value) => setSelectedEmpId(value ?? "")}
                    value={selectedEmpId === "" ? null : selectedEmpId}
                  >
                    <SelectTrigger className="min-w-56" id="emp-picker">
                      <SelectValue placeholder="— select employee —" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredEmps.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name} ({e.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="year-picker">Year</Label>
                  <Input
                    className="w-24"
                    id="year-picker"
                    max={new Date().getFullYear() + 1}
                    min={2020}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    type="number"
                    value={selectedYear}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="run-picker">Pay Run</Label>
                <Select
                  onValueChange={(value) => setSelectedRunId(value ?? "")}
                  value={selectedRunId === "" ? null : selectedRunId}
                >
                  <SelectTrigger className="min-w-56" id="run-picker">
                    <SelectValue placeholder="— select run —" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredRuns.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label} ({r.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={load} type="button">
              Load
            </Button>
          </div>

          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {data && activeType === "payment-register" ? (
            <PaymentRegister data={data as PaymentRegisterDto} />
          ) : null}
          {data && activeType === "statutory-summary" ? (
            <StatutorySummary data={data as StatutorySummaryDto} />
          ) : null}
          {data && activeType === "exception-report" ? (
            <ExceptionReport data={data as ExceptionReportDto} />
          ) : null}
          {data && activeType === "annual-remuneration" ? (
            <AnnualRemunerationSummary
              data={data as AnnualRemunerationSummaryDto}
            />
          ) : null}
          {data || loading || error ? null : (
            <p className="text-muted-foreground text-sm">
              Select a run and click Load to generate a report.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

export { ReportsPage };
