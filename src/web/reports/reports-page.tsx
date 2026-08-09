/**
 * @feature reports
 * @layer ui
 * @hub src/server/routes/pay-run-reports.ts
 *
 * Reports portal — URL-driven state: /reports?type=<type>&runId=<id>
 * Report types: payment-register | statutory-summary | exception-report | annual-remuneration
 * Studio: vertical icon tabs (tabs-22 DNA) + empty-state-01.
 */

import {
  AlertTriangleIcon,
  BarChart2Icon,
  CalendarIcon,
  FileTextIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import EmptyState01 from "@/components/shadcn-studio/blocks/empty-state-01/empty-state-01";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  description: string;
  icon: ReactNode;
}> = [
  {
    id: "payment-register",
    label: "Payment Register",
    description: "Net pay per employee for one run, as paid.",
    icon: <BarChart2Icon />,
  },
  {
    id: "statutory-summary",
    label: "Statutory Summary",
    description: "EPF, SOCSO, EIS and PCB totals for one run.",
    icon: <FileTextIcon />,
  },
  {
    id: "exception-report",
    label: "Exception Report",
    description: "Lines that need a human decision before close.",
    icon: <AlertTriangleIcon />,
  },
  {
    id: "annual-remuneration",
    label: "Annual Remuneration Summary",
    description: "Year-to-date remuneration for one employee.",
    icon: <CalendarIcon />,
  },
];

function getParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key);
}

function isReportType(value: string | null): value is ReportType {
  return (
    value === "payment-register" ||
    value === "statutory-summary" ||
    value === "exception-report" ||
    value === "annual-remuneration"
  );
}

function ReportsPage() {
  const { scope } = useScopeContext();
  const { me } = useAuthContext();
  const initialType = getParam("type");
  const [activeType, setActiveType] = useState<ReportType>(
    isReportType(initialType) ? initialType : "payment-register"
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

  const onTabChange = useCallback((value: string | number | null) => {
    if (typeof value !== "string" || !isReportType(value)) {
      return;
    }
    setActiveType(value);
    setData(null);
  }, []);

  const onEmpChange = useCallback((value: string | null) => {
    setSelectedEmpId(value ?? "");
  }, []);

  const onRunChange = useCallback((value: string | null) => {
    setSelectedRunId(value ?? "");
  }, []);

  const onYearChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSelectedYear(Number(event.currentTarget.value));
  }, []);

  const activeReport = REPORT_TYPES.find((rt) => rt.id === activeType);
  const activeLabel = activeReport?.label ?? "Report";
  const activeDescription = activeReport?.description ?? "";

  return (
    <div className="space-y-6">
      <PageTitle
        description="Payment, statutory, exception, and annual remuneration reports."
        title="Reports"
      />

      <Tabs
        className="min-h-[28rem] overflow-hidden rounded-xl border bg-card"
        onValueChange={onTabChange}
        orientation="vertical"
        value={activeType}
      >
        <div className="w-56 shrink-0 space-y-1 border-r p-4">
          <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            Report type
          </p>
          <TabsList
            className="h-auto w-full flex-col bg-transparent p-0"
            variant="line"
          >
            {REPORT_TYPES.map((rt) => (
              <TabsTrigger
                className="w-full justify-start gap-2 px-3 py-2 data-active:bg-primary/10 data-active:text-primary"
                key={rt.id}
                value={rt.id}
              >
                {rt.icon}
                <span className="truncate">{rt.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-6">
          <TabsContent className="mt-0 space-y-4" value={activeType}>
            <header className="space-y-1">
              <h2 className="font-semibold text-lg tracking-tight">
                {activeLabel}
              </h2>
              <p className="text-muted-foreground text-sm">
                {activeDescription}
              </p>
            </header>
            <ReportFilters
              activeType={activeType}
              filteredEmps={filteredEmps}
              filteredRuns={filteredRuns}
              onEmpChange={onEmpChange}
              onLoad={load}
              onRunChange={onRunChange}
              onYearChange={onYearChange}
              selectedEmpId={selectedEmpId}
              selectedRunId={selectedRunId}
              selectedYear={selectedYear}
            />
            <ReportBody
              activeType={activeType}
              data={data}
              error={error}
              loading={loading}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

interface ReportFiltersProps {
  readonly activeType: ReportType;
  readonly filteredEmps: readonly EmployeeSummary[];
  readonly filteredRuns: readonly PayRunSummary[];
  readonly selectedEmpId: string;
  readonly selectedRunId: string;
  readonly selectedYear: number;
  readonly onEmpChange: (value: string | null) => void;
  readonly onRunChange: (value: string | null) => void;
  readonly onYearChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onLoad: () => void;
}

function ReportFilters({
  activeType,
  filteredEmps,
  filteredRuns,
  selectedEmpId,
  selectedRunId,
  selectedYear,
  onEmpChange,
  onRunChange,
  onYearChange,
  onLoad,
}: ReportFiltersProps) {
  if (activeType === "annual-remuneration") {
    return (
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="emp-picker">Employee</Label>
          <Select
            onValueChange={onEmpChange}
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
            onChange={onYearChange}
            type="number"
            value={selectedYear}
          />
        </div>
        <Button onClick={onLoad} type="button">
          Load
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="run-picker">Pay Run</Label>
        <Select
          onValueChange={onRunChange}
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
      <Button onClick={onLoad} type="button">
        Load
      </Button>
    </div>
  );
}

interface ReportBodyProps {
  readonly activeType: ReportType;
  readonly data:
    | PaymentRegisterDto
    | StatutorySummaryDto
    | ExceptionReportDto
    | AnnualRemunerationSummaryDto
    | null;
  readonly loading: boolean;
  readonly error: string | null;
}

function ReportBody({ activeType, data, loading, error }: ReportBodyProps) {
  if (loading) {
    // Skeletons rather than a bare "Loading…" so the panel keeps its shape and
    // matches the loading language used on every other page.
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64 rounded-lg" />
        {(["row-a", "row-b", "row-c", "row-d", "row-e"] as const).map((key) => (
          <Skeleton className="h-10 w-full rounded-lg" key={key} />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {error}
      </p>
    );
  }
  if (data && activeType === "payment-register") {
    return <PaymentRegister data={data as PaymentRegisterDto} />;
  }
  if (data && activeType === "statutory-summary") {
    return <StatutorySummary data={data as StatutorySummaryDto} />;
  }
  if (data && activeType === "exception-report") {
    return <ExceptionReport data={data as ExceptionReportDto} />;
  }
  if (data && activeType === "annual-remuneration") {
    return (
      <AnnualRemunerationSummary data={data as AnnualRemunerationSummaryDto} />
    );
  }

  const label =
    REPORT_TYPES.find((rt) => rt.id === activeType)?.label ?? "Report";

  return (
    <EmptyState01
      className="max-w-none"
      description={label}
      emptyDetail={
        activeType === "annual-remuneration"
          ? "Select an employee and year, then click Load."
          : "Select a pay run and click Load to generate a report."
      }
      emptyTitle="No report loaded"
      icon={<FileTextIcon className="mx-auto size-12 text-muted-foreground" />}
      title="—"
    />
  );
}

export { ReportsPage };
