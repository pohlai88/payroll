import { Badge } from "@/components/ui/badge";

type RunStatus = "DRAFT" | "REVIEWED" | "APPROVED" | "CLOSED";

interface StatusBadgeProps {
  status: RunStatus;
}

const STATUS_CONFIG: Record<RunStatus, { glyph: string; className: string }> = {
  DRAFT: {
    glyph: "◦",
    className: "text-muted-foreground bg-transparent border border-border",
  },
  REVIEWED: {
    glyph: "◔",
    className: "text-foreground bg-transparent border border-border",
  },
  APPROVED: {
    glyph: "✓",
    className:
      "text-[var(--status-ok-ink)] bg-[var(--status-ok-fill)] border-0",
  },
  CLOSED: {
    glyph: "✓",
    className:
      "text-[var(--status-ok-ink)] bg-[var(--status-ok-fill)] border-0",
  },
};

function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
  return (
    <Badge className={config.className} variant="outline">
      {config.glyph} {status}
    </Badge>
  );
}

function isRunStatus(status: string): status is RunStatus {
  return (
    status === "DRAFT" ||
    status === "REVIEWED" ||
    status === "APPROVED" ||
    status === "CLOSED"
  );
}

/**
 * Shared severity → className for finding/exception badge coloring.
 * Covers BLOCKING (bad), WARNING (warn), REVIEW (info), and a muted fallback
 * for INFO or any unknown severity.
 */
function severityBadgeClass(severity: string): string {
  if (severity === "BLOCKING") {
    return "border-0 bg-[var(--status-bad-fill)] text-[var(--status-bad-ink)]";
  }
  if (severity === "WARNING") {
    return "border-[var(--status-warn-border)] bg-[var(--status-warn-fill)] text-[var(--status-warn-ink)]";
  }
  if (severity === "REVIEW") {
    return "border-0 bg-[var(--status-info-fill)] text-[var(--status-info-ink)]";
  }
  return "border-border bg-muted text-muted-foreground";
}

export type { RunStatus, StatusBadgeProps };
export { isRunStatus, StatusBadge, severityBadgeClass };
