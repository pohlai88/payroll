/**
 * Employee slide-over — right-side sheet with Line / Payslip Preview /
 * Derivation tabs, opened from `EmployeeGrid.onSelectEmployee`. Renders the
 * workspace's `EmployeeLineDto` verbatim: every money figure comes from
 * `MoneyCell` reading `roots[key]`, nothing is summed or recalculated
 * client-side. PCB is read-only — no inline edit, no blur-to-save.
 */

import { useCallback } from "react";
import { DeltaBadge } from "@/components/payroll/delta-badge";
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Section } from "@/components/payroll/section-header";
import type { RunStatus } from "@/components/payroll/status-badge";
import { StatusBadge } from "@/components/payroll/status-badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EmployeeLineDto } from "@/web/api/payroll-api";
import { DerivationDrawer } from "./derivation-drawer";
import { EmployeeDiff } from "./employee-diff";
import { PayslipPreview } from "./payslip-preview";

interface EmployeeSlideOverProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly line: EmployeeLineDto | null;
  readonly runId: string;
  readonly runStatus: RunStatus;
  readonly initialTab?: "line" | "payslip" | "derivation";
}

interface LineRow {
  readonly key: string;
  readonly label: string;
  readonly readOnly?: boolean;
}

interface LineGroup {
  readonly section: Section;
  readonly label: string;
  readonly rows: readonly LineRow[];
}

/**
 * Mirrors `EmployeeGrid`'s `SECTION_GROUPS` (see `employee-grid.tsx`) so the
 * slide-over shows the same root keys as the grid columns. Wage-base roots
 * (`epfWages`, `socsoWages`, `eisWages`) are intermediate figures surfaced
 * only in the Derivation tab.
 */
const LINE_GROUPS: readonly LineGroup[] = [
  {
    section: "earning",
    label: "Earning",
    rows: [{ key: "gross", label: "Gross Pay" }],
  },
  {
    section: "deduction",
    label: "Deduction",
    rows: [
      { key: "epfEe", label: "EPF (Employee)" },
      { key: "socsoEeCore", label: "SOCSO (Employee)" },
      { key: "socsoEeSkbbk", label: "SKBBK" },
      { key: "eisEe", label: "EIS (Employee)" },
      { key: "pcbNet", label: "PCB", readOnly: true },
      { key: "cp38", label: "CP38" },
      { key: "zakat", label: "Zakat" },
      { key: "otherDeductions", label: "Other Deductions" },
      { key: "deductionsTotal", label: "Total Deductions" },
    ],
  },
  {
    section: "employer",
    label: "Employer",
    rows: [
      { key: "epfEr", label: "EPF (Employer)" },
      { key: "socsoEr", label: "SOCSO (Employer)" },
      { key: "eisEr", label: "EIS (Employer)" },
      { key: "hrdf", label: "HRDF" },
      { key: "employerCost", label: "Employer Cost" },
    ],
  },
  {
    section: "summary",
    label: "Net Pay",
    rows: [{ key: "net", label: "Net Pay" }],
  },
];

function EmployeeSlideOver({
  open,
  onClose,
  line,
  runId,
  runStatus,
  initialTab = "line",
}: EmployeeSlideOverProps) {
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onClose();
      }
    },
    [onClose]
  );
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (!line) {
    return null;
  }

  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-2xl"
        side="right"
      >
        <SheetHeader className="pb-3">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-muted-foreground text-xs">
              {line.employeeCode}
            </span>
            <span>{line.employeeName}</span>
            <StatusBadge status={runStatus} />
          </SheetTitle>
        </SheetHeader>
        <Separator className="mb-4" />

        <Tabs defaultValue={initialTab}>
          <TabsList>
            <TabsTrigger value="line">Line</TabsTrigger>
            <TabsTrigger value="payslip">Payslip Preview</TabsTrigger>
            <TabsTrigger value="derivation">Derivation</TabsTrigger>
            {line.previousRoots !== null && (
              <TabsTrigger value="diff">Diff</TabsTrigger>
            )}
          </TabsList>

          <TabsContent className="mt-4" value="line">
            <LineTab line={line} />
          </TabsContent>

          <TabsContent className="mt-4" value="payslip">
            <PayslipPreview line={line} onPrint={handlePrint} />
            <div className="flex justify-end px-4 pt-2 pb-1">
              <a
                className="text-muted-foreground text-xs underline-offset-2 hover:underline"
                href={`/pay-runs/${runId}/payslip/${line.lineId}`}
              >
                Open full payslip →
              </a>
            </div>
          </TabsContent>

          <TabsContent className="mt-4" value="derivation">
            <DerivationDrawer lineId={line.lineId} roots={line.roots} />
          </TabsContent>

          {line.previousRoots !== null && (
            <TabsContent className="mt-4" value="diff">
              <EmployeeDiff lineId={line.lineId} runId={runId} />
            </TabsContent>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

interface LineTabProps {
  readonly line: EmployeeLineDto;
}

function LineTab({ line }: LineTabProps) {
  const changedRootKeys = line.variance?.changedRootKeys ?? [];

  return (
    <div className="flex flex-col gap-6">
      {LINE_GROUPS.map((group) => (
        <div key={group.section}>
          <div
            className="rounded-t px-3 py-1.5 font-semibold text-xs uppercase tracking-wider"
            style={{
              background: `var(--section-${group.section}-fill)`,
              color: `var(--section-${group.section}-ink)`,
            }}
          >
            {group.label}
          </div>
          <div className="divide-y divide-border rounded-b border border-t-0">
            <div className="grid grid-cols-3 px-3 py-1.5 font-medium text-muted-foreground text-xs">
              <span>Field</span>
              <span className="text-right">Current</span>
              <span className="text-right">Previous</span>
            </div>
            {group.rows.map(({ key, label, readOnly }) => {
              const current = line.roots[key];
              const previous = line.previousRoots?.[key] ?? null;
              const isChanged = changedRootKeys.includes(key);
              const variance = line.rootVariances?.[key] ?? null;
              return (
                <div
                  className="grid grid-cols-3 items-center px-3 py-2 text-sm"
                  key={key}
                >
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {label}
                    {readOnly === true && (
                      <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground/80">
                        Calculated
                      </span>
                    )}
                  </span>
                  <MoneyCell
                    className="text-foreground"
                    notApplicable={current?.notApplicable ?? false}
                    sen={current?.sen ?? null}
                  />
                  <div className="flex items-center justify-end gap-1">
                    <MoneyCell
                      className="text-muted-foreground"
                      notApplicable={previous?.notApplicable ?? false}
                      sen={previous?.sen ?? null}
                    />
                    {isChanged && variance !== null && (
                      <DeltaBadge variance={variance} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export type { EmployeeSlideOverProps };
export { EmployeeSlideOver };
