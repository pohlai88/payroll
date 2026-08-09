/**
 * @feature remuneration
 * @layer ui
 * @hub src/server/routes/employee-remuneration.ts
 *
 * Annual remuneration summary view.
 */

import { MoneyCell } from "@/components/payroll/money-cell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { AnnualRemunerationSummaryDto } from "@/web/api/payroll-api";

interface AnnualRemunerationSummaryProps {
  readonly data: AnnualRemunerationSummaryDto;
}

const ROWS: Array<{
  label: string;
  field: keyof AnnualRemunerationSummaryDto;
}> = [
  { label: "Gross Pay", field: "grossSen" },
  { label: "Net Pay", field: "netSen" },
  { label: "EPF Employee", field: "epfEeSen" },
  { label: "EPF Employer", field: "epfErSen" },
  { label: "SOCSO Employee", field: "socsoEeCoreSen" },
  { label: "EIS Employee", field: "eisEeSen" },
  { label: "PCB / MTD", field: "pcbNetSen" },
  { label: "CP38", field: "cp38Sen" },
];

function AnnualRemunerationSummary({ data }: AnnualRemunerationSummaryProps) {
  return (
    <Card className="overflow-hidden py-0">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="font-semibold text-base text-foreground">
            Annual Remuneration Summary
          </h2>
          <p className="text-muted-foreground text-sm">
            {data.employeeName} · {data.employeeCode}
          </p>
          <p className="text-muted-foreground text-xs">
            {data.reportMeta.companyName}
          </p>
        </div>
        <Badge className="h-auto rounded-sm" variant="secondary">
          Tax year {data.year}
        </Badge>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <Alert variant="warning">
          <AlertTitle>Payroll-system summary only</AlertTitle>
          <AlertDescription>{data.limitationNotice}</AlertDescription>
        </Alert>

        <Table>
          <TableBody>
            {ROWS.map(({ label, field }) => (
              <TableRow key={field}>
                <TableCell className="text-muted-foreground">{label}</TableCell>
                <TableCell className="text-right">
                  <MoneyCell sen={data[field] as number} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {data.incomplete ? (
          <p className="text-muted-foreground text-xs">
            Some figures were unknown and omitted from totals — not treated as
            zero.
          </p>
        ) : null}

        <div className="space-y-1 text-muted-foreground text-xs">
          <p>Months included: {data.months.join(", ") || "—"}</p>
          <p>Runs included: {data.runsIncluded.length}</p>
        </div>

        <Alert>
          <AlertDescription>{data.disclaimer}</AlertDescription>
        </Alert>
      </div>

      <p className="border-t px-4 py-3 text-muted-foreground text-xs sm:px-5">
        Generated: {data.reportMeta.generatedAt} · Schema v
        {data.reportMeta.reportSchemaVersion}
      </p>
    </Card>
  );
}

export { AnnualRemunerationSummary };
