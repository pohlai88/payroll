/**
 * Emits the employee bulk-import CSV template: fixed headers plus one
 * column per active custom field, in order. Re-run after editing
 * db/seed/employee-custom-fields.json and reseeding to pick up new columns.
 */

import fs from "node:fs";
import type { Database } from "../src/db/client";
import {
  createDatabase,
  createPool,
  requireDatabaseUrl,
} from "../src/db/client";
import { FIXED_HEADERS } from "../src/domain/import/employee-row";
import { listActiveCustomFieldDefs } from "../src/repo/employee-profile";

export function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function writeEmployeeImportTemplate(
  db: Database,
  outPath: string
): Promise<number> {
  const defs = await listActiveCustomFieldDefs(db);
  const headers = [
    ...FIXED_HEADERS.map((h) => h.header),
    ...defs.map((d) => d.label),
  ];
  const line = headers.map(csvEscape).join(",");
  fs.writeFileSync(outPath, `${line}\n`);
  return headers.length;
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
