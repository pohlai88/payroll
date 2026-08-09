import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ReceiptTextIcon,
  UsersIcon,
} from "lucide-react";
import StatisticsCard, {
  type StatisticsCardProps,
} from "@/components/shadcn-studio/blocks/statistics-card-02";

const StatisticsCardData: StatisticsCardProps[] = [
  {
    icon: <ReceiptTextIcon className="size-3.5" />,
    title: "Pay runs",
    value: "12",
    showPeriodFilter: false,
  },
  {
    icon: <AlertTriangleIcon className="size-3.5" />,
    title: "Open runs",
    value: "4",
    showPeriodFilter: false,
  },
  {
    icon: <CheckCircle2Icon className="size-3.5" />,
    title: "Sealed / released",
    value: "8",
    showPeriodFilter: false,
  },
  {
    icon: <UsersIcon className="size-3.5" />,
    title: "Employees on runs",
    value: "240",
    showPeriodFilter: false,
  },
];

const StatisticsCardPreview = () => (
  <div className="py-8 sm:py-16 lg:py-24">
    <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
      {StatisticsCardData.map((card) => (
        <StatisticsCard
          changePercentage={card.changePercentage}
          icon={card.icon}
          key={card.title}
          showPeriodFilter={card.showPeriodFilter}
          title={card.title}
          value={card.value}
        />
      ))}
    </div>
  </div>
);

export default StatisticsCardPreview;
