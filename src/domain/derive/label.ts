/**
 * @feature derivation
 * @layer domain
 *
 * Nodes never store prose.
 *
 * They store a message key plus typed parameters, and the sentence is rendered
 * at display time. That is what lets one graph render in English and Malay
 * without the two ever disagreeing with each other or with the numbers — the
 * old engine interpolated English into the trace at compute time, which is why
 * the payslip could only ever be English and why the words could drift from the
 * figures they described.
 *
 * `MessageKey` is derived from the English dictionary, so an unknown key is a
 * compile error at the emit site, and `ms.ts` is typed as a total map over the
 * same keys, so a missing translation is a compile error too.
 */

import type { EnumDomain } from "./value";

export type LabelParam =
  | { readonly t: "sen"; readonly sen: number }
  | { readonly t: "int"; readonly n: number }
  | { readonly t: "num"; readonly n: number; readonly dp: number }
  | { readonly t: "pct"; readonly pctX100: number }
  | { readonly t: "date"; readonly iso: string }
  | { readonly t: "enum"; readonly domain: EnumDomain; readonly code: string }
  /** Proper nouns only — employee names, pay item codes. Never a translatable phrase. */
  | { readonly t: "text"; readonly text: string };

export interface LabelRef<K extends string = string> {
  readonly key: K;
  readonly params?: Readonly<Record<string, LabelParam>>;
}

export const p = {
  sen: (sen: number): LabelParam => ({ t: "sen", sen }),
  int: (n: number): LabelParam => ({ t: "int", n }),
  num: (n: number, dp = 2): LabelParam => ({ t: "num", n, dp }),
  pct: (pctX100: number): LabelParam => ({ t: "pct", pctX100 }),
  pctOf: (pct: number): LabelParam => ({
    t: "pct",
    pctX100: Math.round(pct * 100),
  }),
  date: (iso: string): LabelParam => ({ t: "date", iso }),
  enum: (domain: EnumDomain, code: string): LabelParam => ({
    t: "enum",
    domain,
    code,
  }),
  text: (text: string): LabelParam => ({ t: "text", text }),
};
