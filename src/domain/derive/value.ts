/**
 * Values a derivation node can carry.
 *
 * The distinction that matters most here is between `SEN` (a settled money
 * figure) and `EXACT_SEN` (money that has been computed but not yet rounded).
 * `money.ts` fuses multiplication and rounding into single calls, so without a
 * separate pre-rounding type the exact value has nowhere to live and rounding
 * becomes invisible. Making it a distinct type lets `assertRoundingDiscipline`
 * mechanically prove that every rounded figure passed through a ROUNDING node.
 */

/** An exact rational in sen. `den` is always > 0. Lossless for every operation money.ts performs. */
export interface Exact {
  readonly num: number;
  readonly den: number;
}

export type EnumDomain =
  | "EPF_PART"
  | "SOCSO_CATEGORY"
  | "PAY_BASIS"
  | "EIS_ELIGIBILITY"
  | "PCB_SOURCE"
  | "VERIFICATION_STATUS";

export type CountUnit = "DAY" | "HOUR" | "YEAR" | "ITEM";

/** A whole row of a statutory band table, carried verbatim from the rule pack. */
export interface TableRow {
  readonly fromSen: number;
  readonly toSen: number;
  /** eeSen/erSen for EPF and EIS; cat1ErSen/cat1EeCoreSen/... for SOCSO. */
  readonly columns: Readonly<Record<string, number>>;
}

export type NodeValue =
  /** A settled money figure, integer sen. The only money type allowed at a graph root. */
  | { readonly t: "SEN"; readonly sen: number }
  /** Money before rounding. May only be consumed by a ROUNDING node. */
  | { readonly t: "EXACT_SEN"; readonly exact: Exact; readonly approxSen: number }
  /** Deliberately unknown — PCB not entered. Never coerced to zero. */
  | { readonly t: "SEN_UNKNOWN" }
  | { readonly t: "ROW"; readonly row: TableRow }
  | { readonly t: "ENUM"; readonly domain: EnumDomain; readonly code: string }
  | { readonly t: "BOOL"; readonly value: boolean }
  | { readonly t: "COUNT"; readonly value: number; readonly unit: CountUnit }
  /** Percentage held as hundredths so 5.5% is the integer 550, never a float. */
  | { readonly t: "RATE_PCT"; readonly pctX100: number }
  | { readonly t: "DATE"; readonly iso: string };

export const sen = (v: number): NodeValue => ({ t: "SEN", sen: v });
export const exactSen = (exact: Exact, approxSen: number): NodeValue => ({
  t: "EXACT_SEN",
  exact,
  approxSen,
});
export const senUnknown = (): NodeValue => ({ t: "SEN_UNKNOWN" });
export const row = (r: TableRow): NodeValue => ({ t: "ROW", row: r });
export const enumValue = (domain: EnumDomain, code: string): NodeValue => ({
  t: "ENUM",
  domain,
  code,
});
export const bool = (value: boolean): NodeValue => ({ t: "BOOL", value });
export const count = (value: number, unit: CountUnit): NodeValue => ({ t: "COUNT", value, unit });
export const ratePct = (pctX100: number): NodeValue => ({ t: "RATE_PCT", pctX100 });
export const date = (iso: string): NodeValue => ({ t: "DATE", iso });

/** Percentages arrive from the rule pack as decimal numbers (5.5); store them exactly. */
export const pctFromNumber = (pct: number): NodeValue => ratePct(Math.round(pct * 100));

/**
 * The settled sen value of a node, or null when it is deliberately unknown.
 * Throws on any non-money value — callers asking for money from a classification
 * node have a bug, and silently returning 0 is exactly what this system exists
 * to prevent.
 */
export function senOf(v: NodeValue): number | null {
  if (v.t === "SEN") return v.sen;
  if (v.t === "SEN_UNKNOWN") return null;
  throw new Error(`expected a settled money value, got ${v.t}`);
}
