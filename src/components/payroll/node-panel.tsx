import {
  AlertCircleIcon,
  ArrowRightIcon,
  BookOpenIcon,
  HashIcon,
  TableIcon,
} from "lucide-react";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MoneyCell } from "./money-cell";

interface CitationDto {
  ruleId: string;
  authority: string;
  reference: string;
  effectiveDate: string;
  displayText: string;
}

interface DerivedNode {
  key: string;
  kind:
    | "FORMULA"
    | "TABLE_LOOKUP"
    | "RATE"
    | "CAP"
    | "OVERRIDE"
    | "PASSTHROUGH"
    | "NOT_APPLICABLE";
  label: { key: string; params?: Record<string, string | number> };
  sen: number | null;
  citation: CitationDto | null;
  citationStatus: "RESOLVED" | "UNRESOLVED";
  flags: Array<"REVIEW_REQUIRED" | "UNVERIFIED" | "NOT_ENTERED">;
  children?: DerivedNode[];
}

const KIND_ICONS: Record<
  DerivedNode["kind"],
  React.ComponentType<{ className?: string }>
> = {
  FORMULA: ArrowRightIcon,
  TABLE_LOOKUP: TableIcon,
  RATE: HashIcon,
  CAP: HashIcon,
  OVERRIDE: AlertCircleIcon,
  PASSTHROUGH: ArrowRightIcon,
  NOT_APPLICABLE: BookOpenIcon,
};

function renderLabel(node: DerivedNode, _lang = "en"): string {
  // Labels come pre-keyed from the server. Render the key directly in Phase 5B.
  // Phase 8 will swap in a proper i18n lookup.
  const params = node.label.params ?? {};
  let text = node.label.key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, String(v));
  }
  return text;
}

interface NodePanelProps {
  node: DerivedNode;
  depth?: number;
  className?: string;
}

function NodePanel({ node, depth = 0, className }: NodePanelProps) {
  const Icon = KIND_ICONS[node.kind] ?? ArrowRightIcon;
  const indent = depth * 16;

  return (
    <div className={cn("flex flex-col gap-0", className)}>
      <div
        className="flex items-center justify-between rounded py-1.5 pr-3 hover:bg-muted/40"
        style={{ paddingLeft: `${indent + 12}px` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-foreground text-sm">
            {renderLabel(node)}
          </span>
          {node.flags.map((flag) => (
            <Badge
              className="text-xs"
              key={flag}
              style={{
                background: "var(--status-warn-fill)",
                color: "var(--status-warn-ink)",
                border: "none",
              }}
              variant="outline"
            >
              {flag}
            </Badge>
          ))}
          {node.citationStatus === "UNRESOLVED" && (
            <Badge
              className="text-xs"
              style={{
                background: "var(--status-bad-fill)",
                color: "var(--status-bad-ink)",
                border: "none",
              }}
              variant="outline"
            >
              Citation unavailable
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MoneyCell
            citationText={node.citation?.displayText}
            notApplicable={node.kind === "NOT_APPLICABLE"}
            sen={node.sen}
          />
          {node.citation !== null && (
            <Tooltip>
              <TooltipTrigger render={<span />}>
                <BookOpenIcon className="size-3 cursor-default text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                {node.citation.displayText}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {node.children?.map((child) => (
        <NodePanel depth={depth + 1} key={child.key} node={child} />
      ))}
    </div>
  );
}

export type { CitationDto, DerivedNode, NodePanelProps };
export { NodePanel };
