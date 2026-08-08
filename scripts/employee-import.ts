/**
 * CLI for the employee bulk importer. Accepts CSV or JSON (array of row
 * objects); either way, column/key names must match the template exactly.
 * Create-only: an existing (employee code, company) pair is always
 * skipped, never overwritten.
 */

import fs from "node:fs";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import {
  createDatabase,
  createPool,
  requireDatabaseUrl,
} from "../src/db/client";
import { importEmployeeRows } from "../src/service/employee-import";

function loadRows(
  filePath: string
): Record<string, string | undefined>[] {
  const raw = fs.readFileSync(filePath, "utf8");
  if (path.extname(filePath).toLowerCase() === ".json") {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("JSON import file must be an array of row objects");
    }
    return parsed;
  }
  return parseCsv(raw, { columns: true, skip_empty_lines: true });
}

async function main(): Promise<void> {
  const [, , filePath] = process.argv;
  if (filePath === undefined) {
    throw new Error(
      "usage: tsx scripts/employee-import.ts <file.csv|file.json>"
    );
  }

  const pool = createPool(requireDatabaseUrl());
  try {
    const db = createDatabase(pool);
    const rows = loadRows(filePath);
    const report = await importEmployeeRows(db, rows);

    process.stdout.write(
      `created ${report.created}, skipped-existing ${report.skippedExisting}, failed ${report.failed}\n`
    );
    for (const outcome of report.rows) {
      if (outcome.status === "FAILED") {
        for (const error of outcome.errors) {
          process.stdout.write(
            `  row ${outcome.rowNumber} (${outcome.employeeCode ?? "?"}): ${error.field}: ${error.reason}\n`
          );
        }
      }
    }

    if (report.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("employee-import.ts")) {
  await main();
}
