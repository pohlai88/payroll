/**
 * Architectural fence for MY-STAT-S02: money is settled only in `money.ts`.
 *
 * A later slice that "helpfully" does `Math.round(qty * rateSen)` in a calc or
 * service file would reintroduce float drift. This test reads the source tree
 * and fails if that pattern appears outside the money module and a small
 * allowlist of non-settling display/label code.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(import.meta.dirname, "../../src");

/** Files allowed to mention Math.round / toFixed near sen-shaped names. */
const ALLOWLIST = new Set([
  // The only place that may settle money.
  path.normalize("domain/money.ts"),
  // Explain/trace labels: Math.round formats an already-settled delta for copy,
  // it does not decide the stored sen (settlement already happened via money.ts).
  path.normalize("domain/derive/emit.ts"),
  // Basis-point encoding of a percentage rate (pct * 100), not a sen amount.
  path.normalize("domain/derive/value.ts"),
  path.normalize("domain/derive/label.ts"),
  // Display formatting of non-money numbers (e.g. percentages in i18n).
  path.normalize("domain/derive/i18n/render.ts"),
]);

const SETTLE_CALL = /\b(?:Math\.round|Math\.floor|Math\.ceil|toFixed)\s*\(/;

/**
 * A line is suspicious when it both calls a raw round/floor/ceil/toFixed and
 * mentions a sen-bearing identifier or a quantity×rate product pattern that
 * historically bypassed the money module.
 */
const SEN_SHAPED =
  /(?:Sen\b|sen\b|amountSen|rateSen|wagesSen|qty\s*\*|quantity\s*\*)/;

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsFiles(full));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("money module boundary (MY-STAT-S02)", () => {
  it("no src module outside money.ts settles sen with raw Math.round/toFixed", () => {
    const offenders: string[] = [];

    for (const file of walkTsFiles(SRC_ROOT)) {
      const rel = path.normalize(path.relative(SRC_ROOT, file));
      if (ALLOWLIST.has(rel)) {
        continue;
      }

      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? "";
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
          continue;
        }
        if (SETTLE_CALL.test(line) && SEN_SHAPED.test(line)) {
          offenders.push(`${rel}:${i + 1}: ${trimmed}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("calc and service layers import settlement helpers from money.ts when they name them", () => {
    // Smoke: the known former bypass sites must import the helpers they use.
    const compose = fs.readFileSync(
      path.join(SRC_ROOT, "domain/calc/compose.ts"),
      "utf8"
    );
    expect(compose).toMatch(/from ["']\.\.\/money["']/);
    expect(compose).toMatch(/pctHalfUpSen/);
    expect(compose).not.toMatch(/Math\.round/);

    const payrun = fs.readFileSync(
      path.join(SRC_ROOT, "service/payrun.ts"),
      "utf8"
    );
    expect(payrun).toMatch(/from ["']@\/domain\/money["']/);
    expect(payrun).toMatch(/quantityAmountSen/);
    expect(payrun).not.toMatch(/Math\.round\s*\(\s*quantity/);
  });
});
