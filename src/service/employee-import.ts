/**
 * Orchestrates the employee bulk importer: parse → check existing → create.
 * Create-only — see docs/superpowers/specs/2026-08-08-employee-master-import-design.md.
 */

import type { Database } from "@/db/client";
import {
  parseEmployeeRow,
  type CustomFieldDef,
  type RowError,
} from "@/domain/import/employee-row";
import {
  createEmployeeFromImport,
  findCompanyIdByCode,
  findExistingEmploymentId,
  listActiveCustomFieldDefs,
} from "@/repo/employee-profile";

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

export async function importEmployeeRows(
  db: Database,
  rawRows: readonly Record<string, string | undefined>[]
): Promise<ImportReport> {
  const defs = await listActiveCustomFieldDefs(db);
  const customFieldDefs: CustomFieldDef[] = defs.map((d) => ({
    fieldKey: d.fieldKey,
    label: d.label,
    dataType: d.dataType,
    required: d.required,
  }));

  const rows: RowOutcome[] = [];
  let created = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (const [index, raw] of rawRows.entries()) {
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
