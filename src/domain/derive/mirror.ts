/**
 * @feature derivation
 * @layer domain
 *
 * Proves the graph and the engine agree.
 *
 * The graph is emitted alongside `computeLine` rather than replacing its
 * arithmetic, so the only way they can disagree is a bug in the emitter. This
 * check runs over the 37 verified employees of the golden fixture, which means
 * any divergence surfaces against real payroll data before it can reach a
 * payslip — not against a toy case.
 */

import type { LineResult } from "../calc/types";
import {
  type DerivationGraph,
  ROOT_KEYS,
  type RootKey,
  readSen,
} from "./graph";

/** Maps each root to the `LineResult` field it must reproduce. */
const SCALAR_OF: Record<RootKey, (r: LineResult) => number | null> = {
  gross: (r) => r.grossSen,
  epfWages: (r) => r.epfWagesSen,
  socsoWages: (r) => r.socsoWagesSen,
  eisWages: (r) => r.eisWagesSen,
  epfEe: (r) => r.epfEeSen,
  epfEr: (r) => r.epfErSen,
  socsoEeCore: (r) => r.socsoEeCoreSen,
  socsoEeSkbbk: (r) => r.socsoEeSkbbkSen,
  socsoEr: (r) => r.socsoErSen,
  eisEe: (r) => r.eisEeSen,
  eisEr: (r) => r.eisErSen,
  pcbNet: (r) => r.pcbNetSen,
  cp38: (r) => r.cp38Sen,
  zakat: (r) => r.zakatSen,
  otherDeductions: (r) => r.otherDeductionsSen,
  deductionsTotal: (r) => r.deductionsTotalSen,
  net: (r) => r.netSen,
  hrdfLevy: (r) => r.hrdfLevySen,
  employerCost: (r) => r.employerCostSen,
};

export interface Divergence {
  readonly root: RootKey;
  readonly graphSen: number | null;
  readonly engineSen: number | null;
}

export function findDivergences(
  graph: DerivationGraph,
  result: LineResult
): Divergence[] {
  const out: Divergence[] = [];
  for (const root of ROOT_KEYS) {
    const graphSen = readSen(graph, root);
    const engineSen = SCALAR_OF[root](result);
    if (graphSen !== engineSen) {
      out.push({ root, graphSen, engineSen });
    }
  }
  return out;
}

export function assertMirrors(
  graph: DerivationGraph,
  result: LineResult
): void {
  const diffs = findDivergences(graph, result);
  if (diffs.length === 0) {
    return;
  }
  const detail = diffs
    .map(
      (d) =>
        `  ${d.root}: graph ${d.graphSen ?? "unknown"} vs engine ${d.engineSen ?? "unknown"}`
    )
    .join("\n");
  throw new Error(`derivation graph disagrees with the engine:\n${detail}`);
}
