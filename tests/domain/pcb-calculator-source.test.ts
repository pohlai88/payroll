import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LHDN_PCB_CALCULATOR_2026_URL,
  LHDN_PCB_CALCULATOR_SOURCE_REF,
} from "@/domain/calc/pcb";

describe("LHDN PCB HTML calculator is the 2026 validation source", () => {
  it("uses the full calculator URL with PRV_YEAR and FRS_REC", () => {
    expect(LHDN_PCB_CALCULATOR_2026_URL).toBe(
      "https://calcpcbplus.hasil.gov.my/HITS_CE/x2026?PRV_YEAR=true&FRS_REC=true"
    );
    expect(LHDN_PCB_CALCULATOR_2026_URL).toContain("PRV_YEAR=true");
    expect(LHDN_PCB_CALCULATOR_2026_URL).toContain("FRS_REC=true");
    expect(LHDN_PCB_CALCULATOR_SOURCE_REF).toBe("P-CALC-2026");
  });

  it("matches the seeded P-CALC-2026 source URL", () => {
    const seedPath = path.resolve(
      import.meta.dirname,
      "../../db/seed/pcb-sources.json"
    );
    const seed = JSON.parse(readFileSync(seedPath, "utf8")) as {
      sources: Array<{ ref: string; url: string }>;
    };
    const calc = seed.sources.find((s) => s.ref === "P-CALC-2026");
    expect(calc?.url).toBe(LHDN_PCB_CALCULATOR_2026_URL);
  });
});
