/**
 * @feature shell
 * @layer ui
 *
 * Money KPI tile (studio statistics-component DNA).
 *
 * Synthesised from statistics-component-08/12 layout: Card with icon chip,
 * muted title, large tabular value slot, and a trailing variance/caption
 * slot. Presentational only — callers pass formatted `MoneyCell` /
 * `DeltaBadge` children; never formats sen or recomputes variance.
 */

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatisticsMoneyTileProps {
  title: string;
  /** Pre-rendered money value (typically `<MoneyCell sen={…} />`). */
  value: ReactNode;
  /** Variance / caption row (typically `<DeltaBadge variance={…} />`). */
  caption?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

function StatisticsMoneyTile({
  title,
  value,
  caption,
  icon,
  className,
}: StatisticsMoneyTileProps) {
  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle className="truncate font-medium text-muted-foreground text-sm">
          {title}
        </CardTitle>
        {icon ? (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&>svg]:size-4">
            {icon}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="font-semibold text-2xl tabular-nums tracking-tight">
          {value}
        </div>
        {caption ? (
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            {caption}
            <span>vs prior</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default StatisticsMoneyTile;
