/**
 * @feature workspace
 * @layer ui
 * @hub src/server/routes/pay-run-workspace.ts
 *
 * Workspace totals strip — five aggregate tiles (Gross Pay, Employee EPF,
 * Employee SOCSO, PCB, Net Pay). Renders server-computed values only:
 * `MoneyCell` shows `currentSen`, `DeltaBadge` shows the server's
 * `VarianceDto` verbatim. Never recomputes variance client-side.
 *
 * Visual DNA: studio statistics-money-tile (statistics-component family).
 */

import {
  BanknoteIcon,
  LandmarkIcon,
  ShieldIcon,
  UmbrellaIcon,
  WalletIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { DeltaBadge } from "@/components/payroll/delta-badge";
import { MoneyCell } from "@/components/payroll/money-cell";
import StatisticsMoneyTile from "@/components/shadcn-studio/blocks/statistics-money-tile";
import type { AggregateTile } from "@/web/api/payroll-api";

interface TotalsStripProps {
  readonly tiles: readonly AggregateTile[];
}

const TILE_ICONS: Record<string, ReactNode> = {
  gross_pay: <BanknoteIcon />,
  net_pay: <WalletIcon />,
  epf_ee: <LandmarkIcon />,
  socso_ee: <ShieldIcon />,
  eis_ee: <UmbrellaIcon />,
};

function TotalsStrip({ tiles }: TotalsStripProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
      {tiles.map((tile) => (
        <StatisticsMoneyTile
          caption={<DeltaBadge variance={tile.variance} />}
          icon={TILE_ICONS[tile.key]}
          key={tile.key}
          title={tile.label}
          value={
            <MoneyCell
              className="block font-semibold text-foreground"
              sen={tile.currentSen}
            />
          }
        />
      ))}
    </div>
  );
}

export type { TotalsStripProps };
export { TotalsStrip };
