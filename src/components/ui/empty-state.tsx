/**
 * EmptyState — dashed card with icon, message, optional badge and action.
 * Inspired by Studio empty-state-01 pattern; tokens from Straits contract.
 */

import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly badge?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly className?: string;
}

function EmptyState({
  icon,
  title,
  description,
  badge,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{title}</CardTitle>
          {badge !== undefined && <Badge variant="secondary">{badge}</Badge>}
        </div>
        {description !== undefined && (
          <CardDescription>{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border border-dashed py-8 text-center">
          <span className="text-muted-foreground [&>svg]:size-10">{icon}</span>
          <p className="font-medium text-foreground text-sm">{title}</p>
          {description !== undefined && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
          {actionLabel !== undefined && onAction !== undefined && (
            <Button onClick={onAction} size="sm" type="button">
              {actionLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export type { EmptyStateProps };
export { EmptyState };
