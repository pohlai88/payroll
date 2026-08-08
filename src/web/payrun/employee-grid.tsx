/**
 * Employee grid — the workspace's paginated `EmployeeLineDto[]` table.
 * Column groups mirror the engine's named sen roots (`src/domain/calc/types.ts`
 * `LineResult`, surfaced by `src/repo/workspace.ts` as `roots`): Earning,
 * Deduction, Employer, Net Pay. Every money figure comes from `MoneyCell`
 * reading `roots[key]` — nothing is summed or reformatted client-side, and
 * row/cell highlighting reads the server's `variance` verbatim.
 */

import {
  AlertCircleIcon,
  EyeIcon,
  GitBranchIcon,
  MoreHorizontalIcon,
  PencilIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { DeltaBadge } from "@/components/payroll/delta-badge";
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Section } from "@/components/payroll/section-header";
import { SectionHeader } from "@/components/payroll/section-header";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { EmployeeLineDto } from "@/web/api/payroll-api";

interface EmployeeGridProps {
  readonly lines: readonly EmployeeLineDto[];
  readonly onSelectEmployee: (employeeId: string) => void;
  readonly onEditLine?: (employeeId: string) => void;
  readonly onViewDerivation?: (employeeId: string) => void;
  readonly onViewFindings?: (employeeId: string) => void;
}

interface RootColumn {
  readonly key: string;
  readonly label: string;
}

const PAGE_SIZE = 25;

/**
 * Root key → column mapping, grouped by the same four sections the totals
 * strip and slide-over use. Only the 19 named roots from `ROOT_KEYS` in
 * `src/repo/workspace.ts` are addressable here — the engine does not expose
 * a per-earning-item breakdown (basic/OT/allowance) on the workspace DTO, so
 * Earning collapses to the single `gross` root. Wage-base roots (`epfWages`,
 * `socsoWages`, `eisWages`) are intermediate figures surfaced in the
 * derivation view, not the grid.
 */
const EARNING_COLS: readonly RootColumn[] = [{ key: "gross", label: "Gross" }];

const DEDUCTION_COLS: readonly RootColumn[] = [
  { key: "epfEe", label: "EPF" },
  { key: "socsoEeCore", label: "SOCSO" },
  { key: "socsoEeSkbbk", label: "SKBBK" },
  { key: "eisEe", label: "EIS" },
  { key: "pcbNet", label: "PCB" },
  { key: "cp38", label: "CP38" },
  { key: "zakat", label: "Zakat" },
  { key: "otherDeductions", label: "Other" },
  { key: "deductionsTotal", label: "Total" },
];

const EMPLOYER_COLS: readonly RootColumn[] = [
  { key: "epfEr", label: "Co.EPF" },
  { key: "socsoEr", label: "Co.SOCSO" },
  { key: "eisEr", label: "Co.EIS" },
  { key: "hrdf", label: "HRDF" },
  { key: "employerCost", label: "Cost" },
];

const SUMMARY_COLS: readonly RootColumn[] = [{ key: "net", label: "Net" }];

const ALL_COLS: readonly RootColumn[] = [
  ...EARNING_COLS,
  ...DEDUCTION_COLS,
  ...EMPLOYER_COLS,
  ...SUMMARY_COLS,
];

const SECTION_GROUPS: readonly {
  readonly section: Section;
  readonly label: string;
  readonly cols: readonly RootColumn[];
}[] = [
  { section: "earning", label: "Earning", cols: EARNING_COLS },
  { section: "deduction", label: "Deduction", cols: DEDUCTION_COLS },
  { section: "employer", label: "Employer", cols: EMPLOYER_COLS },
  { section: "summary", label: "Net Pay", cols: SUMMARY_COLS },
];

