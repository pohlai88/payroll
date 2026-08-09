/**
 * @feature workspace
 * @layer ui
 * @hub src/server/routes/pay-run-workspace.ts
 *
 * Run-level diff panel — summarises which employees changed vs the prior run.
 * Uses workspace-loaded data only; no additional fetch. The badge reads
 * `rootVariances.net` from the server, so direction and bps are both real.
 */
import { DeltaBadge } from "@/components/payroll/delta-badge";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { EmployeeLineDto } from "@/web/api/payroll-api";

interface RunDiffPanelProps {
  readonly lines: readonly EmployeeLineDto[];
}

function RunDiffPanel({ lines }: RunDiffPanelProps) {
  const changed = lines.filter((l) => l.variance?.hasChanges === true);

  if (changed.length === 0) {
    return (
      <div className="border-b bg-muted/30 px-6 py-3 text-muted-foreground text-sm">
        No changes from prior run.
      </div>
    );
  }

  return (
    <div className="border-b bg-muted/30">
      <div className="px-6 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
        Changes from prior run — {changed.length} employee
        {changed.length === 1 ? "" : "s"}
      </div>
      <Table>
        <TableBody>
          {changed.map((line) => {
            const changedRootKeys = line.variance?.changedRootKeys ?? [];
            return (
              <TableRow key={line.employeeId}>
                <TableCell className="px-6 py-1.5 text-foreground">
                  {line.employeeName}
                </TableCell>
                <TableCell className="px-2 py-1.5">
                  {line.variance != null && line.rootVariances?.net != null ? (
                    <DeltaBadge variance={line.rootVariances.net} />
                  ) : null}
                </TableCell>
                <TableCell className="px-4 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {changedRootKeys.slice(0, 6).map((key) => (
                      <span
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs"
                        key={key}
                      >
                        {key}
                      </span>
                    ))}
                    {changedRootKeys.length > 6 && (
                      <span className="text-muted-foreground text-xs">
                        +{changedRootKeys.length - 6} more
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export { RunDiffPanel };
