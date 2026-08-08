/**
 * MY-STAT-S07 hardening: PCB Table 1 must have exactly one source of truth.
 *
 * `pcb-tables.ts` used to hand-duplicate every row of `db/seed/pcb-table1-2026.json`
 * as a literal array, verified equal by a separate test. Two independently
 * maintained copies of statutory tax brackets can silently drift if one is
 * edited without the other. This test fails if `pcb-tables.ts` ever goes back
 * to hand-duplicating the table instead of importing the seed file directly.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("PCB Table 1 has a single source of truth", () => {
  it("pcb-tables.ts imports Table 1 from db/seed/pcb-table1-2026.json rather than duplicating it", () => {
    const src = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../src/domain/calc/pcb-tables.ts"),
      "utf8"
    );

    expect(src).toMatch(/from\s+["'].*pcb-table1-2026\.json["']/);

    // A hand-duplicated array literal repeats "fromSen:" once per row (9 rows
    // in the 2026 table) plus once for the interface field declaration (10
    // total); code that only reads the imported module writes it at most
    // once, for the interface field.
    const literalRowKeys = src.match(/\bfromSen\s*:/g)?.length ?? 0;
    expect(literalRowKeys).toBeLessThanOrEqual(1);
  });
});
