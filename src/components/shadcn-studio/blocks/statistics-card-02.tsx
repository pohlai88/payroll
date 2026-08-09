/**
 * @feature shell
 * @layer ui
 *
 * Statistics card variant.
 */

import {
  CheckIcon,
  ChevronDownIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const days = [5, 10, 20, 30] as const;

export interface StatisticsCardProps {
  icon: ReactNode;
  title: string;
  value: string;
  changePercentage?: number;
  showPeriodFilter?: boolean;
  className?: string;
  iconClassName?: string;
}

function DayMenuItem({
  day,
  selectedDays,
  onSelect,
}: {
  day: number;
  selectedDays: number;
  onSelect: (day: number) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect(day);
  }, [day, onSelect]);

  return (
    <DropdownMenuItem onClick={handleClick}>
      <span className="text-sm">{day} Days</span>
      {selectedDays === day ? <CheckIcon className="ml-auto" /> : null}
    </DropdownMenuItem>
  );
}

const StatisticsCard = ({
  icon,
  title,
  value,
  changePercentage,
  showPeriodFilter = true,
  className,
  iconClassName,
}: StatisticsCardProps) => {
  const [selectedDays, setSelectedDays] = useState<number>(days.at(-1) ?? 30);

  return (
    <Card
      className={cn(
        "justify-between bg-radial-[at_150%_90%] from-primary/20 to-60% to-card",
        className
      )}
    >
      <CardHeader className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Avatar className="size-7 after:border-0">
            <AvatarFallback
              className={cn(
                "size-7 shrink-0 bg-primary/10 text-primary [&>svg]:size-3.5",
                iconClassName
              )}
            >
              {icon}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm">{title}</span>
        </div>
        {showPeriodFilter ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 rounded-lg px-2 py-1.5">
              <span className="max-w-[17ch] truncate text-sm leading-none">
                {selectedDays} Days
              </span>
              <ChevronDownIcon className="size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {days.map((day) => (
                <DayMenuItem
                  day={day}
                  key={day}
                  onSelect={setSelectedDays}
                  selectedDays={selectedDays}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <span className="font-semibold text-2xl">{value}</span>
        {changePercentage === undefined ? null : (
          <Badge className="bg-primary/10 text-primary">
            {changePercentage > 0 ? (
              <TrendingUpIcon className="size-3" />
            ) : (
              <TrendingDownIcon className="size-3" />
            )}
            {changePercentage}%
          </Badge>
        )}
      </CardContent>
    </Card>
  );
};

export default StatisticsCard;
