/**
 * @feature shell
 * @layer ui
 *
 * FieldStack — accessible label + input column pair.
 * Composed from existing Label and Input primitives.
 */

import type * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldStackProps extends React.ComponentProps<typeof Input> {
  readonly label: string;
  readonly id: string;
  readonly hint?: string;
  readonly error?: string;
  readonly wrapperClassName?: string;
}

function FieldStack({
  label,
  id,
  hint,
  error,
  wrapperClassName,
  className,
  ...inputProps
}: FieldStackProps) {
  let describedBy: string | undefined;
  if (error !== undefined) {
    describedBy = `${id}-error`;
  } else if (hint !== undefined) {
    describedBy = `${id}-hint`;
  }

  return (
    <div className={cn("flex flex-col gap-1.5", wrapperClassName)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        aria-describedby={describedBy}
        aria-invalid={error !== undefined || undefined}
        className={cn(error !== undefined && "border-destructive", className)}
        id={id}
        {...inputProps}
      />
      {error !== undefined && (
        <p className="text-destructive text-xs" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      {error === undefined && hint !== undefined && (
        <p className="text-muted-foreground text-xs" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export type { FieldStackProps };
export { FieldStack };
