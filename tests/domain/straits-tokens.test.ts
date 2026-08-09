/**
 * @feature pay-run
 * @layer test
 *
 * Theme contract: SPA uses stock shadcn CSS; --doc-* lives only in
 * light-theme print CSS (never remapped under .dark).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const shadcnPath = resolve("src/web/shadcn.css");
const printPath = resolve(
  "src/web/payrun/payslip-document/payslip-print.css"
);
const shadcn = () => readFileSync(shadcnPath, "utf8");
const printCss = () => readFileSync(printPath, "utf8");

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function channelToHex(value: number): string {
  const encoded =
    value <= 0.003_130_8 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  const byte = Math.max(0, Math.min(255, Math.round(encoded * 255)));
  return byte.toString(16).padStart(2, "0");
}

/** oklch() → sRGB hex, so colour assertions survive a notation change. */
function oklchToHex(lightness: number, chroma: number, hue: number): string {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const long = (lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const medium = (lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const short = (lightness - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
  const red =
    4.076_741_662_1 * long - 3.307_711_591_3 * medium + 0.230_969_929_2 * short;
  const green =
    -1.268_438_004_6 * long +
    2.609_757_401_1 * medium -
    0.341_319_396_5 * short;
  const blue =
    -0.004_196_086_3 * long - 0.703_418_614_7 * medium + 1.707_614_701 * short;
  return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`;
}

function resolveTokenHex(text: string, token: string): string {
  const declaration = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(text);
  if (declaration === null) {
    throw new Error(`token ${token} is not declared`);
  }
  const value = declaration[1]?.trim();
  if (value === undefined) {
    throw new Error(`token ${token} is declared with no value`);
  }
  if (HEX_COLOR.test(value)) {
    return value.toLowerCase();
  }
  const oklch = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value);
  const [, lightness, chroma, hue] = oklch ?? [];
  if (lightness === undefined || chroma === undefined || hue === undefined) {
    throw new Error(`token ${token} is neither hex nor oklch(): ${value}`);
  }
  return oklchToHex(Number(lightness), Number(chroma), Number(hue));
}

const SHADCN_ROOT_TOKENS = [
  "--background",
  "--foreground",
  "--card",
  "--popover",
  "--primary",
  "--ring",
  "--accent",
  "--destructive",
  "--border",
  "--input",
  "--muted",
  "--secondary",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--sidebar",
  "--sidebar-primary",
] as const;

const FORBIDDEN_APP_FAMILIES = [
  "--brand",
  "--status-ok-",
  "--status-warn-",
  "--status-bad-",
  "--status-info-",
  "--status-neutral-",
  "--section-earning-",
  "--section-deduction-",
  "--section-employer-",
  "--section-summary-",
  "--doc-",
] as const;

const DOC_EMITTED = [
  "--doc-ink",
  "--doc-ink-secondary",
  "--doc-ink-heading",
  "--doc-ink-brand",
  "--doc-ink-disabled",
  "--doc-rule-hairline",
  "--doc-rule-standard",
  "--doc-rule-emphasis",
  "--doc-rule-total",
  "--doc-fill-header",
  "--doc-fill-zebra",
  "--doc-fill-subtotal",
  "--doc-fill-paper",
  "--doc-section-earning-fill",
  "--doc-section-earning-ink",
  "--doc-section-deduction-fill",
  "--doc-section-deduction-ink",
  "--doc-section-employer-fill",
  "--doc-section-employer-ink",
  "--doc-section-summary-fill",
  "--doc-section-summary-ink",
] as const;

const DOC_RESERVED_FORBIDDEN = ["--doc-fill-grand-total"] as const;

describe("stock shadcn SPA theme", () => {
  it("declares default shadcn semantic tokens on :root", () => {
    const text = shadcn();
    for (const token of SHADCN_ROOT_TOKENS) {
      expect(text, token).toMatch(new RegExp(`${token}\\s*:`));
    }
  });

  it("does not carry Straits brand/status/section/doc families", () => {
    const text = shadcn();
    for (const fragment of FORBIDDEN_APP_FAMILIES) {
      expect(text.includes(fragment), fragment).toBe(false);
    }
  });

  it("maps @theme inline colours through var() aliases", () => {
    const text = shadcn();
    expect(text).toMatch(/@theme\s+inline/);
    expect(text).toMatch(/--color-background\s*:\s*var\(--background\)/);
    expect(text).toMatch(/--color-primary\s*:\s*var\(--primary\)/);
  });

  it("uses the official shadcn v4 multiplicative radius scale", () => {
    const text = shadcn();
    expect(text).not.toMatch(/--radius-xs\s*:/);
    expect(text).toMatch(
      /--radius-sm\s*:\s*calc\(var\(--radius\)\s*\*\s*0\.6\)/
    );
    expect(text).toMatch(
      /--radius-md\s*:\s*calc\(var\(--radius\)\s*\*\s*0\.8\)/
    );
    expect(text).toMatch(/--radius-lg\s*:\s*var\(--radius\)/);
    expect(text).toMatch(
      /--radius-xl\s*:\s*calc\(var\(--radius\)\s*\*\s*1\.4\)/
    );
  });

  it("uses stock shadcn neutral primary (not Straits navy)", () => {
    // oklch(0.205 0 0) → near-black neutral (was Straits navy #14324a)
    expect(resolveTokenHex(shadcn(), "--primary")).toBe("#171717");
  });

});

describe("light-theme document print CSS", () => {
  it("emits only canonical --doc-* tokens", () => {
    const text = printCss();
    for (const token of DOC_EMITTED) {
      expect(text, token).toMatch(new RegExp(`${token}\\s*:`));
    }
    for (const token of DOC_RESERVED_FORBIDDEN) {
      expect(text.includes(`${token}:`), token).toBe(false);
    }
  });

  it("does not redefine --doc-* under .dark", () => {
    const text = printCss();
    const darkBlocks = [...text.matchAll(/\.dark\s*\{([\s\S]*?)\}/g)].map(
      (match) => match[1] ?? ""
    );
    for (const block of darkBlocks) {
      expect(block.includes("--doc-")).toBe(false);
    }
  });

  it("keeps document ink light-theme", () => {
    expect(resolveTokenHex(printCss(), "--doc-ink")).toBe("#26333d");
  });
});
