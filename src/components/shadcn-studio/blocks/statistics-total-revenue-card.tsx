/**
 * @feature shell
 * @layer ui
 *
 * Statistics revenue card.
 */

"use client";

import { Bar, BarChart } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

import { cn } from "@/lib/utils";

// Revenue chart data
const revenueChartData = [
  { month: "January", desktop: 120, mobile: 80 },
  { month: "February", desktop: 164, mobile: 120 },
  { month: "March", desktop: 99, mobile: 138 },
  { month: "April", desktop: 48, mobile: 80 },
  { month: "May", desktop: 160, mobile: 141 },
];

const revenueChartConfig = {
  desktop: {
    label: "Desktop",
    color: "var(--chart-2)",
  },
  mobile: {
    label: "Mobile",
    color: "color-mix(in oklab, var(--chart-2) 20%, transparent)",
  },
} satisfies ChartConfig;

const StatisticsCardData = {
  title: "$42.5k",
  description: "Total Revenue",
  children: (
    <>
      <ChartContainer className="h-31 w-full" config={revenueChartConfig}>
        <BarChart
          accessibilityLayer
          barGap={0}
          barSize={12}
          data={revenueChartData}
          margin={{
            left: 0,
            right: 0,
          }}
        >
          <Bar
            dataKey="desktop"
            fill="var(--color-desktop)"
            radius={[12, 12, 0, 0]}
          />
          <Bar
            dataKey="mobile"
            fill="var(--color-mobile)"
            radius={[12, 12, 0, 0]}
          />
          <ChartTooltip
            content={<ChartTooltipContent hideLabel />}
            cursor={false}
          />
        </BarChart>
      </ChartContainer>
    </>
  ),
  changePercentage: "-22%",
};

const StatisticsTotalRevenueCard = ({ className }: { className?: string }) => (
  <Card className={cn("justify-between", className)}>
    <CardHeader>
      <div className="flex items-center gap-2">
        <CardTitle className="font-semibold text-lg">
          {StatisticsCardData.title}
        </CardTitle>
        <span className="text-base">{StatisticsCardData.changePercentage}</span>
      </div>
      <CardDescription className="text-base text-muted-foreground">
        {StatisticsCardData.description}
      </CardDescription>
    </CardHeader>
    <CardContent>{StatisticsCardData.children}</CardContent>
  </Card>
);

export default StatisticsTotalRevenueCard;
