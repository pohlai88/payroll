import type { PcbInput } from "./types";

export interface PcbResult {
  /** null = PCB not entered — must never be treated as zero */
  netPcbSen: number | null;
  cp38Sen: number;
  verified: boolean;
}

/**
 * PCB/MTD is a controlled manual input: never computed, never silently zero.
 * Net PCB = max(PCB − zakat offset, 0). CP38 is a separate instructed deduction.
 */
export function pcbNet(input: PcbInput | null): PcbResult {
  if (!input || input.pcbAmountSen === null) {
    return {
      netPcbSen: null,
      cp38Sen: input?.cp38Sen ?? 0,
      verified: input?.verified ?? false,
    };
  }
  const net = Math.max(input.pcbAmountSen - input.zakatOffsetSen, 0);
  return { netPcbSen: net, cp38Sen: input.cp38Sen, verified: input.verified };
}
