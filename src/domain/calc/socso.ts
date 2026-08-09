/**
 * @feature pay-run
 * @layer domain
 *
 * Pure statutory calc (no I/O).
 */

import { isIsoDate } from "../date";
import type {
  RuleSettings,
  SocsoBand,
  SocsoCategory,
  TraceStep,
} from "./types";

export interface SocsoResult {
  erSen: number;
  eeCoreSen: number;
  eeSkbbkSen: number;
  trace: TraceStep;
}

/**
 * SOCSO (PERKESO Act 4) contribution including the SKBBK employee-borne
 * supplement. FIRST category (<60): ER + EE core + EE SKBBK. SECOND (60+):
 * ER only + EE SKBBK. SKBBK applies only inside its phase window.
 */
export function socso(
  wageSen: number,
  category: SocsoCategory,
  bands: SocsoBand[],
  periodEnd: string,
  s: RuleSettings
): SocsoResult {
  if (category === "NONE" || wageSen <= 0) {
    return {
      erSen: 0,
      eeCoreSen: 0,
      eeSkbbkSen: 0,
      trace: { label: "SOCSO", detail: "Not applicable", amountSen: 0 },
    };
  }
  const band = bands.find((b) => wageSen >= b.fromSen && wageSen <= b.toSen);
  if (!band) {
    // The Act 4 table covers every wage from zero upward, so a miss means the
    // rule pack has a gap. Returning zero would under-deduct silently and put a
    // wrong figure on a payslip; a misconfigured pack must stop the run.
    throw new RangeError(`socso: no Act 4 band covers wages of ${wageSen} sen`);
  }
  // The window test is a lexicographic string comparison, which is only sound
  // for well-formed ISO dates. "2026-5-31" sorts after "2026-06-01" and would
  // silently switch SKBBK on a month before the phase started.
  for (const [what, value] of [
    ["periodEnd", periodEnd],
    ["skbbkPhaseFrom", s.skbbkPhaseFrom],
    ["skbbkPhaseTo", s.skbbkPhaseTo],
  ] as const) {
    if (!isIsoDate(value)) {
      throw new RangeError(
        `socso: ${what} must be ISO yyyy-mm-dd, got ${JSON.stringify(value)}`
      );
    }
  }
  const skbbkActive =
    periodEnd >= s.skbbkPhaseFrom && periodEnd <= s.skbbkPhaseTo;
  if (category === "FIRST") {
    return {
      erSen: band.cat1ErSen,
      eeCoreSen: band.cat1EeCoreSen,
      eeSkbbkSen: skbbkActive ? band.cat1EeSkbbkSen : 0,
      trace: {
        label: "SOCSO (First Category)",
        // `band.toSen` is a sentinel far above the real wage ceiling for the
        // open-ended top band (see socso-skbbk.json), so it is capped at the
        // ceiling — already in sen — before display rather than shown as-is.
        detail: `Act 4 band ${band.fromSen / 100}–${Math.min(band.toSen, s.socsoCeilingSen) / 100}${skbbkActive ? " incl. SKBBK" : " (SKBBK outside phase window)"}`,
      },
    };
  }
  return {
    erSen: band.cat2ErSen,
    eeCoreSen: 0,
    eeSkbbkSen: skbbkActive ? band.cat2EeSkbbkSen : 0,
    trace: {
      label: "SOCSO (Second Category)",
      detail: `Act 4 band; employer only${skbbkActive ? " + employee SKBBK" : ""}`,
    },
  };
}
