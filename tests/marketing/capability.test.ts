/**
 * @feature marketing
 * @layer test
 *
 * Gates 1 and 3, as assertions against the source tree.
 *
 * Gate 1: nothing is advertised that does not exist in `src/`. An earlier draft
 * advertised an EA Form and a CP8D, neither of which this codebase produces.
 *
 * Gate 3: no test-harness or CI control is described as a runtime control. The
 * golden master pins the engine in the build; it does not halt a payroll run,
 * and an earlier draft said it did.
 */

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RELEASE_EVIDENCE, REPORTS } from "@/marketing/content";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const SECTIONS_DIR = path.join(REPO_ROOT, "src", "marketing", "sections");

function read(...segments: readonly string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), "utf8");
}

async function sectionSources(): Promise<readonly string[]> {
  const files = await readdir(SECTIONS_DIR);
  return files.map((file) =>
    readFileSync(path.join(SECTIONS_DIR, file), "utf8")
  );
}

async function marketingSource(): Promise<string> {
  return [
    ...(await sectionSources()),
    read("src", "marketing", "content.ts"),
  ].join("\n");
}

describe("operator claims stay inside the implemented runtime", () => {
  it("contains none of the claims the current product cannot support", async () => {
    const marketing = await marketingSource();
    for (const unsupported of [
      /keeps the derivation beside every figure/i,
      /cannot be released.*explained/i,
      /every passage certified/i,
      /names the authority that caused/i,
      /release ready/i,
    ]) {
      expect(marketing).not.toMatch(unsupported);
    }
  });

  it("keeps page metadata inside the same claim boundary", () => {
    const html = read("landing.html");
    expect(html).toContain("know what blocks payroll before it moves forward");
    expect(html).toContain("revision-bound approval");
    expect(html).not.toMatch(/derivation kept beside every figure/i);
    expect(html).not.toMatch(/cannot be accounted for/i);
  });
});

describe("advertised reports exist in the app", () => {
  it("names only reports the reports page implements", () => {
    const reportsPage = read("src", "web", "reports", "reports-page.tsx");
    for (const report of REPORTS) {
      expect(reportsPage).toContain(report.title);
    }
  });

  it("advertises no report the app does not have", async () => {
    const marketing = await marketingSource();
    for (const invented of ["EA Form", "CP8D", "e-Data PCB"]) {
      expect(marketing).not.toContain(invented);
    }
  });
});

describe("test-harness controls are not claimed as runtime controls", () => {
  it("keeps the golden master out of every section component", async () => {
    for (const source of await sectionSources()) {
      expect(source.toLowerCase()).not.toContain("golden master");
    }
  });

  it("describes the golden master as a build gate wherever it is named", () => {
    const mentions = RELEASE_EVIDENCE.filter((item) =>
      item.toLowerCase().includes("golden master")
    );
    expect(mentions).toHaveLength(1);
    for (const mention of mentions) {
      expect(mention).toContain("stops the build");
      expect(mention).not.toContain("halts");
    }
  });

  it("never claims a run status the schema does not define", async () => {
    const sources = await sectionSources();
    const marketing = sources.join("\n");
    // `runStatus` is DRAFT / REVIEWED / APPROVED / CLOSED. PAID is deliberately
    // absent: payment state is a line-level rollup, not a run status.
    expect(marketing).not.toContain("RELEASED");
    expect(marketing).not.toContain("PAID");
  });
});

describe("no money is hand-authored in a component", () => {
  /**
   * Gate 2. Every figure must arrive through `content.ts` and `formatSen`, so a
   * ringgit amount typed directly into JSX is a defect.
   */
  it("contains no ringgit literal in any section", async () => {
    const ringgitLiteral = /RM\s?\d/;
    for (const source of await sectionSources()) {
      expect(source).not.toMatch(ringgitLiteral);
    }
  });
});

describe("enterprise visual-system constraints", () => {
  it("uses no content text below twelve pixels", async () => {
    const marketing = await marketingSource();
    expect(marketing).not.toMatch(/text-\[0\.(6|7)rem\]/);
  });

  it("does not add hover lift to static evidence", async () => {
    const marketing = await marketingSource();
    expect(marketing).not.toMatch(/className="[^"]*\slift(?:\s|")/);
  });

  it("defines the enterprise canvas and section rhythm", () => {
    const styles = read("src", "marketing", "styles.css");
    expect(styles).toContain("--content-max: 80rem");
    expect(styles).toContain("--section-block:");
    expect(styles).not.toContain("@utility lift");
  });
});
