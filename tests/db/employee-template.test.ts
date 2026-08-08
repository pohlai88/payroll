/**
 * `scripts/employee-template.ts` must emit a header row that stays in sync
 * with `FIXED_HEADERS` and active custom field defs — the same column names
 * `parseEmployeeRow` expects on import.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXED_HEADERS } from "@/domain/import/employee-row";
import { seed } from "../../scripts/seed";
import {
  csvEscape,
  writeEmployeeImportTemplate,
} from "../../scripts/employee-template";
import { ALL_TABLES, connectTestDatabase } from "./harness/database";

const database = connectTestDatabase();
const { db } = database;

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  await seed(db);
});

afterAll(async () => {
  await database.close();
});

describe("csvEscape", () => {
  it("quotes values containing commas or quotes", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });
});

describe("writeEmployeeImportTemplate", () => {
  it("writes fixed headers followed by active custom field labels", async () => {
    const outPath = path.join(
      os.tmpdir(),
      `employee-import-template-${process.pid}.csv`
    );
    try {
      const count = await writeEmployeeImportTemplate(db, outPath);
      expect(count).toBe(FIXED_HEADERS.length + 1);

      const line = fs.readFileSync(outPath, "utf8").trim();
      const headers = line.split(",");
      expect(headers).toHaveLength(FIXED_HEADERS.length + 1);
      expect(headers.slice(0, FIXED_HEADERS.length)).toEqual(
        FIXED_HEADERS.map((h) => h.header)
      );
      expect(headers.at(-1)).toBe("Uniform Size");
    } finally {
      fs.unlinkSync(outPath);
    }
  });
});
