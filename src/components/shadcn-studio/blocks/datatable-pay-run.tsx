/**
 * Pay-run list datatable — adapted from shadcn-studio datatable DNA
 * (`datatable-component-01`) for Clarity pay-run summaries.
 * Presentational only; navigation stays in `pay-run-list.tsx`.
 */

import { ReceiptTextIcon } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useCallback } from "react";
import { isRunStatus, StatusBadge } from "@/components/payroll/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PayRunSummary } from "@/web/api/payroll-api";

interface PayRunDatatableProps {
  readonly data: readonly PayRunSummary[];
  readonly title?: string;
  readonly loading?: boolean;
  readonly onOpen: (runId: string) => void;
}

function formatPeriod(run: PayRunSummary): string {
  return `${String(run.month).padStart(2, "0")}/${run.year}`;
}

function PayRunRow({
  run,
  onOpen,
}: {
  run: PayRunSummary;
  onOpen: (runId: string) => void;
}) {
  const handleClick = useCallback(() => {
    onOpen(run.id);
  }, [onOpen, run.id]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen(run.id);
      }
    },
    [onOpen, run.id]
  );

  return (
    <TableRow
      className="cursor-pointer"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <TableCell className="font-medium first:pl-4">
        {run.companyName}
      </TableCell>
      <TableCell className="tabular-nums">{formatPeriod(run)}</TableCell>
      <TableCell>
        <StatusBadge status={isRunStatus(run.status) ? run.status : "DRAFT"} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {run.employeeCount}
      </TableCell>
    </TableRow>
  );
}

function PayRunDatatable({
  data,
  title = "Pay runs",
  loading = false,
  onOpen,
}: PayRunDatatableProps) {
  let body: ReactNode;
  if (loading) {
    body = (
      <TableRow>
        <TableCell
          className="h-24 text-center text-muted-foreground"
          colSpan={4}
        >
          Loading pay runs…
        </TableCell>
      </TableRow>
    );
  } else if (data.length === 0) {
    body = (
      <TableRow>
        <TableCell
          className="h-24 text-center text-muted-foreground"
          colSpan={4}
        >
          No results.
        </TableCell>
      </TableRow>
    );
  } else {
    body = data.map((run) => (
      <PayRunRow key={run.id} onOpen={onOpen} run={run} />
    ));
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 border-b px-6 py-4">
        <ReceiptTextIcon className="size-5 text-muted-foreground" />
        <span className="font-semibold text-xl">{title}</span>
        <Badge className="ml-auto h-auto rounded-sm" variant="secondary">
          {loading ? "…" : `${data.length} runs`}
        </Badge>
      </div>
      <div className="border-b">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-14 text-muted-foreground first:pl-4">
                Company
              </TableHead>
              <TableHead className="h-14 text-muted-foreground">
                Period
              </TableHead>
              <TableHead className="h-14 text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="h-14 text-right text-muted-foreground">
                Employees
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{body}</TableBody>
        </Table>
      </div>
    </div>
  );
}

export default PayRunDatatable;
