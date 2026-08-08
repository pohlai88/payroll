import type * as React from "react";
import { cn } from "@/lib/utils";

type Section = "earning" | "deduction" | "employer" | "summary";

interface SectionHeaderProps
  extends Omit<React.ComponentProps<"th">, "style" | "color"> {
  section: Section;
  children: React.ReactNode;
}

// Section tokens are complete hex values — use var() directly in style prop
const SECTION_STYLES: Record<Section, { fill: string; ink: string }> = {
  earning: {
    fill: "var(--section-earning-fill)",
    ink: "var(--section-earning-ink)",
  },
  deduction: {
    fill: "var(--section-deduction-fill)",
    ink: "var(--section-deduction-ink)",
  },
  employer: {
    fill: "var(--section-employer-fill)",
    ink: "var(--section-employer-ink)",
  },
  summary: {
    fill: "var(--section-summary-fill)",
    ink: "var(--section-summary-ink)",
  },
};

function SectionHeader({
  section,
  children,
  className,
  ...props
}: SectionHeaderProps) {
  const { fill, ink } = SECTION_STYLES[section];
  return (
    <th
      {...props}
      className={cn(
        "px-3 py-2 text-left font-semibold text-xs uppercase tracking-wide",
        className
      )}
      style={{ background: fill, color: ink }}
    >
      {children}
    </th>
  );
}

export type { Section, SectionHeaderProps };
export { SectionHeader };
