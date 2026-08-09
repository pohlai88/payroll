/**
 * Canonical brand-band page title used above the shell primary band.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function PageTitle({
  title,
  description,
  className,
  actions,
}: {
  readonly title: string;
  readonly description?: string;
  readonly className?: string;
  readonly actions?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-4",
        className
      )}
    >
      <div>
        <h1 className="font-sans font-semibold text-2xl text-brand-foreground tracking-tight">
          {title}
        </h1>
        {description !== undefined && description !== "" ? (
          <p className="mt-1 text-brand-foreground/70 text-sm">{description}</p>
        ) : null}
      </div>
      {actions ?? null}
    </div>
  );
}

export { PageTitle };
