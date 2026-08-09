/**
 * The 19 named sen roots every pay line carries — see `src/db/schema/run.ts`
 * `payLines`. Shared by workspace and payslip so the two read models cannot
 * drift on which columns map to which root keys.
 */

import type { payLines } from "@/db/schema/run";

export const ROOT_KEYS = [
  "gross",
  "epfWages",
  "socsoWages",
  "eisWages",
  "epfEe",
  "epfEr",
  "socsoEeCore",
  "socsoEeSkbbk",
  "socsoEr",
  "eisEe",
  "eisEr",
  "pcbNet",
  "cp38",
  "zakat",
  "otherDeductions",
  "deductionsTotal",
  "net",
  "hrdf",
  "employerCost",
] as const;

export type RootKey = (typeof ROOT_KEYS)[number];

export interface RootValue {
  readonly sen: number | null;
  readonly notApplicable: boolean;
}

type PayLineRow = typeof payLines.$inferSelect;

function rootValue(sen: number | null): RootValue {
  return { sen, notApplicable: false };
}

export function buildRootsFromLine(
  line: PayLineRow
): Record<RootKey, RootValue> {
  return {
    gross: rootValue(line.grossSen),
    epfWages: rootValue(line.epfWagesSen),
    socsoWages: rootValue(line.socsoWagesSen),
    eisWages: rootValue(line.eisWagesSen),
    epfEe: rootValue(line.epfEeSen),
    epfEr: rootValue(line.epfErSen),
    socsoEeCore: rootValue(line.socsoEeCoreSen),
    socsoEeSkbbk: rootValue(line.socsoEeSkbbkSen),
    socsoEr: rootValue(line.socsoErSen),
    eisEe: rootValue(line.eisEeSen),
    eisEr: rootValue(line.eisErSen),
    // null sen = unknown (not entered / pending), not statute N/A.
    pcbNet: rootValue(line.pcbNetSen),
    cp38: rootValue(line.cp38Sen),
    zakat: rootValue(line.zakatSen),
    otherDeductions: rootValue(line.otherDeductionsSen),
    deductionsTotal: rootValue(line.deductionsTotalSen),
    net: rootValue(line.netSen),
    hrdf: rootValue(line.hrdfSen),
    employerCost: rootValue(line.employerCostSen),
  };
}
