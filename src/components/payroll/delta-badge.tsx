/**
 * @feature pay-run
 * @layer ui
 * @hub src/server/routes/pay-run.ts
 *
 * Delta/variance badge.
 */

import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon } from "lucide-react";

interface VarianceDto {
  previousSen: number | null;
  deltaSen: number | null;
  deltaBps: number | null;
  direction: "UP" | "DOWN" | "SAME" | "NO_PRIOR";
}

interface DeltaBadgeProps {
  variance: VarianceDto;
  className?: string;
}

function DeltaBadge({ variance }: DeltaBadgeProps) {
  if (variance.direction === "NO_PRIOR") {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  if (variance.direction === "SAME") {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs">
        <ArrowRightIcon className="size-3" />
        0%
      </span>
    );
  }

  const bps = variance.deltaBps ?? 0;
  const pct = (Math.abs(bps) / 100).toFixed(1);
  const Icon = variance.direction === "UP" ? ArrowUpIcon : ArrowDownIcon;

  // Neutral directional ink — not green/red, never status-ok/status-bad
  return (
    <span className="inline-flex items-center gap-0.5 font-medium text-foreground text-xs">
      <Icon className="size-3" />
      {pct}%
    </span>
  );
}

export type { DeltaBadgeProps, VarianceDto };
export { DeltaBadge };
