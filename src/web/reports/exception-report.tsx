/**
 * @feature reports
 * @layer ui
 * @hub src/server/routes/pay-run-reports.ts
 *
 * Exception report view.
 */

import { severityBadgeVariant } from "@/components/payroll/status-badge";
import { Badge } from "@/components/ui/badge";
import type { ExceptionReportDto } from "@/web/api/payroll-api";

interface ExceptionReportProps {
  readonly data: ExceptionReportDto;
}

function ExceptionReport({ data }: ExceptionReportProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-base text-foreground">
          Exception Report
        </h2>
        <p className="text-muted-foreground text-xs">
          {data.reportMeta.runId} · {data.findings.length} finding
          {data.findings.length === 1 ? "" : "s"}
        </p>
      </div>
      {data.findings.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No findings for this run.
        </p>
      ) : null}
      <div className="space-y-2">
        {data.findings.map((f) => (
          <div className="rounded border p-3 text-sm" key={f.id}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{f.title}</span>
              <div className="flex items-center gap-2">
                <Badge variant={severityBadgeVariant(f.severity)}>
                  {f.severity}
                </Badge>
                <Badge variant="outline">{f.status}</Badge>
              </div>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">{f.detail}</p>
            {f.employeeName ? (
              <p className="mt-0.5 text-muted-foreground text-xs">
                {f.employeeName}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Generated: {data.reportMeta.generatedAt} · Schema v
        {data.reportMeta.reportSchemaVersion}
      </p>
    </div>
  );
}

export { ExceptionReport };
