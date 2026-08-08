/**
 * Table 1 (M / R / B) and YA-2026 compulsory relief constants from
 * LHDN Specification for MTD Computerized Calculation 2026 (`P-SPEC-2026`).
 *
 * Single source of truth: `db/seed/pcb-table1-2026.json`. Imported here
 * (statically, via `resolveJsonModule` — no filesystem I/O at runtime) rather
 * than hand-duplicated, so the seed file cannot silently drift from the
 * values the engine actually computes with.
 */
import table1Seed from "../../../db/seed/pcb-table1-2026.json" with {
  type: "json",
};

export interface PcbTable1Row {
  readonly fromSen: number;
  readonly toSen: number | null;
  readonly mSen: number;
  readonly rPct: number;
  readonly bCat1And3Sen: number;
  readonly bCat2Sen: number;
}

export interface PcbReliefs2026 {
  readonly individualSen: number;
  readonly spouseSen: number;
  readonly childSen: number;
  readonly disabledIndividualSen: number;
  readonly disabledSpouseSen: number;
}

/** EPF / approved-scheme qualifying amount per year (sen). */
export const PCB_EPF_ANNUAL_CAP_SEN: number = table1Seed.epfAnnualCapSen;

/** MTD below this (before current-month zakat) is not deducted unless elected. */
export const PCB_MIN_DEDUCT_SEN = 1_000;

export const PCB_RELIEFS_2026: PcbReliefs2026 = table1Seed.reliefs;

/**
 * Table 1 brackets. `fromSen` is inclusive (RM5,001.00 = 500_100 sen).
 * Published schedule uses RM5,001–20,000 etc.; the seed stores half-open
 * ranges in sen so every P ≥ RM5,001.00 maps (no 99-sen gaps). `toSen` is the
 * exclusive upper bound; `null` means unbounded (exceeding RM2,000,000).
 */
export const PCB_TABLE1_2026: readonly PcbTable1Row[] = table1Seed.table1;

export function lookupTable1(pSen: number): PcbTable1Row | null {
  for (const row of PCB_TABLE1_2026) {
    const belowHi = row.toSen === null || pSen < row.toSen;
    if (pSen >= row.fromSen && belowHi) {
      return row;
    }
  }
  return null;
}

export function table1B(row: PcbTable1Row, category: 1 | 2 | 3): number {
  return category === 2 ? row.bCat2Sen : row.bCat1And3Sen;
}
