/**
 * @feature shell
 * @layer ui
 *
 * Statistics category card.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CategoryBar } from "@/components/ui/category-bar";
import { cn } from "@/lib/utils";

export interface CategorySegment {
  label: string;
  value: number;
  color: string;
}

export interface StatisticsCategoryCardProps {
  title: string;
  value: string;
  period: string;
  segments: CategorySegment[];
  className?: string;
}

const StatisticsCategoryCard = ({
  title,
  value,
  period,
  segments,
  className,
}: StatisticsCategoryCardProps) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <Card className={className}>
      <CardHeader className="gap-1">
        <p className="text-sm">{title}</p>
        <CardTitle className="font-semibold text-3xl tracking-tight">
          {value}
        </CardTitle>
        <CardDescription className="text-muted-foreground text-xs">
          {period}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <CategoryBar
          colors={segments.map((s) => s.color)}
          showLabels={false}
          values={segments.map((s) => s.value)}
        />

        <div className="flex flex-wrap gap-6">
          {segments.map((s) => {
            const pct = total > 0 ? ((s.value / total) * 100).toFixed(1) : "0";

            return (
              <div className="flex flex-col" key={s.label}>
                <p className="font-semibold text-base tabular-nums">{pct}%</p>
                <div className="flex items-center gap-1.5">
                  <span className={cn("size-2 shrink-0 rounded-sm", s.color)} />
                  <span className="text-muted-foreground text-sm">
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default StatisticsCategoryCard;
