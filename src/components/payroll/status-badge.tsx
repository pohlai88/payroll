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

export type { RunStatus, StatusBadgeProps };
export { StatusBadge };
