import type { ExceptionReportDto } from "@/web/api/payroll-api";

// Reuse the severity colour pattern from findings-panel.tsx
const SEVERITY_CLASS: Record<string, string> = {
  BLOCKING: "bg-destructive/10 text-destructive border-destructive/20",
  WARNING: "bg-yellow-50 text-yellow-800 border-yellow-200",
  REVIEW: "bg-blue-50 text-blue-800 border-blue-200",
  INFO: "bg-muted text-muted-foreground border-border",
};

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
            className={`rounded border p-3 text-sm ${SEVERITY_CLASS[f.severity] ?? SEVERITY_CLASS.INFO}`}
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
