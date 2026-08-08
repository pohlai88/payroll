import type { RuleSettings, SocsoBand, SocsoCategory, TraceStep } from "./types";

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
    return {
      erSen: 0,
      eeCoreSen: 0,
      eeSkbbkSen: 0,
      trace: { label: "SOCSO", detail: "No band matched; contribution 0" },
    };
  }
  const skbbkActive = periodEnd >= s.skbbkPhaseFrom && periodEnd <= s.skbbkPhaseTo;
  if (category === "FIRST") {
    return {
      erSen: band.cat1ErSen,
      eeCoreSen: band.cat1EeCoreSen,
      eeSkbbkSen: skbbkActive ? band.cat1EeSkbbkSen : 0,
      trace: {
        label: "SOCSO (First Category)",
        detail: `Act 4 band ${band.fromSen / 100}–${Math.min(band.toSen, s.socsoCeilingSen * 200) / 100}${skbbkActive ? " incl. SKBBK" : " (SKBBK outside phase window)"}`,
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
