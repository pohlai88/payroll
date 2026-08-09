/**
 * @feature remuneration
 * @layer ui
 * @hub src/server/routes/employee-remuneration.ts
 *
 * Annual remuneration summary view.
 */

import { MoneyCell } from "@/components/payroll/money-cell";
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
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-base text-foreground">
          Annual Remuneration Summary
        </h2>
        <p className="text-muted-foreground text-sm">
          {data.employeeName} · {data.employeeCode} · Tax Year {data.year}
        </p>
        <p className="text-muted-foreground text-xs">
          {data.reportMeta.companyName}
        </p>
      </div>

      <div className="rounded border border-status-warn-border bg-status-warn-fill p-3 text-status-warn-ink text-xs">
        <p className="mb-1 font-semibold">
          Important: Payroll-system summary only
        </p>
        <p>{data.limitationNotice}</p>
      </div>

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

      <div className="rounded border bg-muted/40 p-3 text-muted-foreground text-xs">
        {data.disclaimer}
      </div>

      <p className="text-muted-foreground text-xs">
        Generated: {data.reportMeta.generatedAt} · Schema v
        {data.reportMeta.reportSchemaVersion}
      </p>
    </div>
  );
}

export { AnnualRemunerationSummary };
