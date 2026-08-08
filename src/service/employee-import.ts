/**
 * Orchestrates the employee bulk importer: parse → check existing → create.
 * Create-only — see docs/superpowers/specs/2026-08-08-employee-master-import-design.md.
 */

import fs from "node:fs";
import path from "node:path";
import type { Database } from "@/db/client";
import {
  type CustomFieldDef,
  FIXED_HEADERS,
  parseEmployeeRow,
  type RowError,
} from "@/domain/import/employee-row";
import {
  createEmployeeFromImport,
  findCompanyIdByCode,
  findExistingEmploymentId,
  insertCustomFieldDef,
  listActiveCustomFieldDefs,
} from "@/repo/employee-profile";

export const DEFAULT_CUSTOM_FIELDS_SEED_PATH = path.join(
  process.cwd(),
  "db",
  "seed",
  "employee-custom-fields.json"
);

export interface ImportOptions {
  autoRegister?: boolean;
  /** Seed file auto-register appends to; defaults to repo seed in prod/CLI. */
  customFieldsSeedPath?: string;
}

export type RowOutcome =
  | {
      status: "CREATED";
      rowNumber: number;
      employeeCode: string;
      employmentId: string;
    }
  | { status: "SKIPPED_EXISTING"; rowNumber: number; employeeCode: string }
  | {
      status: "FAILED";
      rowNumber: number;
      employeeCode: string | null;
      errors: RowError[];
    };

export interface ImportReport {
  created: number;
  skippedExisting: number;
  failed: number;
  rows: RowOutcome[];
}

function extractHeaders(
  rawRows: readonly Record<string, string | undefined>[]
): string[] {
  if (rawRows.length === 0) {
    return [];
  }
  return Object.keys(rawRows[0] ?? {});
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function autoRegisterUnrecognizedHeaders(
  db: Database,
  unrecognizedHeaders: string[],
  seedFilePath: string
): Promise<CustomFieldDef[]> {
  const content = fs.existsSync(seedFilePath)
    ? JSON.parse(fs.readFileSync(seedFilePath, "utf8"))
    : { fields: [] };

  const existing = content.fields as Array<{
    fieldKey: string;
    label: string;
    dataType: string;
    required: boolean;
    sortOrder: number;
    active: boolean;
  }>;

  const maxSort = existing.reduce((max, f) => Math.max(max, f.sortOrder), 0);
  const newDefs: CustomFieldDef[] = [];

  let index = 0;
  for (const header of unrecognizedHeaders) {
    const fieldKey = slugify(header);
    const newField = {
      fieldKey,
      label: header,
      dataType: "TEXT" as const,
      required: false,
      sortOrder: maxSort + index + 1,
      active: true,
    };
    existing.push(newField);
    newDefs.push({
      fieldKey,
      label: header,
      dataType: "TEXT",
      required: false,
    });

    await insertCustomFieldDef(db, {
      fieldKey,
      label: header,
      dataType: "TEXT",
      required: false,
      sortOrder: newField.sortOrder,
      active: true,
    });
    index += 1;
  }

  fs.writeFileSync(
    seedFilePath,
    `${JSON.stringify(content, null, 2)}\n`,
    "utf8"
  );
  return newDefs;
}

export async function validateImportHeaders(
  db: Database,
  rawRows: readonly Record<string, string | undefined>[],
  options: ImportOptions = {}
): Promise<
  | { valid: true; customFieldDefs: CustomFieldDef[] }
  | { valid: false; unrecognizedHeaders: string[] }
> {
  const headers = extractHeaders(rawRows);
  const defs = await listActiveCustomFieldDefs(db);
  const knownHeaders = new Set([
    ...FIXED_HEADERS.map((h) => h.header),
    ...defs.map((d) => d.label),
  ]);

  const unrecognizedHeaders = headers.filter((h) => !knownHeaders.has(h));

  if (unrecognizedHeaders.length > 0) {
    if (!options.autoRegister) {
      return { valid: false, unrecognizedHeaders };
    }

    const seedFilePath =
      options.customFieldsSeedPath ?? DEFAULT_CUSTOM_FIELDS_SEED_PATH;
    const newDefs = await autoRegisterUnrecognizedHeaders(
      db,
      unrecognizedHeaders,
      seedFilePath
    );
    const allDefs: CustomFieldDef[] = [
      ...defs.map((d) => ({
        fieldKey: d.fieldKey,
        label: d.label,
        dataType: d.dataType,
        required: d.required,
      })),
      ...newDefs,
    ];
    return { valid: true, customFieldDefs: allDefs };
  }

  return {
    valid: true,
    customFieldDefs: defs.map((d) => ({
      fieldKey: d.fieldKey,
      label: d.label,
      dataType: d.dataType,
      required: d.required,
    })),
  };
}

export async function importEmployeeRows(
  db: Database,
  rawRows: readonly Record<string, string | undefined>[],
  options: ImportOptions = {}
): Promise<ImportReport> {
  const validation = await validateImportHeaders(db, rawRows, options);
  if (!validation.valid) {
    const errorMsg =
      `Unrecognized columns: ${validation.unrecognizedHeaders.join(", ")}. ` +
      "Use --auto-register to automatically create custom fields for unrecognized columns.";
    throw new Error(errorMsg);
  }

  const { customFieldDefs } = validation;

  const rows: RowOutcome[] = [];
  let created = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (let index = 0; index < rawRows.length; index += 1) {
    const raw = rawRows[index] as Record<string, string | undefined>;
    const rowNumber = index + 2; // header is row 1
    const parsed = parseEmployeeRow(raw, customFieldDefs);

    if ("errors" in parsed) {
      failed += 1;
      rows.push({
        status: "FAILED",
        rowNumber,
        employeeCode: raw["Employee Code"] ?? null,
        errors: parsed.errors,
      });
      continue;
    }

    const { row } = parsed;
    const companyId = await findCompanyIdByCode(db, row.payrollCompanyCode);
    if (companyId === null) {
      failed += 1;
      rows.push({
        status: "FAILED",
        rowNumber,
        employeeCode: row.employeeCode,
        errors: [
          {
            field: "Payroll Company Code",
            reason: `no company with code ${JSON.stringify(row.payrollCompanyCode)}`,
          },
        ],
      });
      continue;
    }

    const existingId = await findExistingEmploymentId(
      db,
      companyId,
      row.employeeCode
    );
    if (existingId !== null) {
      skippedExisting += 1;
      rows.push({
        status: "SKIPPED_EXISTING",
        rowNumber,
        employeeCode: row.employeeCode,
      });
      continue;
    }

    const { employmentId } = await createEmployeeFromImport(db, companyId, row);
    created += 1;
    rows.push({
      status: "CREATED",
      rowNumber,
      employeeCode: row.employeeCode,
      employmentId,
    });
  }

  return { created, skippedExisting, failed, rows };
}
