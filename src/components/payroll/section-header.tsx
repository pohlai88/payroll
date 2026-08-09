/**
 * @feature shell
 * @layer ui
 * @hub src/server/routes/pay-run.ts
 *
 * Payroll section header.
 */

import type * as React from "react";
import { cn } from "@/lib/utils";

type Section = "earning" | "deduction" | "employer" | "summary";

interface SectionHeaderProps
  extends Omit<React.ComponentProps<"th">, "style" | "color"> {
  section: Section;
  children: React.ReactNode;
}

const SECTION_CLASSES: Record<Section, string> = {
  earning: "bg-section-earning-fill text-section-earning-ink",
  deduction: "bg-section-deduction-fill text-section-deduction-ink",
  employer: "bg-section-employer-fill text-section-employer-ink",
  summary: "bg-section-summary-fill text-section-summary-ink",
};

function SectionHeader({
  section,
  children,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <th
      {...props}
      className={cn(
        "px-3 py-2 text-left font-semibold text-xs uppercase tracking-wide",
        SECTION_CLASSES[section],
        className
      )}
    >
      {children}
    </th>
  );
}

export type { Section, SectionHeaderProps };
export { SectionHeader };
