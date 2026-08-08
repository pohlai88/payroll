/**
 * Workspace totals strip — five aggregate tiles (Gross Pay, Employee EPF,
 * Employee SOCSO, PCB, Net Pay). Renders server-computed values only:
 * `MoneyCell` shows `currentSen`, `DeltaBadge` shows the server's
 * `VarianceDto` verbatim. Never recomputes variance client-side.
 */

import { DeltaBadge } from "@/components/payroll/delta-badge";
import { MoneyCell } from "@/components/payroll/money-cell";
import { Card, CardContent } from "@/components/ui/card";
import type { AggregateTile } from "@/web/api/payroll-api";

interface TotalsStripProps {
  readonly tiles: readonly AggregateTile[];
}

function TotalsStrip({ tiles }: TotalsStripProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <Card className="ring-1 ring-foreground/10" key={tile.key}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-muted-foreground text-xs">
                {tile.label}
              </p>
              <DeltaBadge variance={tile.variance} />
            </div>
            <MoneyCell
              className="mt-1 block font-semibold text-foreground text-lg"
              sen={tile.currentSen}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export type { TotalsStripProps };
export { TotalsStrip };
