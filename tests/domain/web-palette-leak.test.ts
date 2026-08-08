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

const webRoot = resolve("src/web");
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const PALETTE_UTIL =
  /\b(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

describe("src/web palette leak guard", () => {
  it("does not use raw hex or Tailwind palette utilities outside styles.css token file", () => {
    const files = walk(webRoot).filter((path) => !path.endsWith("styles.css"));
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (HEX.test(text) || PALETTE_UTIL.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
