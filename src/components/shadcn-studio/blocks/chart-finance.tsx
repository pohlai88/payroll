import {
  CreditCardIcon,
  DollarSignIcon,
  EllipsisVerticalIcon,
  WalletIcon,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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

const listItems = ["Share", "Update", "Refresh"];

function formatMonthTick(value: string): string {
  return value.slice(0, 3);
}

function formatYAxisTick(value: number): number {
  return value;
}

const financeChartData = [
  { month: "January", profit: 20, income: 0, expense: 0 },
  { month: "February", profit: 20, income: 8, expense: 0 },
  { month: "March", profit: 18, income: 22, expense: 0 },
  { month: "April", profit: 12, income: 13, expense: 0 },
  { month: "May", profit: 22, income: 18, expense: 4 },
  { month: "June", profit: 15, income: 22, expense: 13 },
  { month: "July", profit: 25, income: 7, expense: 12 },
];

const financeChartConfig = {
  profit: {
    label: "Profit",
    color: "var(--chart-2)",
  },
  income: {
    label: "Income",
    color: "var(--chart-1)",
  },
  expense: {
    label: "Expense",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

const ReportData = [
  {
    icons: <DollarSignIcon className="size-4.5" />,
    title: "Total Profit",
    amount: "$48,568.20",
    iconClassName: "bg-chart-2/10 text-chart-2",
  },
  {
    icons: <WalletIcon className="size-4.5" />,
    title: "Total Income",
    amount: "$38,453.25",
    iconClassName: "bg-chart-1/10 text-chart-1",
  },
  {
    icons: <CreditCardIcon className="size-4.5" />,
    title: "Total Expense",
    amount: "$2,453.45",
    iconClassName: "bg-chart-4/10 text-chart-4",
  },
];

const FinanceCard = ({ className }: { className?: string }) => (
  <Card
    className={cn("grid grid-cols-1 gap-x-2 gap-y-4 lg:grid-cols-5", className)}
  >
    <div className="flex flex-col gap-10 max-lg:border-b max-lg:pb-6 lg:col-span-3 lg:border-r lg:pr-2">
      <CardHeader className="flex justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-lg">Finance</span>
          <span className="text-muted-foreground text-sm">
            Yearly report overview
          </span>
        </div>
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
              {listItems.map((item) => (
                <DropdownMenuItem key={item}>{item}</DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="flex-1">
        <ChartContainer
          className="h-full min-h-65 w-full"
          config={financeChartConfig}
        >
          <BarChart
            accessibilityLayer
            barSize={12}
            data={financeChartData}
            margin={{ left: -30, bottom: -5 }}
          >
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="4"
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="month"
              tick={{ fill: "var(--muted-foreground)" }}
              tickFormatter={formatMonthTick}
              tickLine={false}
              tickMargin={10}
            />
            <YAxis
              axisLine={false}
              domain={[0, 50]}
              tick={{ fill: "var(--muted-foreground)" }}
              tickFormatter={formatYAxisTick}
              tickLine={false}
              tickMargin={8}
              ticks={[0, 10, 20, 30, 40, 50]}
            />
            <ChartTooltip
              content={<ChartTooltipContent hideLabel />}
              cursor={false}
            />
            <Bar dataKey="profit" fill="var(--color-profit)" stackId="a" />
            <Bar dataKey="income" fill="var(--color-income)" stackId="a" />
            <Bar dataKey="expense" fill="var(--color-expense)" stackId="a" />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </div>
    <div className="flex flex-col gap-10 lg:col-span-2">
      <CardHeader className="flex justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-lg">Report</span>
          <span className="text-muted-foreground text-sm">
            Monthly Avg. $45.578k
          </span>
        </div>
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
              {listItems.map((item) => (
                <DropdownMenuItem key={item}>{item}</DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-6 text-base">
        {ReportData.map((report) => (
          <div className="flex items-center gap-3" key={report.title}>
            <Avatar className="size-9 rounded-sm after:border-0">
              <AvatarFallback
                className={cn(
                  "shrink-0 rounded-sm bg-primary/10 text-primary [&>svg]:size-4.5",
                  report.iconClassName
                )}
              >
                {report.icons}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span>{report.title}</span>
              <span className="text-muted-foreground text-sm">
                {report.amount}
              </span>
            </div>
          </div>
        ))}

        <Button size="lg">View Report</Button>
      </CardContent>
    </div>
  </Card>
);

export default FinanceCard;
