import type { Band5, TraceStep } from "./types";

export interface EisResult {
  eeSen: number;
  erSen: number;
  trace: TraceStep;
}

/** EIS (Act 800) contribution. Zeros when ineligible. */
export function eis(wageSen: number, eligible: boolean, bands: Band5[]): EisResult {
  if (!eligible || wageSen <= 0) {
    return { eeSen: 0, erSen: 0, trace: { label: "EIS", detail: "Not eligible", amountSen: 0 } };
  }
  const band = bands.find((b) => wageSen >= b.fromSen && wageSen <= b.toSen);
  if (!band) {
    return { eeSen: 0, erSen: 0, trace: { label: "EIS", detail: "No band matched; contribution 0" } };
  }
  return {
    eeSen: band.eeSen,
    erSen: band.erSen,
    trace: {
      label: "EIS",
      detail: `Act 800 band ${band.fromSen / 100}–${band.toSen / 100}`,
    },
  };
}
