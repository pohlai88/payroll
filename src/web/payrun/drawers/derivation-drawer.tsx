/**
 * @feature derivation
 * @layer ui
 * @hub src/server/routes/pay-run-derivation.ts
 *
 * Derivation tab — fetches `GET /v1/pay-runs/:runId/lines/:lineId/derivation`
 * and renders the `NodePanel` tree for the selected root.
 */

import { useCallback, useEffect, useState } from "react";
import type { DerivedNode } from "@/components/payroll/node-panel";
import { NodePanel } from "@/components/payroll/node-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatApiError } from "@/web/api/format-error";
import type { EmployeeLineDto } from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";

interface DerivationDrawerProps {
  readonly runId: string;
  readonly roots: EmployeeLineDto["roots"];
  /** Identifies which employee/line the `roots` belong to — used to reset
   * `selectedRoot` when the drawer is switched to a different line without
   * unmounting (e.g. slide-over kept open across an employee switch). */
  readonly lineId: string;
}

function DerivationDrawer({ runId, roots, lineId }: DerivationDrawerProps) {
  const rootKeys = Object.keys(roots);
  const [selectedRoot, setSelectedRoot] = useState(rootKeys[0] ?? "");
  const [node, setNode] = useState<DerivedNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValueChange = useCallback((value: string | null) => {
    setSelectedRoot(value ?? "");
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset must run only when lineId (identity) changes, not on every roots re-render
  useEffect(() => {
    setSelectedRoot(rootKeys[0] ?? "");
  }, [lineId]);

  useEffect(() => {
    if (selectedRoot === "") {
      setNode(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    payrollApi
      .getLineDerivation(runId, lineId, selectedRoot)
      .then((dto) => {
        if (cancelled) {
          return;
        }
        setNode(dto.node as DerivedNode | null);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setNode(null);
        setError(formatApiError(err));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [runId, lineId, selectedRoot]);

  return (
    <div className="flex flex-col gap-4">
      <Select onValueChange={handleValueChange} value={selectedRoot}>
        <SelectTrigger>
          <SelectValue placeholder="Select a root…" />
        </SelectTrigger>
        <SelectContent>
          {rootKeys.map((key) => (
            <SelectItem key={key} value={key}>
              {key}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedRoot !== "" && (
        <div className="rounded-md border border-border p-3">
          {loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : null}
          {!loading && error ? (
            <p className="text-destructive text-xs">{error}</p>
          ) : null}
          {!(loading || error) && node ? <NodePanel node={node} /> : null}
          {loading || error || node ? null : (
            <>
              <p className="text-muted-foreground text-xs">
                Root: <span className="font-mono">{selectedRoot}</span>
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                No derivation nodes for this root.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export type { DerivationDrawerProps };
export { DerivationDrawer };
