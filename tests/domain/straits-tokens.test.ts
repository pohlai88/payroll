import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cssPath = resolve("src/web/styles.css");
const css = () => readFileSync(cssPath, "utf8");

const APP_TOKENS = [
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
] as const;

const STATUS = ["ok", "info", "warn", "bad", "neutral"] as const;
const SECTIONS = ["earning", "deduction", "employer", "summary"] as const;

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
  "--doc-section-earning-fill",
  "--doc-section-earning-ink",
  "--doc-section-deduction-fill",
  "--doc-section-deduction-ink",
  "--doc-section-employer-fill",
  "--doc-section-employer-ink",
  "--doc-section-summary-fill",
  "--doc-section-summary-ink",
] as const;

/** grand_total fill is null in JSON — must not be fabricated */
const DOC_RESERVED_FORBIDDEN = ["--doc-fill-grand-total"] as const;

describe("Straits token CSS contract", () => {
  it("declares app semantic tokens on :root", () => {
    const text = css();
    for (const token of APP_TOKENS) {
      expect(text, token).toMatch(new RegExp(`${token}\\s*:`));
    }
  });

  it("declares status and section families", () => {
    const text = css();
    for (const tone of STATUS) {
      expect(text).toMatch(new RegExp(`--status-${tone}-ink\\s*:`));
      expect(text).toMatch(new RegExp(`--status-${tone}-fill\\s*:`));
    }
    for (const section of SECTIONS) {
      expect(text).toMatch(new RegExp(`--section-${section}-fill\\s*:`));
      expect(text).toMatch(new RegExp(`--section-${section}-ink\\s*:`));
    }
  });

  it("emits only canonical --doc-* tokens", () => {
    const text = css();
    for (const token of DOC_EMITTED) {
      expect(text, token).toMatch(new RegExp(`${token}\\s*:`));
    }
    for (const token of DOC_RESERVED_FORBIDDEN) {
      expect(text.includes(`${token}:`), token).toBe(false);
    }
  });

  it("does not redefine --doc-* under .dark", () => {
    const text = css();
    const darkBlocks = [...text.matchAll(/\.dark\s*\{([\s\S]*?)\}/g)].map(
      (match) => match[1] ?? ""
    );
    expect(darkBlocks.length).toBeGreaterThan(0);
    for (const block of darkBlocks) {
      expect(block.includes("--doc-")).toBe(false);
    }
  });

  it("maps @theme inline colours through var() aliases", () => {
    const text = css();
    expect(text).toMatch(/@theme\s+inline/);
    expect(text).toMatch(/--color-background\s*:\s*var\(--background\)/);
    expect(text).toMatch(/--color-primary\s*:\s*var\(--primary\)/);
    // no duplicated brand hex inside @theme for primary
    const theme = text.split("@theme")[1] ?? "";
    expect(theme.toLowerCase()).not.toMatch(/#14324a/);
  });

  it("does not declare a circular --font-heading theme alias", () => {
    const text = css();
    expect(text).not.toMatch(/--font-heading\s*:/);
  });

  it("uses the shadcn v4 multiplicative radius scale", () => {
    const text = css();
    expect(text).toMatch(
      /--radius-xs\s*:\s*calc\(var\(--radius\)\s*\*\s*0\.5\)/
    );
    expect(text).toMatch(
      /--radius-sm\s*:\s*calc\(var\(--radius\)\s*\*\s*0\.75\)/
    );
    expect(text).toMatch(
      /--radius-md\s*:\s*calc\(var\(--radius\)\s*\*\s*0\.875\)/
    );
    expect(text).toMatch(/--radius-lg\s*:\s*var\(--radius\)/);
    expect(text).toMatch(
      /--radius-xl\s*:\s*calc\(var\(--radius\)\s*\*\s*1\.5\)/
    );
  });

  it("projects known Straits literals for primary and doc-ink", () => {
    const text = css();
    expect(text).toMatch(/--primary\s*:\s*#14324a/i);
    expect(text).toMatch(/--doc-ink\s*:\s*#26333d/i);
  });
});
