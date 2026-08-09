/**
 * @feature reports
 * @layer ui
 * @hub src/server/routes/pay-run-reports.ts
 *
 * Exception report view.
 */

import { severityBadgeVariant } from "@/components/payroll/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ExceptionReportDto } from "@/web/api/payroll-api";

interface ExceptionReportProps {
  readonly data: ExceptionReportDto;
}

function ExceptionReport({ data }: ExceptionReportProps) {
  return (
    <Card className="overflow-hidden py-0">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="font-semibold text-base text-foreground">
            Exception Report
          </h2>
          <p className="truncate text-muted-foreground text-xs">
            {data.reportMeta.runId}
          </p>
        </div>
        <Badge className="h-auto rounded-sm" variant="secondary">
          {data.findings.length} finding
          {data.findings.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {data.findings.length === 0 ? (
        <p className="px-4 py-6 text-muted-foreground text-sm sm:px-5">
          No findings for this run.
        </p>
      ) : (
        <ul className="divide-y">
          {data.findings.map((f) => (
            <li className="space-y-1.5 px-4 py-3 sm:px-5" key={f.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-sm">{f.title}</span>
                <div className="flex items-center gap-1.5">
                  <Badge
                    className="h-auto rounded-sm px-1.5"
                    variant={severityBadgeVariant(f.severity)}
                  >
                    {f.severity}
                  </Badge>
                  <Badge className="h-auto rounded-sm px-1.5" variant="outline">
                    {f.status}
                  </Badge>
                </div>
              </div>
              <p className="text-muted-foreground text-xs">{f.detail}</p>
              {f.employeeName ? (
                <p className="text-muted-foreground text-xs">{f.employeeName}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="border-t px-4 py-3 text-muted-foreground text-xs sm:px-5">
        Generated: {data.reportMeta.generatedAt} · Schema v
        {data.reportMeta.reportSchemaVersion}
      </p>
    </Card>
  );
}

export { ExceptionReport };
