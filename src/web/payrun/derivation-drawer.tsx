/**
 * Derivation tab — renders the `NodePanel` tree for a selected root when the
 * server has attached derivation nodes. The current workspace DTO
 * (`src/repo/workspace.ts` `EmployeeLineDto.roots`) only carries `{ sen,
 * notApplicable }` per root; the derivation graph endpoint
 * (`GET /v1/pay-runs/:id/lines/:employeeId/derivation`) is a later phase. This
 * component checks defensively for a `nodes` field on the root value so it
 * activates automatically once the server starts sending it, without a code
 * change here.
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
import type { EmployeeLineDto } from "@/web/api/payroll-api";

interface DerivationDrawerProps {
  readonly roots: EmployeeLineDto["roots"];
  /** Identifies which employee/line the `roots` belong to — used to reset
   * `selectedRoot` when the drawer is switched to a different line without
   * unmounting (e.g. slide-over kept open across an employee switch). */
  readonly lineId: string;
}

function derivationNodeFor(
  roots: EmployeeLineDto["roots"],
  key: string
): DerivedNode | null {
  const rootValue = roots[key] as unknown;
  if (
    typeof rootValue === "object" &&
    rootValue !== null &&
    "nodes" in rootValue
  ) {
    const { nodes } = rootValue as { nodes?: unknown };
    if (Array.isArray(nodes) && nodes.length > 0) {
      return nodes[0] as DerivedNode;
    }
  }
  return null;
}

function DerivationDrawer({ roots, lineId }: DerivationDrawerProps) {
  const rootKeys = Object.keys(roots);
  const [selectedRoot, setSelectedRoot] = useState(rootKeys[0] ?? "");
  const node =
    selectedRoot === "" ? null : derivationNodeFor(roots, selectedRoot);

  const handleValueChange = useCallback((value: string | null) => {
    setSelectedRoot(value ?? "");
  }, []);

  // Reset to the new line's default root whenever the identity changes —
  // avoids showing a stale/invalid root key carried over from a prior
  // employee if this component stays mounted across a line switch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset must run only when lineId (identity) changes, not on every roots re-render
  useEffect(() => {
    setSelectedRoot(rootKeys[0] ?? "");
  }, [lineId]);

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
          {node ? (
            <NodePanel node={node} />
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                Root: <span className="font-mono">{selectedRoot}</span>
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                Derivation not yet available. The derivation graph endpoint is a
                later phase — this will render the calculation tree once the
                server attaches it to this root.
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
