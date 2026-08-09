/**
 * A digest, shown short and copied in full.
 *
 * Sixty-four hex characters is unreadable and comparing two of them by eye is
 * how people convince themselves that two different files are the same one.
 * The chip shows enough to recognise, the title carries the whole value, and
 * the click puts the whole value on the clipboard for an actual comparison.
 */

import { CheckIcon, CopyIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const HEAD = 8;
const TAIL = 6;
const COPIED_FEEDBACK_MS = 1200;

interface HashChipProps {
  readonly value: string;
  /** What the copy button announces, e.g. "manifest sha256". */
  readonly label: string;
  readonly className?: string;
}

export function shortHash(value: string): string {
  if (value.length <= HEAD + TAIL + 1) {
    return value;
  }
  return `${value.slice(0, HEAD)}…${value.slice(-TAIL)}`;
}

function HashChip({ value, label, className }: HashChipProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // A denied clipboard permission is not worth an error state: the full
      // value is in the title attribute and selectable either way.
    }
  }, [value]);

  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
      onClick={handleCopy}
      title={value}
      type="button"
    >
      <span>{shortHash(value)}</span>
      {copied ? (
        <CheckIcon aria-hidden className="size-3 text-[var(--status-ok-ink)]" />
      ) : (
        <CopyIcon aria-hidden className="size-3 opacity-60" />
      )}
      <span className="sr-only">
        {copied ? `Copied ${label}` : `Copy ${label}`}
      </span>
    </button>
  );
}

export type { HashChipProps };
export { HashChip };
