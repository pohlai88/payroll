/**
 * @feature shell
 * @layer ui
 *
 * Status-bearing statistics card (studio statistics-component-12 DNA).
 *
 * Synthesised, not copied: the source block hardcodes palette colours
 * (bg-green-600/10, text-amber-600, bg-sky-600/10). Valence uses stock
 * shadcn tokens (secondary / muted / destructive). Presentational only.
 */

import {
  CircleDashedIcon,
  MinusIcon,
  ShieldAlertIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Governance valence — what the reader must do about this number. */
export type StatisticStatus =
  | "ok"
  | "attention"
  | "risk"
  | "pending"
  | "neutral";

const statusConfig: Record<
  StatisticStatus,
  { className: string; icon: ReactNode; label: string }
> = {
  ok: {
    className: "bg-secondary text-secondary-foreground",
    icon: <TrendingUpIcon />,
    label: "On track",
  },
  attention: {
    className: "bg-muted text-foreground",
    icon: <MinusIcon />,
    label: "Needs action",
  },
  risk: {
    className: "bg-destructive/10 text-destructive",
    icon: <TrendingDownIcon />,
    label: "At risk",
  },
  pending: {
    className: "bg-muted text-muted-foreground",
    icon: <ShieldAlertIcon />,
    label: "Awaiting",
  },
  neutral: {
    className: "bg-muted text-muted-foreground",
    icon: <CircleDashedIcon />,
    label: "No data",
  },
};

export interface StatisticsWithStatusProps {
  title: string;
  value: string;
  status: StatisticStatus;
  /** Threshold or context shown after the status label, e.g. "3 of 12 open". */
  caption: string;
  icon?: ReactNode;
  className?: string;
}

/**
 * Descriptor for a tile in a KPI row. Pages build an array of these outside
 * JSX so the render stays flat and each tile's valence is declared in one spot.
 */
export type StatCard = Pick<
  StatisticsWithStatusProps,
  "title" | "status" | "caption" | "icon"
> & { value: number };

const StatisticsWithStatus = ({
  title,
  value,
  status,
  caption,
  icon,
  className,
}: StatisticsWithStatusProps) => {
  const config = statusConfig[status];

  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle className="font-medium text-sm">{title}</CardTitle>
        {icon ? (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&>svg]:size-4.5">
            {icon}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <p className="font-semibold text-3xl tabular-nums tracking-tight">
          {value}
        </p>

        <Badge className={cn(config.className, "gap-1.5 [&>svg]:size-3.5")}>
          {config.icon}
          <span>{config.label}:</span>
          <span className="font-normal">{caption}</span>
        </Badge>
      </CardContent>
    </Card>
  );
};

export default StatisticsWithStatus;
