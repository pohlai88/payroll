/**
 * Emits the employee bulk-import CSV template: fixed headers plus one
 * column per active custom field, in order. Re-run after editing
 * db/seed/employee-custom-fields.json and reseeding to pick up new columns.
 */

import fs from "node:fs";
import {
  createDatabase,
  createPool,
  type Database,
  requireDatabaseUrl,
} from "../src/db/client";
import { FIXED_HEADERS } from "../src/domain/import/employee-row";
import { listActiveCustomFieldDefs } from "../src/repo/employee-profile";
import { buildEmployeeImportTemplateCsv } from "../src/service/employee-import";

export async function writeEmployeeImportTemplate(
  db: Database,
  outPath: string
): Promise<number> {
  const defs = await listActiveCustomFieldDefs(db);
  const csv = await buildEmployeeImportTemplateCsv(db);
  fs.writeFileSync(outPath, csv);
  return FIXED_HEADERS.length + defs.length;
}

async function main(): Promise<void> {
  const outPath = process.argv[2] ?? "employee-import-template.csv";
  const pool = createPool(requireDatabaseUrl());
  try {
    const db = createDatabase(pool);
    const count = await writeEmployeeImportTemplate(db, outPath);
    process.stdout.write(`wrote ${count} columns to ${outPath}\n`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("employee-template.ts")) {
  await main();
}
