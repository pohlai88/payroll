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
import { formatApiError } from "@/web/api/format-error";
import {
  type AnnualRemunerationSummaryDto,
  type EmployeeSummary,
  type ExceptionReportDto,
  fetchAnnualRemunerationSummary,
  fetchEmployees,
  fetchExceptionReport,
  fetchPaymentRegister,
  fetchPayRuns,
  fetchStatutorySummary,
  type PaymentRegisterDto,
  type PayRunSummary,
  type StatutorySummaryDto,
} from "@/web/api/payroll-api";
import { useAuthContext } from "@/web/context/auth-context";
import { useScopeContext } from "@/web/context/scope-context";
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
    icon: <BarChart2Icon className="h-4 w-4" />,
  },
  {
    id: "statutory-summary",
    label: "Statutory Summary",
    icon: <FileTextIcon className="h-4 w-4" />,
  },
  {
    id: "exception-report",
    label: "Exception Report",
    icon: <AlertTriangleIcon className="h-4 w-4" />,
  },
  {
    id: "annual-remuneration",
    label: "Annual Remuneration Summary",
    icon: <CalendarIcon className="h-4 w-4" />,
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

  // Following the same pattern as EmployeesPage - get a single company ID for API calls
  const singleCompanyId = useMemo(
    () =>
      scope.mode === "selected" && scope.companyIds.length === 1
        ? scope.companyIds[0]
        : undefined,
    [scope]
  );

  // Filter runs and employees to selected companies if we have multiple selected
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
    fetchPayRuns(singleCompanyId)
      .then((result) => {
        setRuns(result);
      })
      .catch(() => undefined);

    fetchEmployees(singleCompanyId)
      .then((result) => {
        setEmps(result);
      })
      .catch(() => undefined);
  }, [singleCompanyId]);

  const loadAnnualReport = useCallback(async () => {
    if (!selectedEmpId) {
      return;
    }
    return await fetchAnnualRemunerationSummary(selectedEmpId, selectedYear);
  }, [selectedEmpId, selectedYear]);

  const loadRunReport = useCallback(async () => {
    if (!selectedRunId) {
      return;
    }
    if (activeType === "payment-register") {
      return await fetchPaymentRegister(selectedRunId);
    }
    if (activeType === "statutory-summary") {
      return await fetchStatutorySummary(selectedRunId);
    }
    if (activeType === "exception-report") {
      return await fetchExceptionReport(selectedRunId);
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
    <div className="flex h-full">
      {/* Sidebar */}
      <nav className="w-56 shrink-0 space-y-1 border-r bg-card p-4">
        <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          Reports
        </p>
        {REPORT_TYPES.map((rt) => (
          <button
            className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors ${
              activeType === rt.id
                ? "bg-primary/10 font-medium text-primary"
                : "text-foreground hover:bg-muted"
            }`}
            key={rt.id}
            onClick={() => {
              setActiveType(rt.id);
              setData(null);
            }}
            type="button"
          >
            {rt.icon}
            {rt.label}
          </button>
        ))}
      </nav>

      {/* Main panel */}
      <main className="flex-1 space-y-4 overflow-auto p-6">
        {/* Controls */}
        <div className="flex items-end gap-3">
          {activeType !== "annual-remuneration" && (
            <div className="space-y-1">
              <label
                className="text-muted-foreground text-xs"
                htmlFor="run-picker"
              >
                Pay Run
              </label>
              <select
                className="rounded border px-2 py-1.5 text-sm"
                id="run-picker"
                onChange={(e) => setSelectedRunId(e.target.value)}
                value={selectedRunId}
              >
                <option value="">— select run —</option>
                {filteredRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.status})
                  </option>
                ))}
              </select>
            </div>
          )}
          {activeType === "annual-remuneration" && (
            <>
              <div className="space-y-1">
                <label
                  className="text-muted-foreground text-xs"
                  htmlFor="emp-picker"
                >
                  Employee
                </label>
                <select
                  className="rounded border px-2 py-1.5 text-sm"
                  id="emp-picker"
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  value={selectedEmpId}
                >
                  <option value="">— select employee —</option>
                  {filteredEmps.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label
                  className="text-muted-foreground text-xs"
                  htmlFor="year-picker"
                >
                  Year
                </label>
                <input
                  className="w-24 rounded border px-2 py-1.5 text-sm"
                  id="year-picker"
                  max={new Date().getFullYear() + 1}
                  min={2020}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  type="number"
                  value={selectedYear}
                />
              </div>
            </>
          )}
          <button
            className="rounded bg-primary px-4 py-1.5 font-medium text-primary-foreground text-sm"
            onClick={load}
            type="button"
          >
            Load
          </button>
        </div>

        {/* Report view */}
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : null}
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {data && activeType === "payment-register" && (
          <PaymentRegister data={data as PaymentRegisterDto} />
        )}
        {data && activeType === "statutory-summary" && (
          <StatutorySummary data={data as StatutorySummaryDto} />
        )}
        {data && activeType === "exception-report" && (
          <ExceptionReport data={data as ExceptionReportDto} />
        )}
        {data && activeType === "annual-remuneration" && (
          <AnnualRemunerationSummary
            data={data as AnnualRemunerationSummaryDto}
          />
        )}
        {!(data || loading || error) && (
          <p className="text-muted-foreground text-sm">
            Select a run and click Load to generate a report.
          </p>
        )}
      </main>
    </div>
  );
}

export { ReportsPage };
