import { pctRoundUpToRinggitSen } from "../money";
import type { Band5, EpfPart, RuleSettings, TraceStep } from "./types";

export interface EpfResult {
  eeSen: number;
  erSen: number;
  trace: TraceStep;
}

/**
 * Index of the Third Schedule band covering `wageSen`, or -1 if none does.
 *
 * The single EPF band-selection algorithm: `epf()` below and the derivation
 * graph (`derive/emit.ts`) both call this rather than each re-implementing
 * "find the band containing this wage", so a change to the search — or to a
 * boundary condition — cannot make the calculated figure and its explanation
 * disagree on which row produced it.
 */
export function findEpfBandIndex(bands: Band5[], wageSen: number): number {
  // bands sorted ascending; binary search
  let lo = 0;
  let hi = bands.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const b = bands[mid];
    if (b === undefined) {
      break;
    }
    if (wageSen < b.fromSen) {
      hi = mid - 1;
    } else if (wageSen > b.toSen) {
      lo = mid + 1;
    } else {
      return mid;
    }
  }
  return -1;
}

/**
 * EPF contribution. Wages ≤ RM20,000 use the Third Schedule band table for the
 * employee's part; above the table ceiling, statutory percentages apply with
 * round-up-to-next-ringgit.
 */
export function epf(
  wageSen: number,
  part: EpfPart,
  tables: Record<"A" | "C" | "E", Band5[]>,
  s: RuleSettings
): EpfResult {
  if (part === "NONE" || wageSen <= 0) {
    return {
      eeSen: 0,
      erSen: 0,
      trace: { label: "EPF", detail: "Not applicable", amountSen: 0 },
    };
  }

  if (part === "F") {
    const ee = pctRoundUpToRinggitSen(wageSen, s.epfPartFEePct);
    const er = pctRoundUpToRinggitSen(wageSen, s.epfPartFErPct);
    return {
      eeSen: ee,
      erSen: er,
      trace: {
        label: "EPF (Part F)",
        detail: `EE ${s.epfPartFEePct}% / ER ${s.epfPartFErPct}% of wages, rounded up to next ringgit`,
      },
    };
  }

  if (wageSen <= s.epfTableCeilingSen) {
    const index = findEpfBandIndex(tables[part], wageSen);
    const band = index < 0 ? null : tables[part][index];
    if (!band) {
      // The Third Schedule runs unbroken from one sen to the table ceiling, and
      // this branch is only reached inside that range — the RM0.01–RM10 rows are
      // present with zero contributions rather than absent. A miss is therefore a
      // gap in the rule pack, and zeroing it would silently under-deduct.
      throw new RangeError(
        `epf: no Third Schedule Part ${part} band covers wages of ${wageSen} sen`
      );
    }
    return {
      eeSen: band.eeSen,
      erSen: band.erSen,
      trace: {
        label: `EPF (Part ${part})`,
        detail: `Third Schedule band ${band.fromSen / 100}–${band.toSen / 100}`,
      },
    };
  }

  // above table ceiling: percentage per part
  let eePct: number;
  let erPct: number;
  if (part === "C") {
    eePct = s.epfPartCAboveEePct;
    erPct = s.epfPartCAboveErPct;
  } else if (part === "E") {
    eePct = s.epfPartEAboveEePct;
    erPct = s.epfPartEAboveErPct;
  } else {
    eePct = s.epfAboveEePct;
    erPct =
      wageSen <= s.epfErThresholdSen
        ? s.epfAboveErPctLeThreshold
        : s.epfAboveErPctGtThreshold;
  }
  return {
    eeSen: pctRoundUpToRinggitSen(wageSen, eePct),
    erSen: pctRoundUpToRinggitSen(wageSen, erPct),
    trace: {
      label: `EPF (Part ${part})`,
      detail: `Above table ceiling: EE ${eePct}% / ER ${erPct}%, rounded up to next ringgit`,
    },
  };
}
