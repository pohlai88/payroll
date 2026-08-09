import { Line, LineChart } from "recharts";

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

// Impression chart data
const impressionChartData = [
  { month: "January", impression: 20 },
  { month: "February", impression: 20 },
  { month: "March", impression: 50 },
  { month: "April", impression: 50 },
  { month: "May", impression: 30 },
  { month: "June", impression: 30 },
  { month: "July", impression: 5 },
  { month: "August", impression: 5 },
  { month: "September", impression: 50 },
  { month: "October", impression: 50 },
  { month: "November", impression: 105 },
  { month: "December", impression: 105 },
];

const impressionChartConfig = {
  impression: {
    label: "Impressions",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig;

const StatisticsCardData = {
  title: "Impression",
  description: "Last year",
  children: (
    <>
      <ChartContainer className="h-21 w-full" config={impressionChartConfig}>
        <LineChart
          accessibilityLayer
          data={impressionChartData}
          margin={{
            left: 4,
            right: 4,
          }}
        >
          <ChartTooltip
            content={<ChartTooltipContent hideLabel />}
            cursor={false}
          />
          <Line
            dataKey="impression"
            dot={false}
            stroke="var(--color-impression)"
            strokeWidth={3}
            type="linear"
          />
        </LineChart>
      </ChartContainer>
    </>
  ),
  value: "175K",
  changePercentage: "+24%",
};

const StatisticsImpressionCard = ({ className }: { className?: string }) => (
  <Card className={className}>
    <CardHeader>
      <CardTitle className="font-semibold text-lg">
        {StatisticsCardData.title}
      </CardTitle>
      <CardDescription className="text-base text-muted-foreground">
        {StatisticsCardData.description}
      </CardDescription>
    </CardHeader>
    <CardContent>{StatisticsCardData.children}</CardContent>

    <CardContent className="flex items-center justify-between">
      <span className="font-semibold text-xl">{StatisticsCardData.value}</span>
      <span className="text-base text-primary">
        {StatisticsCardData.changePercentage}
      </span>
    </CardContent>
  </Card>
);

export default StatisticsImpressionCard;
