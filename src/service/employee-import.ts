/**
 * @feature employee-import
 * @layer service
 * @hub src/server/routes/employee-import.ts
 *
 * Orchestrates the employee bulk importer: parse → check existing → create.
 * Create-only — see docs/superpowers/specs/2026-08-08-employee-master-import-design.md.
 */

import fs from "node:fs";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
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
import { requirePermission } from "@/service/rbac";

const DEFAULT_CUSTOM_FIELDS_SEED_PATH = path.join(
  process.cwd(),
  "db",
  "seed",
  "employee-custom-fields.json"
);

/** HTTP import body limit (2 MiB). CLI is unbounded. */
export const EMPLOYEE_IMPORT_MAX_BODY_BYTES = 2 * 1024 * 1024;

const CSV_ESCAPE_NEEDED = /[",\n]/;
const CSV_QUOTE = /"/g;

export type EmployeeImportErrorCode = "VALIDATION_ERROR" | "PAYLOAD_TOO_LARGE";

export class EmployeeImportError extends Error {
  readonly code: EmployeeImportErrorCode;
  readonly status: number;

  constructor(
    code: EmployeeImportErrorCode,
    message: string,
    status: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "EmployeeImportError";
    this.code = code;
    this.status = status;
  }
}

export function csvEscape(value: string): string {
  return CSV_ESCAPE_NEEDED.test(value)
    ? `"${value.replace(CSV_QUOTE, '""')}"`
    : value;
}

/** CSV header line for the create-only employee import template. */
export async function buildEmployeeImportTemplateCsv(
  db: Database
): Promise<string> {
  const defs = await listActiveCustomFieldDefs(db);
  const headers = [
    ...FIXED_HEADERS.map((h) => h.header),
    ...defs.map((d) => d.label),
  ];
  return `${headers.map(csvEscape).join(",")}\n`;
}

export interface ParseEmployeeImportBodyOptions {
  /**
   * Max UTF-16 code units accepted. Defaults to HTTP cap.
   * Pass `null` for unbounded (CLI).
   */
  readonly maxBytes?: number | null;
}

function normalizeImportCell(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw new EmployeeImportError(
    "VALIDATION_ERROR",
    "JSON import cells must be strings, numbers, booleans, or null",
    400
  );
}

function normalizeImportRows(
  parsed: unknown[]
): Record<string, string | undefined>[] {
  const rows: Record<string, string | undefined>[] = [];
  for (const entry of parsed) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new EmployeeImportError(
        "VALIDATION_ERROR",
        "JSON import body must be an array of row objects",
        400
      );
    }
    const row: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(entry)) {
      row[key] = normalizeImportCell(value);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Parse HTTP/CLI body into raw row objects. Never enables auto-register.
 */
export function parseEmployeeImportBody(
  contentType: string | undefined,
  text: string,
  options: ParseEmployeeImportBodyOptions = {}
): Record<string, string | undefined>[] {
  const maxBytes =
    options.maxBytes === undefined
      ? EMPLOYEE_IMPORT_MAX_BODY_BYTES
      : options.maxBytes;
  if (maxBytes !== null && text.length > maxBytes) {
    throw new EmployeeImportError(
      "PAYLOAD_TOO_LARGE",
      `import body exceeds ${maxBytes} bytes`,
      413
    );
  }

  const ct =
    (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "text/csv";

  if (ct === "application/json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      // biome-ignore lint/style/useErrorCause: ErrorOptions is the 4th constructor arg
      throw new EmployeeImportError(
        "VALIDATION_ERROR",
        "invalid JSON body",
        400,
        { cause: error }
      );
    }
    if (!Array.isArray(parsed)) {
      throw new EmployeeImportError(
        "VALIDATION_ERROR",
        "JSON import body must be an array of row objects",
        400
      );
    }
    return normalizeImportRows(parsed);
  }

  if (ct === "text/csv" || ct === "text/plain" || ct === "") {
    try {
      return parseCsv(text, {
        columns: true,
        skip_empty_lines: true,
      }) as Record<string, string | undefined>[];
    } catch (error) {
      // biome-ignore lint/style/useErrorCause: ErrorOptions is the 4th constructor arg
      throw new EmployeeImportError(
        "VALIDATION_ERROR",
        error instanceof Error ? error.message : "invalid CSV body",
        400,
        { cause: error }
      );
    }
  }

  throw new EmployeeImportError(
    "VALIDATION_ERROR",
    `unsupported Content-Type: ${ct || "(empty)"}`,
    400
  );
}

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
  const headers = new Set<string>();
  for (const row of rawRows) {
    if (Object.keys(row).length === 0) {
      continue;
    }
    for (const key of Object.keys(row)) {
      headers.add(key);
    }
  }
  return [...headers];
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function collectTakenFieldKeys(
  seedFields: ReadonlyArray<{ fieldKey: string; label: string }>,
  dbDefs: ReadonlyArray<{ fieldKey: string; label: string }>,
  batchFieldKeys: ReadonlySet<string>
): Set<string> {
  const taken = new Set<string>(batchFieldKeys);
  for (const field of [...seedFields, ...dbDefs]) {
    taken.add(field.fieldKey);
    const fromLabel = slugify(field.label);
    if (fromLabel !== "") {
      taken.add(fromLabel);
    }
  }
  return taken;
}

function resolveUniqueFieldKey(
  baseKey: string,
  takenKeys: Set<string>
): string {
  if (!takenKeys.has(baseKey)) {
    return baseKey;
  }
  let suffix = 2;
  while (takenKeys.has(`${baseKey}_${suffix}`)) {
    suffix += 1;
  }
  return `${baseKey}_${suffix}`;
}

async function autoRegisterUnrecognizedHeaders(
  db: Database,
  unrecognizedHeaders: string[],
  seedFilePath: string,
  dbDefs: Awaited<ReturnType<typeof listActiveCustomFieldDefs>>
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
  const batchFieldKeys = new Set<string>();

  let index = 0;
  for (const header of unrecognizedHeaders) {
    const baseKey = slugify(header);
    if (baseKey === "") {
      throw new Error(
        `Cannot auto-register column ${JSON.stringify(header)}: slugified field key is empty`
      );
    }

    const takenKeys = collectTakenFieldKeys(existing, dbDefs, batchFieldKeys);
    const fieldKey = resolveUniqueFieldKey(baseKey, takenKeys);
    batchFieldKeys.add(fieldKey);

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

async function validateImportHeaders(
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
      seedFilePath,
      defs
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

/**
 * Keys that appear more than once in the file (company code + employee code).
 * Detected before any persistence so both occurrences fail rather than the
 * second depending on the first having just been inserted.
 */
export function intraFileDuplicateKeys(
  rawRows: readonly Record<string, string | undefined>[]
): Set<string> {
  const counts = new Map<string, number>();
  for (const raw of rawRows) {
    const company = (raw["Payroll Company Code"] ?? "").trim();
    const code = (raw["Employee Code"] ?? "").trim();
    if (company === "" || code === "") {
      continue;
    }
    const key = `${company}\0${code}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [key, count] of counts) {
    if (count > 1) {
      duplicates.add(key);
    }
  }
  return duplicates;
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

  const duplicateKeys = intraFileDuplicateKeys(rawRows);

  const rows: RowOutcome[] = [];
  let created = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (let index = 0; index < rawRows.length; index += 1) {
    const raw = rawRows[index] as Record<string, string | undefined>;
    const rowNumber = index + 2; // header is row 1
    const companyKey = (raw["Payroll Company Code"] ?? "").trim();
    const codeKey = (raw["Employee Code"] ?? "").trim();
    const fileKey =
      companyKey !== "" && codeKey !== "" ? `${companyKey}\0${codeKey}` : null;
    if (fileKey !== null && duplicateKeys.has(fileKey)) {
      failed += 1;
      rows.push({
        status: "FAILED",
        rowNumber,
        employeeCode: codeKey || null,
        errors: [
          {
            field: "Employee Code",
            reason: `duplicate (Payroll Company Code, Employee Code) within the import file: ${companyKey}/${codeKey}`,
          },
        ],
      });
      continue;
    }

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

/**
 * Authenticated import path: EMPLOYMENT CREATE for every resolved company,
 * then create-only import with autoRegister forced off.
 */
export async function importEmployeeRowsForActor(
  db: Database,
  actorUserId: string,
  rawRows: readonly Record<string, string | undefined>[]
): Promise<ImportReport> {
  const codes = new Set<string>();
  for (const row of rawRows) {
    const code = (row["Payroll Company Code"] ?? "").trim();
    if (code !== "") {
      codes.add(code);
    }
  }

  const resolvedCompanyIds = new Set<string>();
  for (const code of codes) {
    const companyId = await findCompanyIdByCode(db, code);
    if (companyId !== null) {
      resolvedCompanyIds.add(companyId);
    }
  }

  if (resolvedCompanyIds.size === 0) {
    // Empty file or only unknown company codes — GLOBAL / SYSTEM_ADMIN only.
    await requirePermission(db, actorUserId, "EMPLOYMENT", "CREATE", null);
  } else {
    for (const companyId of resolvedCompanyIds) {
      await requirePermission(
        db,
        actorUserId,
        "EMPLOYMENT",
        "CREATE",
        companyId
      );
    }
  }

  try {
    return await importEmployeeRows(db, rawRows, { autoRegister: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Unrecognized columns:")) {
      // biome-ignore lint/style/useErrorCause: ErrorOptions is the 4th constructor arg
      throw new EmployeeImportError("VALIDATION_ERROR", message, 400, {
        cause: error,
      });
    }
    throw error;
  }
}
