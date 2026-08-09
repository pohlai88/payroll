/**
 * @feature shell
 * @layer ui
 *
 * Visitors chart block.
 */

import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  UsersRoundIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  totalVisitors: string;
  percentage: number;
  visitorData: {
    product: string;
    percentage: number;
    amount: number;
    trend: string;
    heightClass: string;
    color: string;
  }[];
  className?: string;
}

const TotalVisitorsCard = ({
  title,
  totalVisitors,
  percentage,
  visitorData,
  className,
}: Props) => (
  <Card className={cn("gap-4", className)}>
    <CardHeader className="flex flex-col">
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-base">
          <Avatar className="rounded-sm after:border-0">
            <AvatarFallback className="shrink-0 rounded-sm bg-primary/10 text-primary">
              <UsersRoundIcon className="size-4" />
            </AvatarFallback>
          </Avatar>
          <span>{title}</span>
        </div>
        <Button size="xs" variant="outline">
          Details
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-semibold text-2xl">{totalVisitors}</span>
        <Badge className="rounded-sm bg-primary/10 text-primary focus-visible:outline-none focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40 [a&]:hover:bg-primary/5">
          {percentage > 0 && "+"}
          {percentage}%
        </Badge>
      </div>
    </CardHeader>
    <CardContent className="flex flex-1 flex-col gap-4">
      <Separator />
      <div className="flex flex-1">
        {visitorData.map((item) => (
          <div
            className="flex grow flex-col gap-2.5 not-last:border-r border-dashed p-2"
            key={item.product}
          >
            <span className="text-muted-foreground text-sm">
              {item.product}
            </span>

            <div className="font-medium text-2xl">{item.percentage}%</div>
            <div className="flex min-h-35 flex-1 items-end">
              <div
                className={cn(
                  "grow rounded-xl bg-primary",
                  item.heightClass,
                  item.color
                )}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-sm">
                {item.amount}
              </span>
              {item.trend === "up" ? (
                <ArrowUpRightIcon className="size-4" />
              ) : (
                <ArrowDownLeftIcon className="size-4" />
              )}
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

export default TotalVisitorsCard;