function EmployeeGrid({
  lines,
  onSelectEmployee,
  onEditLine,
  onViewDerivation,
  onViewFindings,
}: EmployeeGridProps) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(lines.length / PAGE_SIZE));
  const pageLines = lines.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const goToPreviousPage = useCallback(() => {
    setPage((p) => Math.max(0, p - 1));
  }, []);
  const goToNextPage = useCallback(() => {
    setPage((p) => Math.min(totalPages - 1, p + 1));
  }, [totalPages]);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="sticky left-0 z-10 min-w-48 bg-muted"
                rowSpan={2}
              >
                Employee
              </TableHead>
              {SECTION_GROUPS.map((group) => (
                <SectionHeader
                  colSpan={group.cols.length}
                  key={group.section}
                  section={group.section}
                >
                  {group.label}
                </SectionHeader>
              ))}
              <TableHead className="w-10 bg-muted" rowSpan={2} />
            </TableRow>
            <TableRow>
              {ALL_COLS.map((col) => (
                <TableHead
                  className="text-right font-normal text-muted-foreground text-xs"
                  key={col.key}
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageLines.map((line) => (
              <EmployeeRow
                key={line.employeeId}
                line={line}
                onEditLine={onEditLine}
                onSelectEmployee={onSelectEmployee}
                onViewDerivation={onViewDerivation}
                onViewFindings={onViewFindings}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          Showing {lines.length === 0 ? 0 : page * PAGE_SIZE + 1}–
          {Math.min((page + 1) * PAGE_SIZE, lines.length)} of {lines.length}{" "}
          employees
        </p>
        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  aria-disabled={page === 0}
                  onClick={goToPreviousPage}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  aria-disabled={page >= totalPages - 1}
                  onClick={goToNextPage}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
  );
}

interface EmployeeRowProps {
  readonly line: EmployeeLineDto;
  readonly onSelectEmployee: (employeeId: string) => void;
  readonly onEditLine?: (employeeId: string) => void;
  readonly onViewDerivation?: (employeeId: string) => void;
  readonly onViewFindings?: (employeeId: string) => void;
}

function EmployeeRow({
  line,
  onSelectEmployee,
  onEditLine,
  onViewDerivation,
  onViewFindings,
}: EmployeeRowProps) {
  const { employeeId } = line;
  const hasChanges = line.variance?.hasChanges ?? false;
  const changedRootKeys = line.variance?.changedRootKeys ?? [];

  const handleRowClick = useCallback(() => {
    onSelectEmployee(employeeId);
  }, [onSelectEmployee, employeeId]);

  const stopPropagation = useCallback(
    (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
    },
    []
  );

  return (
    <TableRow
      className={cn("cursor-pointer", hasChanges && "bg-muted/30")}
      onClick={handleRowClick}
    >
      <TableCell className="sticky left-0 z-10 bg-background">
        <div className="flex items-center gap-2">
          <span className="font-mono text-muted-foreground text-xs">
            {line.employeeCode}
          </span>
          <span className="text-foreground text-sm">{line.employeeName}</span>
          {hasChanges && line.variance ? (
            <DeltaBadge
              variance={{
                previousSen: null,
                deltaSen: null,
                deltaBps: null,
                direction: line.variance.direction,
              }}
            />
          ) : null}
          {line.findingsCount > 0 ? (
            <Badge variant="outline">{line.findingsCount}</Badge>
          ) : null}
        </div>
      </TableCell>
      {ALL_COLS.map((col) => {
        const rootValue = line.roots[col.key];
        const isChangedCell = changedRootKeys.includes(col.key);
        return (
          <TableCell
            className={cn("text-right", isChangedCell && "bg-muted/60")}
            key={col.key}
          >
            <MoneyCell
              notApplicable={rootValue?.notApplicable ?? false}
              sen={rootValue?.sen ?? null}
            />
          </TableCell>
        );
      })}
      <TableCell onClick={stopPropagation}>
        <RowActionsMenu
          employeeId={employeeId}
          findingsCount={line.findingsCount}
          onEditLine={onEditLine}
          onSelectEmployee={onSelectEmployee}
          onViewDerivation={onViewDerivation}
          onViewFindings={onViewFindings}
        />
      </TableCell>
    </TableRow>
  );
}

interface RowActionsMenuProps {
  readonly employeeId: string;
  readonly findingsCount: number;
  readonly onSelectEmployee: (employeeId: string) => void;
  readonly onEditLine?: (employeeId: string) => void;
  readonly onViewDerivation?: (employeeId: string) => void;
  readonly onViewFindings?: (employeeId: string) => void;
}

function RowActionsMenu({
  employeeId,
  findingsCount,
  onSelectEmployee,
  onEditLine,
  onViewDerivation,
  onViewFindings,
}: RowActionsMenuProps) {
  const handleViewPayslip = useCallback(() => {
    onSelectEmployee(employeeId);
  }, [onSelectEmployee, employeeId]);
  const handleEditLine = useCallback(() => {
    (onEditLine ?? onSelectEmployee)(employeeId);
  }, [onEditLine, onSelectEmployee, employeeId]);
  const handleViewDerivation = useCallback(() => {
    (onViewDerivation ?? onSelectEmployee)(employeeId);
  }, [onViewDerivation, onSelectEmployee, employeeId]);
  const handleViewFindings = useCallback(() => {
    (onViewFindings ?? onSelectEmployee)(employeeId);
  }, [onViewFindings, onSelectEmployee, employeeId]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Row actions"
        className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleViewPayslip}>
          <EyeIcon className="mr-2 size-4" /> View payslip
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleEditLine}>
          <PencilIcon className="mr-2 size-4" /> Edit line
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleViewDerivation}>
          <GitBranchIcon className="mr-2 size-4" /> View derivation
        </DropdownMenuItem>
        {findingsCount > 0 ? (
          <DropdownMenuItem onClick={handleViewFindings}>
            <AlertCircleIcon className="mr-2 size-4" /> View findings
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type { EmployeeGridProps };
export { EmployeeGrid };
