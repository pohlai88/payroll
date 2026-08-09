/**
 * @feature pay-run
 * @layer domain
 *
 * Pure statutory calc (no I/O).
 */

import { computePcbAdditional } from "./pcb-additional";
import { splitRemunerationSen } from "./pcb-context";
import type { PcbComputeResult } from "./pcb-core";
import {
  computePcbCSuite,
  computePcbKnowledgeWorker,
  computePcbRep,
} from "./pcb-flat15";
import { computePcbNonResident, computePcbNormal } from "./pcb-normal";
import type {
  PayItemDef,
  PcbFormulaRegime,
  PcbInput,
  PcbMonthContext,
  PcbTaxProfile,
  ResolvedLineItem,
} from "./types";

/**
 * Official LHDN PCB / MTD HTML calculator for year 2026.
 *
 * Parity oracle and evidenced override source — never fetched or scraped at
 * payroll runtime. Query flags matter:
 * - `PRV_YEAR=true` — prior-year / accumulated remuneration basis
 * - `FRS_REC=true` — FRS recording mode for TP3-style continuity
 */
export const LHDN_PCB_CALCULATOR_2026_URL =
  "https://calcpcbplus.hasil.gov.my/HITS_CE/x2026?PRV_YEAR=true&FRS_REC=true";

/** `rule_sources.ref` for the calculator — natural value of `pcb_entries.source`. */
export const LHDN_PCB_CALCULATOR_SOURCE_REF = "P-CALC-2026";

export type PcbResolutionPath = "OVERRIDE" | "COMPUTED" | "ENTERED" | "MISSING";

export interface PcbResult {
  /** null = PCB unknown — must never be treated as zero when applicable */
  netPcbSen: number | null;
  /** Gross MTD before current-month zakat (null when unknown). */
  grossPcbSen: number | null;
  cp38Sen: number;
  verified: boolean;
  path: PcbResolutionPath;
  /** Formula path when gross came from offline compute. */
  computePath?: PcbComputeResult["path"];
}

export function hasPcbComputeContext(
  input: PcbInput | null | undefined
): input is PcbInput & {
  taxProfile: PcbTaxProfile;
  monthContext: PcbMonthContext;
} {
  return (
    input != null && input.taxProfile != null && input.monthContext != null
  );
}

function regimeOf(profile: PcbTaxProfile): PcbFormulaRegime {
  return profile.formulaRegime ?? "NORMAL";
}

/**
 * Offline PCB compute: dispatches Normal / Additional / REP / KW / C-Suite /
 * non-resident from the tax profile and month context.
 */
export function computePcb(
  profile: PcbTaxProfile,
  month: PcbMonthContext
): PcbComputeResult {
  if (profile.residence === "NON_RESIDENT") {
    return computePcbNonResident(
      month.y1Sen,
      month.electDeductBelowRm10 ?? false,
      month.ytSen ?? 0
    );
  }

  switch (regimeOf(profile)) {
    case "REP":
      return computePcbRep(profile, month);
    case "KNOWLEDGE_WORKER":
      return computePcbKnowledgeWorker(profile, month);
    case "C_SUITE":
      return computePcbCSuite(profile, month);
    default: {
      const yt = month.ytSen ?? 0;
      const kt = month.ktSen ?? 0;
      if (yt > 0 || kt > 0) {
        return computePcbAdditional(profile, month);
      }
      return computePcbNormal(profile, month);
    }
  }
}

/**
 * Resolve gross PCB for the month (before current-month zakat).
 *
 * Dual path (compute-first with evidenced override):
 * 1. Verified override amount present → use it
 * 2. Else tax profile + month context complete → offline compute
 * 3. Else entered (unverified) amount → use it (legacy / draft entry)
 * 4. Else → null
 */
