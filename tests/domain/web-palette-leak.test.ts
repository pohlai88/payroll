import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...walk(path));
    } else if (/\.(tsx|ts|css)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const PALETTE_UTIL =
  /\b(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
/** Hand-rolled light/dark palette splits — status/semantic tokens already remap. */
const DARK_PALETTE_SPLIT =
  /\bdark:(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
/** Recharts ships hardcoded stroke/fill attrs; selectors that match them are not palette leaks. */
const RECHARTS_ATTR_SELECTOR =
  /\[[^\]]*(?:stroke|fill)=['"]#[0-9a-fA-F]{3,8}['"][^\]]*\]/g;

const ROOTS = [
  resolve("src/web"),
  resolve("src/components"),
  resolve("src/assets"),
];
const TOKEN_FILES = new Set([
  resolve("src/web/styles.css"),
  resolve("src/web/payrun/payslip-document/payslip-print.css"),
]);

function leaksPalette(source: string): boolean {
  const text = source.replace(RECHARTS_ATTR_SELECTOR, "");
  return (
    HEX.test(text) || PALETTE_UTIL.test(text) || DARK_PALETTE_SPLIT.test(text)
  );
}

describe("app palette leak guard", () => {
  it("does not use raw hex, Tailwind palette utilities, or dark: palette splits outside token CSS", () => {
    const files = ROOTS.flatMap(walk).filter((path) => !TOKEN_FILES.has(path));
    const offenders: string[] = [];
    for (const file of files) {
      if (leaksPalette(readFileSync(file, "utf8"))) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
