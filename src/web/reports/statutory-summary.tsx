/**
 * @feature reports
 * @layer ui
 * @hub src/server/routes/pay-run-reports.ts
 *
 * Statutory summary report view.
 */

import { MoneyCell } from "@/components/payroll/money-cell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { StatutorySummaryDto } from "@/web/api/payroll-api";

interface StatutorySummaryProps {
  readonly data: StatutorySummaryDto;
}

const ROWS: Array<{ label: string; field: keyof StatutorySummaryDto }> = [
  { label: "Gross Pay", field: "grossTotalSen" },
  { label: "Net Pay", field: "netTotalSen" },
  { label: "EPF Employee", field: "epfEeTotalSen" },
  { label: "EPF Employer", field: "epfErTotalSen" },
  { label: "SOCSO Employee", field: "socsoEeCoreTotalSen" },
  { label: "SOCSO Employer", field: "socsoErTotalSen" },
  { label: "EIS Employee", field: "eisEeTotalSen" },
  { label: "EIS Employer", field: "eisErTotalSen" },
  { label: "PCB / MTD", field: "pcbNetTotalSen" },
  { label: "CP38", field: "cp38TotalSen" },
];

function StatutorySummary({ data }: StatutorySummaryProps) {
  return (
    <Card className="overflow-hidden py-0">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="font-semibold text-base text-foreground">
            Statutory Remittance Summary
          </h2>
          <p className="truncate text-muted-foreground text-xs">
            {data.reportMeta.runId} · {data.reportMeta.runStatus}
          </p>
        </div>
        <Badge className="h-auto rounded-sm" variant="secondary">
          {data.employeeCount} employee{data.employeeCount === 1 ? "" : "s"}
        </Badge>
      </div>
      <Table>
        <TableBody>
          {ROWS.map(({ label, field }) => (
            <TableRow key={field}>
              <TableCell className="first:pl-4 text-muted-foreground">
                {label}
              </TableCell>
              <TableCell className="text-right">
                <MoneyCell sen={data[field] as number} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="space-y-1 border-t px-4 py-3 text-muted-foreground text-xs sm:px-5">
        {data.incomplete ? (
          <p>
            Some figures were unknown and omitted from totals — not treated as
            zero.
          </p>
        ) : null}
        <p>
          Generated: {data.reportMeta.generatedAt} · Schema v
          {data.reportMeta.reportSchemaVersion}
        </p>
      </div>
    </Card>
  );
}

export { StatutorySummary };