export function resolveGrossPcbSen(input: PcbInput | null): {
  grossPcbSen: number | null;
  path: PcbResolutionPath;
  verified: boolean;
  computePath?: PcbComputeResult["path"];
} {
  if (!input) {
    return { grossPcbSen: null, path: "MISSING", verified: false };
  }

  if (input.pcbAmountSen !== null && input.verified) {
    return {
      grossPcbSen: input.pcbAmountSen,
      path: "OVERRIDE",
      verified: true,
    };
  }

  if (hasPcbComputeContext(input)) {
    const computed = computePcb(input.taxProfile, input.monthContext);
    return {
      grossPcbSen: computed.mtdSen,
      path: "COMPUTED",
      verified: false,
      computePath: computed.path,
    };
  }

  if (input.pcbAmountSen !== null) {
    return {
      grossPcbSen: input.pcbAmountSen,
      path: "ENTERED",
      verified: input.verified,
    };
  }

  return { grossPcbSen: null, path: "MISSING", verified: false };
}

/**
 * Fill Y1/Yt/K1 from this month's earnings and EPF when the loader marked
 * `autoRemunerationFromItems` (pcb_entries.y1_sen is null).
 */
export function enrichPcbForCompute(
  pcb: PcbInput | null,
  items: readonly ResolvedLineItem[],
  epfEeSen: number,
  matrix?: ReadonlyMap<string, PayItemDef>
): PcbInput | null {
  if (
    pcb == null ||
    pcb.taxProfile == null ||
    pcb.monthContext == null ||
    !pcb.autoRemunerationFromItems
  ) {
    return pcb;
  }

  const split = splitRemunerationSen(items, matrix);
  const ytSen =
    (pcb.monthContext.ytSen ?? 0) > 0
      ? (pcb.monthContext.ytSen ?? 0)
      : split.ytSen;
  const ktSen = pcb.monthContext.ktSen ?? 0;
  const k1Sen = Math.max(0, epfEeSen - ktSen);

  return {
    ...pcb,
    monthContext: {
      ...pcb.monthContext,
      y1Sen: split.y1Sen,
      ytSen,
      k1Sen,
      ktSen,
    },
  };
}

/**
 * Net PCB = max(gross − current-month zakat, 0). CP38 is separate.
 */
export function pcbNet(input: PcbInput | null): PcbResult {
  const resolved = resolveGrossPcbSen(input);
  const zakat = input?.zakatOffsetSen ?? 0;
  const cp38Sen = input?.cp38Sen ?? 0;

  if (resolved.grossPcbSen === null) {
    return {
      netPcbSen: null,
      grossPcbSen: null,
      cp38Sen,
      verified: resolved.verified,
      path: resolved.path,
    };
  }

  const net = Math.max(resolved.grossPcbSen - zakat, 0);
  return {
    netPcbSen: net,
    grossPcbSen: resolved.grossPcbSen,
    cp38Sen,
    verified: resolved.verified,
    path: resolved.path,
    ...(resolved.computePath === undefined
      ? {}
      : { computePath: resolved.computePath }),
  };
}

// biome-ignore lint/performance/noBarrelFile: pcb.ts is the PCB engine's composition root; callers outside this folder import it here, not the pcb-*.ts internals.
export { computePcbAdditional } from "./pcb-additional";
export {
  type PcbChildClaim,
  type PcbChildKind,
  qualifyingChildUnits,
} from "./pcb-children";
export {
  buildPcbMonthContext,
  monthsRemainingAfter,
  splitRemunerationSen,
} from "./pcb-context";
export {
  computePcbCSuite,
  computePcbKnowledgeWorker,
  computePcbRep,
} from "./pcb-flat15";
export {
  computePcbNonResident,
  computePcbNormal,
  estimateK2Sen,
} from "./pcb-normal";
export type { Tp1Claim, Tp1ReliefCode, Tp1ReliefGroup } from "./pcb-tp1";
export {
  sumTp1ClaimsSen,
  TP1_ANNUAL_CAP_SEN,
  TP1_CODE_META,
  TP1_GROUP_CAP_SEN,
} from "./pcb-tp1";
