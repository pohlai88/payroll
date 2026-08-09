/**
 * @feature shell
 * @layer ui
 *
 * shadcn UI primitive (shared).
 */

import { type HTMLAttributes, type Ref, useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const DEFAULT_BAR_COLOR = "bg-muted";

function getMarkerBgColor(
  marker: number | undefined,
  values: number[],
  colors: string[]
): string {
  if (marker === undefined) {
    return "";
  }

  if (marker === 0) {
    for (const [index, segment] of values.entries()) {
      if ((segment ?? 0) > 0) {
        return colors[index] ?? DEFAULT_BAR_COLOR;
      }
    }
  }

  let prefixSum = 0;
  for (const [index, segment] of values.entries()) {
    prefixSum += segment ?? 0;
    if (prefixSum >= marker) {
      return colors[index] ?? DEFAULT_BAR_COLOR;
    }
  }

  return colors[values.length - 1] ?? DEFAULT_BAR_COLOR;
}

function getPositionLeft(value: number | undefined, maxValue: number): number {
  return value && maxValue > 0 ? (value / maxValue) * 100 : 0;
}

function sumNumericArray(arr: number[]) {
  return arr.reduce((prefixSum, num) => prefixSum + num, 0);
}

function formatNumber(num: number): string {
  if (Number.isInteger(num)) {
    return num.toString();
  }
  return num.toFixed(1);
}

function BarLabels({ values }: { values: number[] }) {
  const sumValues = useMemo(() => sumNumericArray(values), [values]);
  let prefixSum = 0;
  let sumConsecutiveHiddenLabels = 0;

  return (
    <div className="relative mb-2 flex h-5 w-full font-medium text-muted-foreground text-sm">
      <div className="absolute bottom-0 left-0 flex items-center">0</div>
      {values.map((widthPercentage, index) => {
        prefixSum += widthPercentage;

        const showLabel =
          sumValues > 0 &&
          (widthPercentage >= 0.1 * sumValues ||
            sumConsecutiveHiddenLabels >= 0.09 * sumValues) &&
          sumValues - prefixSum >= 0.1 * sumValues &&
          prefixSum >= 0.1 * sumValues &&
          prefixSum < 0.9 * sumValues;

        if (showLabel) {
          sumConsecutiveHiddenLabels = 0;
        } else {
          sumConsecutiveHiddenLabels += widthPercentage;
        }

        const widthPositionLeft = getPositionLeft(widthPercentage, sumValues);

        return (
          <div
            className="flex items-center justify-end pr-0.5"
            key={`label-${String(index)}-${String(widthPercentage)}`}
            style={{ width: `${widthPositionLeft}%` }}
          >
            {showLabel ? (
              <span className="block translate-x-1/2 text-sm tabular-nums">
                {formatNumber(prefixSum)}
              </span>
            ) : null}
          </div>
        );
      })}
      <div className="absolute right-0 bottom-0 flex items-center">
        {formatNumber(sumValues)}
      </div>
    </div>
  );
}

interface CategoryBarProps extends HTMLAttributes<HTMLDivElement> {
  values: number[];
  colors?: string[];
  marker?: { value: number; tooltip?: string; showAnimation?: boolean };
  showLabels?: boolean;
  ref?: Ref<HTMLDivElement>;
}

function CategoryBar({
  values = [],
  colors = [],
  marker,
  showLabels = true,
  className,
  ref,
  ...props
}: CategoryBarProps) {
  const markerBgColor = useMemo(
    () => getMarkerBgColor(marker?.value, values, colors),
    [marker, values, colors]
  );

  const maxValue = useMemo(() => sumNumericArray(values), [values]);

  const adjustedMarkerValue = useMemo(() => {
    if (marker === undefined) {
      return;
    }
    if (marker.value < 0) {
      return 0;
    }
    if (marker.value > maxValue) {
      return maxValue;
    }
    return marker.value;
  }, [marker, maxValue]);

  const markerPositionLeft = useMemo(
    () => getPositionLeft(adjustedMarkerValue, maxValue),
    [adjustedMarkerValue, maxValue]
  );

  return (
    <div
      aria-label="Category bar"
      className={cn(className)}
      ref={ref}
      role="img"
      {...props}
    >
      {showLabels ? <BarLabels values={values} /> : null}
      <div className="relative flex h-2 w-full items-center">
        <div
          className={cn(
            "flex h-full flex-1 items-center overflow-hidden rounded-full",
            showLabels ? "gap-0.5" : ""
          )}
        >
          {maxValue === 0 ? (
            <div className="h-full w-full bg-muted" />
          ) : (
            values.map((value, index) => {
              const barColor = colors[index] ?? DEFAULT_BAR_COLOR;
              const percentage = (value / maxValue) * 100;

              return (
                <div
                  className={cn(
                    "h-full",
                    barColor,
                    percentage === 0 && "hidden"
                  )}
                  key={`segment-${String(index)}-${String(value)}`}
                  style={{ width: `${percentage}%` }}
                />
              );
            })
          )}
        </div>

        {marker === undefined ? null : (
          <div
            className={cn(
              "absolute w-2 -translate-x-1/2",
              marker.showAnimation &&
                "transform-gpu transition-all duration-300 ease-in-out"
            )}
            style={{ left: `${markerPositionLeft}%` }}
          >
            {marker.tooltip ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div
                      aria-hidden="true"
                      className={cn(
                        "relative mx-auto h-4 w-1 rounded-full ring-2 ring-background",
                        markerBgColor
                      )}
                    >
                      <div
                        aria-hidden
                        className="absolute size-7 -translate-x-[45%] -translate-y-[15%]"
                      />
                    </div>
                  }
                />
                <TooltipContent>{marker.tooltip}</TooltipContent>
              </Tooltip>
            ) : (
              <div
                className={cn(
                  "mx-auto h-4 w-1 rounded-full ring-2 ring-background",
                  markerBgColor
                )}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { CategoryBar, type CategoryBarProps };
