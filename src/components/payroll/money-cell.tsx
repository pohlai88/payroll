import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface MoneyCellProps {
  sen: number | null;
  notApplicable?: boolean;
  citationText?: string;
  className?: string;
}

function MoneyCell({
  sen,
  notApplicable = false,
  citationText,
  className,
}: MoneyCellProps) {
  if (notApplicable) {
    return (
      <Tooltip>
        <TooltipTrigger
          className={cn(
            "cursor-default text-right text-muted-foreground tabular-nums",
            className
          )}
          render={<span />}
        >
          —
        </TooltipTrigger>
        <TooltipContent>
          {citationText ?? "Not applicable by statute"}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (sen === null) {
    return (
      <span
        className={cn(
          "text-right text-muted-foreground tabular-nums",
          className
        )}
      >
        —
      </span>
    );
  }

  const formatted = new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(sen / 100);

  return (
    <span className={cn("text-right tabular-nums", className)}>
      {formatted}
    </span>
  );
}

export type { MoneyCellProps };
export { MoneyCell };
