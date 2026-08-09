import { MoneyCell } from "@/components/payroll/money-cell";
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
        <h2 className="font-semibold text-foreground">
          Annual Remuneration Summary
        </h2>
        <p className="text-muted-foreground text-sm">
          {data.employeeName} · {data.employeeCode} · Tax Year {data.year}
        </p>
        <p className="text-muted-foreground text-xs">
          {data.reportMeta.companyName}
        </p>
      </div>

      {/* Limitation notice — must be shown, per spec Rule 4 */}
      <div className="rounded border border-[hsl(var(--status-warn-fill))]/20 bg-[hsl(var(--status-warn-fill))] p-3 text-xs text-[hsl(var(--status-warn-ink))]">
        <p className="mb-1 font-semibold">
          Important: Payroll-system summary only
        </p>
        <p>{data.limitationNotice}</p>
      </div>

      <table className="w-full border-collapse text-sm">
        <tbody>
          {ROWS.map(({ label, field }) => (
            <tr className="border-border/50 border-b" key={field}>
              <td className="py-2 text-muted-foreground">{label}</td>
              <td className="py-2 text-right">
                <MoneyCell sen={data[field] as number} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-1 text-muted-foreground text-xs">
        <p>Months included: {data.months.join(", ") || "—"}</p>
        <p>Runs included: {data.runsIncluded.length}</p>
      </div>

      {/* Disclaimer — must be shown */}
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
