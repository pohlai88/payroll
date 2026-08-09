/**
 * @feature reports
 * @layer ui
 *
 * Vertical icon tabs (studio tabs-22 DNA).
 * Presentational shell — callers own Tabs value/content and data I/O.
 */

import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface VerticalIconTab {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
}

interface VerticalIconTabsProps {
  readonly tabs: readonly VerticalIconTab[];
  readonly value: string;
  readonly onValueChange: (value: string | number | null) => void;
  readonly children: ReactNode;
  readonly sidebarLabel?: string;
  readonly className?: string;
}

function VerticalIconTabs({
  tabs,
  value,
  onValueChange,
  children,
  sidebarLabel = "Sections",
  className,
}: VerticalIconTabsProps) {
  return (
    <Tabs
      className={cn(
        "min-h-[28rem] overflow-hidden rounded-xl border bg-card",
        className
      )}
      onValueChange={onValueChange}
      orientation="vertical"
      value={value}
    >
      <div className="w-56 shrink-0 space-y-1 border-r p-4">
        <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          {sidebarLabel}
        </p>
        <TabsList
          className="h-auto w-full flex-col bg-transparent p-0"
          variant="line"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              className="w-full justify-start gap-2 px-3 py-2 data-active:bg-primary/10 data-active:text-primary"
              key={tab.id}
              value={tab.id}
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-6">{children}</div>
    </Tabs>
  );
}

export { VerticalIconTabs };
