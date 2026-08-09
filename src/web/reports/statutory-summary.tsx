import { MoneyCell } from "@/components/payroll/money-cell";
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
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-base text-foreground">
          Statutory Remittance Summary
        </h2>
        <p className="text-muted-foreground text-xs">
          {data.reportMeta.runId} · {data.reportMeta.runStatus} ·{" "}
          {data.employeeCount} employee{data.employeeCount === 1 ? "" : "s"}
        </p>
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
      <p className="text-muted-foreground text-xs">
        Generated: {data.reportMeta.generatedAt} · Schema v
        {data.reportMeta.reportSchemaVersion}
      </p>
    </div>
  );
}

export { StatutorySummary };
