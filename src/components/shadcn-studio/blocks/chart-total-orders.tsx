import { EllipsisVerticalIcon } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { Label, Pie, PieChart } from "recharts";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface StatusSlice {
  key: string;
  value: number;
  fill: string;
}

export interface StatusCategory {
  icon: ReactNode;
  title: string;
  detail: string;
  value: string;
}

export interface CardMenuItem {
  label: string;
  href?: string;
  onSelect?: () => void;
}

export interface TotalOrdersCardProps {
  title?: string;
  subtitle?: string;
  totalValue?: string;
  totalCaption?: string;
  centerValue?: string;
  centerLabel?: string;
  chartData?: StatusSlice[];
  chartConfig?: ChartConfig;
  categories?: StatusCategory[];
  menuItems?: CardMenuItem[];
  emptyMessage?: string;
  className?: string;
}

const defaultChartData: StatusSlice[] = [
  { key: "open", value: 4, fill: "var(--color-open)" },
  { key: "sealed", value: 6, fill: "var(--color-sealed)" },
  { key: "released", value: 2, fill: "var(--color-released)" },
];

const defaultChartConfig = {
  value: { label: "Runs" },
  open: {
    label: "Open",
    color: "var(--status-warn-ink)",
  },
  sealed: {
    label: "Sealed",
    color: "var(--status-ok-ink)",
  },
  released: {
    label: "Released",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

function DashboardMenuItem({
  item,
  navigate,
}: {
  item: CardMenuItem;
  navigate: (href: string) => void;
}) {
  const handleClick = useCallback(() => {
    item.onSelect?.();
    if (item.href) {
      navigate(item.href);
    }
  }, [item, navigate]);

  return (
    <DropdownMenuItem onClick={handleClick}>{item.label}</DropdownMenuItem>
  );
}

const TotalOrdersCard = ({
  title = "Pay-run status",
  subtitle = "Current reporting month",
  totalValue = "0",
  totalCaption = "Total pay runs",
  centerValue = "0%",
  centerLabel = "Sealed+",
  chartData = defaultChartData,
  chartConfig = defaultChartConfig,
  categories = [],
  menuItems = [],
  emptyMessage = "No data for this period.",
  className,
}: TotalOrdersCardProps) => {
  const [, navigate] = useLocation();
  const hasSlices = chartData.length > 0;

  const renderPieCenter = useCallback(
    ({ viewBox }: { viewBox?: { cx?: number; cy?: number } }) => {
      if (!(viewBox && "cx" in viewBox && "cy" in viewBox)) {
        return null;
      }
      return (
        <text
          dominantBaseline="middle"
          textAnchor="middle"
          x={viewBox.cx}
          y={viewBox.cy}
        >
          <tspan
            className="fill-card-foreground font-semibold text-lg"
            x={viewBox.cx}
            y={(viewBox.cy || 0) - 7}
          >
            {centerValue}
          </tspan>
          <tspan
            className="fill-muted-foreground text-sm"
            x={viewBox.cx}
            y={(viewBox.cy || 0) + 14}
          >
            {centerLabel}
          </tspan>
        </text>
      );
    },
    [centerLabel, centerValue]
  );

  return (
    <Card className={cn("gap-4 text-base", className)}>
      <CardHeader className="flex justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-lg">{title}</span>
          <span className="text-muted-foreground text-sm">{subtitle}</span>
        </div>
        {menuItems.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  className="size-6 rounded-full text-muted-foreground"
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <EllipsisVerticalIcon />
              <span className="sr-only">Menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {menuItems.map((item) => (
                  <DashboardMenuItem
                    item={item}
                    key={item.label}
                    navigate={navigate}
                  />
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col justify-center gap-2">
            <span className="font-semibold text-3xl">{totalValue}</span>
            <span className="text-muted-foreground text-sm">
              {totalCaption}
            </span>
          </div>
          {hasSlices ? (
            <ChartContainer className="h-30 w-full" config={chartConfig}>
              <PieChart>
                <ChartTooltip
                  content={<ChartTooltipContent hideLabel />}
                  cursor={false}
                />
                <Pie
                  data={chartData}
                  dataKey="value"
                  innerRadius={40}
                  nameKey="key"
                  outerRadius={60}
                  paddingAngle={3}
                >
                  <Label content={renderPieCenter as never} />
                </Pie>
              </PieChart>
            </ChartContainer>
          ) : (
            <div className="flex h-30 items-center justify-center rounded-lg border border-border border-dashed px-3 text-center text-muted-foreground text-sm">
              {emptyMessage}
            </div>
          )}
        </div>

        {categories.map((order) => (
          <div
            className="flex flex-1 items-center justify-between gap-2"
            key={order.title}
          >
            <div className="flex items-center justify-between gap-2">
              <Avatar className="size-10 rounded-sm after:border-0">
                <AvatarFallback className="shrink-0 rounded-sm bg-primary/10 text-primary">
                  {order.icon}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{order.title}</span>
                <span className="text-muted-foreground text-sm">
                  {order.detail}
                </span>
              </div>
            </div>
            <span className="text-sm">{order.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default TotalOrdersCard;
