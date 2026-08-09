/**
 * Employee-level graph diff tab — lazy-fetched on activation.
 * Shows NodeDiffRow[] grouped by kind (VALUE / ADDED / REMOVED / STRUCTURE / CITATION).
 */
import { useEffect, useState } from "react";
import { formatRM } from "@/domain/money";
import { formatApiError } from "@/web/api/format-error";
import type { NodeDiffRow, RunLineDiffDto } from "@/web/api/payroll-api";
import { fetchLineDiff } from "@/web/api/payroll-api";

interface EmployeeDiffProps {
  readonly runId: string;
  readonly lineId: string;
}

type DiffKind = NodeDiffRow["d"];

const KIND_ORDER: readonly DiffKind[] = [
  "VALUE",
  "ADDED",
  "REMOVED",
  "STRUCTURE",
  "CITATION",
];
const KIND_LABEL: Record<DiffKind, string> = {
  VALUE: "Changed values",
  ADDED: "Added nodes",
  REMOVED: "Removed nodes",
  STRUCTURE: "Structural changes",
  CITATION: "Source changes",
};

function deltaLabel(deltaSen: number): string {
  const sign = deltaSen > 0 ? "+" : "";
  return `${sign}RM ${formatRM(deltaSen)}`;
}

function ValueRow({ row }: { row: NodeDiffRow }) {
  return (
    <div className="flex items-start gap-3 border-border/50 border-b px-4 py-2 text-sm">
      <span className="min-w-0 flex-1 font-mono text-muted-foreground text-xs">
        {row.id}
      </span>
      <span className="shrink-0 text-xs">{row.label}</span>
      <div className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">{row.fromValue ?? "—"}</span>
        <span className="text-muted-foreground">→</span>
        <span>{row.toValue ?? "—"}</span>
        {row.deltaSen !== null && row.deltaSen !== 0 && (
          <span
            className={
              row.deltaSen > 0
                ? "font-medium text-[hsl(var(--status-ok-ink))]"
                : "font-medium text-destructive"
            }
          >
            ({deltaLabel(row.deltaSen)})
          </span>
        )}
      </div>
    </div>
  );
}

function SimpleRow({
  row,
  annotation,
}: {
  row: NodeDiffRow;
  annotation: string;
}) {
  return (
    <div className="flex items-center gap-3 border-border/50 border-b px-4 py-2 text-sm">
      <span className="min-w-0 flex-1 font-mono text-muted-foreground text-xs">
        {row.id}
      </span>
      <span className="shrink-0 text-xs">{row.label}</span>
      <span className="text-muted-foreground text-xs">{annotation}</span>
    </div>
  );
}

function StructureRow({ row }: { row: NodeDiffRow }) {
  return (
    <div className="border-border/50 border-b px-4 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 font-mono text-muted-foreground text-xs">
          {row.id}
        </span>
        <span className="shrink-0 text-xs">{row.label}</span>
      </div>
      {row.addedRefs.length > 0 && (
        <div className="mt-1 text-muted-foreground text-xs">
          + {row.addedRefs.join(", ")}
        </div>
      )}
      {row.removedRefs.length > 0 && (
        <div className="mt-0.5 text-muted-foreground text-xs line-through">
          {row.removedRefs.join(", ")}
        </div>
      )}
    </div>
  );
}

function DiffRow({ row }: { row: NodeDiffRow }) {
  switch (row.d) {
    case "VALUE":
      return <ValueRow row={row} />;
    case "ADDED":
      return <SimpleRow annotation="(added)" row={row} />;
    case "REMOVED":
      return <SimpleRow annotation="(removed)" row={row} />;
    case "STRUCTURE":
      return <StructureRow row={row} />;
    case "CITATION":
      return <SimpleRow annotation="(source changed)" row={row} />;
    default:
      return null;
  }
}

function EmployeeDiff({ runId, lineId }: EmployeeDiffProps) {
  const [data, setData] = useState<RunLineDiffDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    fetchLineDiff(runId, lineId)
      .then(setData)
      .catch((e) => setError(formatApiError(e, "Failed to load diff")));
  }, [runId, lineId]);

  if (error) {
    return <div className="p-4 text-destructive text-sm">{error}</div>;
  }
  if (!data) {
    return <div className="p-4 text-muted-foreground text-sm">Loading…</div>;
  }

  if (!data.priorRunId || data.diffs.length === 0) {
    return (
      <div className="p-4 text-muted-foreground text-sm">
        {data.priorRunId
          ? "No graph changes from prior run."
          : "No prior run linked — diff unavailable."}
      </div>
    );
  }

  const byKind = new Map<DiffKind, NodeDiffRow[]>();
  for (const d of data.diffs) {
    const arr = byKind.get(d.d) ?? [];
    arr.push(d);
    byKind.set(d.d, arr);
  }

  return (
    <div>
      <div className="border-b px-4 py-2 text-muted-foreground text-xs">
        Comparing <span className="font-mono">{data.runId}</span> vs{" "}
        <span className="font-mono">{data.priorRunId}</span>
      </div>
      {KIND_ORDER.filter((k) => byKind.has(k)).map((kind) => {
        const rows = byKind.get(kind);
        if (!rows) {
          return null;
        }
        return (
          <div key={kind}>
            <div className="flex items-center gap-2 bg-muted/30 px-4 py-1.5">
              <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                {KIND_LABEL[kind]}
              </span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                {rows.length}
              </span>
            </div>
            {rows.map((row) => (
              <DiffRow key={row.id} row={row} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export { EmployeeDiff };
