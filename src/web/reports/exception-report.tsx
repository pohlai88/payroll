import { severityBadgeClass } from "@/components/payroll/status-badge";
import type { ExceptionReportDto } from "@/web/api/payroll-api";

interface ExceptionReportProps {
  readonly data: ExceptionReportDto;
}

function ExceptionReport({ data }: ExceptionReportProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Exception Report</h2>
        <p className="text-muted-foreground text-xs">
          {data.reportMeta.runId} · {data.findings.length} finding
          {data.findings.length === 1 ? "" : "s"}
        </p>
      </div>
      {data.findings.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No findings for this run.
        </p>
      )}
      <div className="space-y-2">
        {data.findings.map((f) => (
          <div
            className={`rounded border p-3 text-sm ${severityBadgeClass(f.severity)}`}
            key={f.id}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{f.title}</span>
              <div className="flex items-center gap-2 text-xs">
                <span className="opacity-70">{f.severity}</span>
                <span className="opacity-70">{f.status}</span>
              </div>
            </div>
            <p className="mt-1 text-xs opacity-80">{f.detail}</p>
            {f.employeeName ? (
              <p className="mt-0.5 text-xs opacity-60">{f.employeeName}</p>
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
