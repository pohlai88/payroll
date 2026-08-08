import type { Band5, TraceStep } from "./types";

export interface EisResult {
  eeSen: number;
  erSen: number;
  trace: TraceStep;
}

/** EIS (Act 800) contribution. Zeros when ineligible. */
export function eis(
  wageSen: number,
  eligible: boolean,
  bands: Band5[]
): EisResult {
  if (!eligible || wageSen <= 0) {
    return {
      eeSen: 0,
      erSen: 0,
      trace: { label: "EIS", detail: "Not eligible", amountSen: 0 },
    };
  }
  const band = bands.find((b) => wageSen >= b.fromSen && wageSen <= b.toSen);
  if (!band) {
    // As with SOCSO: the Act 800 table is gap-free from zero upward, so a miss
    // is a broken rule pack rather than a zero-contribution employee.
    throw new RangeError(`eis: no Act 800 band covers wages of ${wageSen} sen`);
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
