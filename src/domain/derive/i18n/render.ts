/**
 * Turns a `LabelRef` into a sentence in one of the supported languages.
 *
 * Deliberately hand-rolled rather than pulled from an ICU library: Malay has no
 * plural inflection and English needs it in about two places here, so a thirty
 * line substituter beats a dependency and keeps the engine free of runtime
 * imports.
 */

import { formatRM } from "../../money";
import type { LabelParam, LabelRef } from "../label";
import { EN, type MessageKey } from "./en";
import { MS } from "./ms";

export type Lang = "en" | "ms";

const DICT: Record<Lang, Record<MessageKey, string>> = { en: EN, ms: MS };

const MONTHS: Record<Lang, readonly string[]> = {
  en: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
  ms: [
    "Jan",
    "Feb",
    "Mac",
    "Apr",
    "Mei",
    "Jun",
    "Julai",
    "Ogos",
    "Sep",
    "Okt",
    "Nov",
    "Dis",
  ],
};

function formatDate(iso: string, lang: Lang): string {
  const [y, rawMonth, rawDay] = iso.split("-");
  const m = Number(rawMonth);
  const d = Number(rawDay);
  const month = MONTHS[lang][m - 1];
  if (y === undefined || month === undefined || Number.isNaN(d)) {
    return iso;
  }
  return `${d} ${month} ${y}`;
}

const TRAILING_ZEROS = /0+$/;

/** 1100 -> "11%", 550 -> "5.5%". Trailing zeros are dropped, so 11.00% never appears. */
export function formatPct(pctX100: number): string {
  const whole = pctX100 / 100;
  return `${Number.isInteger(whole) ? whole.toString() : whole.toFixed(2).replace(TRAILING_ZEROS, "")}%`;
}

function formatParam(param: LabelParam, lang: Lang): string {
  switch (param.t) {
    case "sen":
      return formatRM(param.sen);
    case "int":
      return param.n.toLocaleString("en-MY");
    case "num":
      return param.n.toFixed(param.dp);
    case "pct":
      return formatPct(param.pctX100);
    case "date":
      return formatDate(param.iso, lang);
    case "enum": {
      const key = `enum.${param.domain}.${param.code}` as MessageKey;
      return DICT[lang][key] ?? param.code;
    }
    case "text":
      return param.text;
    default: {
      // Typed as `never` so a new LabelParam variant fails the build here rather
      // than rendering as undefined on a payslip.
      const unhandled: never = param;
      throw new Error(`unhandled label param: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * Render a label. An unknown key cannot occur through the typed emit path, but
 * a graph loaded from storage predates the current dictionary, so we surface the
 * raw key rather than an empty string — a visible key is debuggable, a blank is not.
 */
export function renderLabel(label: LabelRef, lang: Lang = "en"): string {
  const template = DICT[lang][label.key as MessageKey];
  if (template === undefined) {
    return label.key;
  }
  const { params } = label;
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const param = params[name];
    return param === undefined ? whole : formatParam(param, lang);
  });
}

/** Every key referenced by a graph must exist in every language. Used by the conformance tests. */
export function hasKey(key: string, lang: Lang): boolean {
  return Object.hasOwn(DICT[lang], key);
}

export const LANGS: readonly Lang[] = ["en", "ms"];
