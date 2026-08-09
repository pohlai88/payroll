/**
 * @feature shell
 * @layer ui
 *
 * Shared empty-state block.
 */

import { ChartNoAxesColumnIncreasingIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface EmptyState01Props {
  description?: string;
  title?: string;
  emptyTitle?: string;
  emptyDetail?: string;
  icon?: ReactNode;
  className?: string;
}

function EmptyState01({
  description = "Total API requests.",
  title = "0",
  emptyTitle = "No data to show",
  emptyDetail = "May take 24 hours for data to load",
  icon,
  className,
}: EmptyState01Props) {
  return (
    <Card className={cn("w-full max-w-lg", className)}>
      <CardHeader className="gap-0">
        <CardDescription>{description}</CardDescription>
        <CardTitle className="text-3xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-dashed p-6 text-center">
          {icon ?? (
            <ChartNoAxesColumnIncreasingIcon className="mx-auto size-12 text-muted-foreground" />
          )}
          <p className="mt-2 font-medium text-sm">{emptyTitle}</p>
          <p className="mt-1 text-muted-foreground text-sm">{emptyDetail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default EmptyState01;
