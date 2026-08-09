/**
 * @feature pay-run
 * @layer ui
 * @hub src/server/routes/pay-run.ts
 *
 * Run/line status badge.
 */

import type { VariantProps } from "class-variance-authority";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type RunStatus = "DRAFT" | "REVIEWED" | "APPROVED" | "CLOSED";
type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

interface StatusBadgeProps {
  status: RunStatus;
  className?: string;
}

const STATUS_CONFIG: Record<
  RunStatus,
  {
    glyph: string;
    variant: BadgeVariant;
    className?: string;
  }
> = {
  DRAFT: {
    glyph: "◦",
    variant: "outline",
    className: "text-muted-foreground bg-transparent",
  },
  REVIEWED: {
    glyph: "◔",
    variant: "outline",
    className: "text-foreground bg-transparent",
  },
  APPROVED: {
    glyph: "✓",
    variant: "success",
  },
  CLOSED: {
    glyph: "✓",
    variant: "success",
  },
};

function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
  return (
    <Badge className={cn(config.className, className)} variant={config.variant}>
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

/** Map finding/exception severity → Badge variant (Straits status tokens). */
function severityBadgeVariant(severity: string): BadgeVariant {
  if (severity === "BLOCKING") {
    return "bad";
  }
  if (severity === "WARNING") {
    return "warning";
  }
  if (severity === "REVIEW") {
    return "info";
  }
  return "secondary";
}

/**
 * Surface tint for finding cards (not Badge chrome). Prefer
 * `severityBadgeVariant` on Badge children; use this only for block backgrounds.
 */
function severityBadgeClass(severity: string): string {
  if (severity === "BLOCKING") {
    return "border-0 bg-destructive/10 text-destructive";
  }
  if (severity === "WARNING") {
    return "border-border bg-muted text-foreground";
  }
  if (severity === "REVIEW") {
    return "border-0 bg-muted text-muted-foreground";
  }
  return "border-border bg-muted text-muted-foreground";
}

export type { RunStatus, StatusBadgeProps };
export { isRunStatus, StatusBadge, severityBadgeVariant };
