/**
 * @feature companies
 * @layer service
 * @hub src/server/routes/admin-companies.ts
 *
 * System-admin company directory — list / create / update / guarded delete.
 */

import type { Database } from "@/db/client";
import type { CompanyRow } from "@/db/schema/parties";
import { isUniqueViolation } from "@/lib/pg-error";
import {
  CompanyRepoError,
  countCompanyDependencies,
  createCompany,
  deleteCompany,
  listAllCompanies,
  updateCompany,
} from "@/repo/companies";
import { requireSystemAdmin } from "./rbac";

export type AdminCompaniesErrorCode =
  | "CONFLICT"
  | "NOT_FOUND"
  | "VALIDATION_ERROR";

export class AdminCompaniesError extends Error {
  readonly code: AdminCompaniesErrorCode;
  readonly status: number;

  constructor(
    code: AdminCompaniesErrorCode,
    message: string,
    status: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "AdminCompaniesError";
    this.code = code;
    this.status = status;
  }
}

/** Keep in sync with `src/web/api/types.ts` `AdminCompanyRow`. */
export interface CompanyDirectoryRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly epfNo: string | null;
  readonly socsoNo: string | null;
  readonly lhdnNo: string | null;
  readonly hrdfEnabled: boolean;
  readonly hrdfLevyPct: string;
  readonly createdAt: string;
}

function toDirectoryRow(row: CompanyRow): CompanyDirectoryRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    epfNo: row.epfNo,
    socsoNo: row.socsoNo,
    lhdnNo: row.lhdnNo,
    hrdfEnabled: row.hrdfEnabled,
    hrdfLevyPct: row.hrdfLevyPct,
    createdAt: row.createdAt.toISOString(),
  };
}

function normalizeLevyPct(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new AdminCompaniesError(
      "VALIDATION_ERROR",
      "HRDF levy % cannot be blank",
      400
    );
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new AdminCompaniesError(
      "VALIDATION_ERROR",
      "HRDF levy % must be a number between 0 and 100",
      400
    );
  }
  return trimmed;
}

export async function listAdminCompanies(
  db: Database,
  actorUserId: string
): Promise<CompanyDirectoryRow[]> {
  await requireSystemAdmin(db, actorUserId);
  const rows = await listAllCompanies(db);
  return rows.map(toDirectoryRow);
}

export interface CreateCompanyInput {
  readonly actorUserId: string;
  readonly code: string;
  readonly name: string;
  readonly epfNo?: string | null;
  readonly socsoNo?: string | null;
  readonly lhdnNo?: string | null;
  readonly hrdfEnabled?: boolean;
  readonly hrdfLevyPct?: string;
}

export async function createAdminCompany(
  db: Database,
  input: CreateCompanyInput
): Promise<CompanyDirectoryRow> {
  await requireSystemAdmin(db, input.actorUserId);
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (code.length === 0 || name.length === 0) {
    throw new AdminCompaniesError(
      "VALIDATION_ERROR",
      "Company code and name are required",
      400
    );
  }
  const hrdfLevyPct = normalizeLevyPct(input.hrdfLevyPct) ?? "1";
  try {
    const row = await createCompany(db, {
      code,
      name,
      epfNo: input.epfNo ?? null,
      socsoNo: input.socsoNo ?? null,
      lhdnNo: input.lhdnNo ?? null,
      hrdfEnabled: input.hrdfEnabled ?? false,
      hrdfLevyPct,
    });
    return toDirectoryRow(row);
  } catch (error) {
    if (error instanceof CompanyRepoError || isUniqueViolation(error)) {
      throw new AdminCompaniesError(
        "CONFLICT",
        `Company code already exists: ${code}`,
        409,
        { cause: error }
      );
    }
    throw error;
  }
}

export interface UpdateCompanyInput {
  readonly actorUserId: string;
  readonly companyId: string;
  readonly name?: string;
  readonly epfNo?: string | null;
  readonly socsoNo?: string | null;
  readonly lhdnNo?: string | null;
  readonly hrdfEnabled?: boolean;
  readonly hrdfLevyPct?: string;
}

export async function updateAdminCompany(
  db: Database,
  input: UpdateCompanyInput
): Promise<CompanyDirectoryRow> {
  await requireSystemAdmin(db, input.actorUserId);
  const patch: Parameters<typeof updateCompany>[2] = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length === 0) {
      throw new AdminCompaniesError(
        "VALIDATION_ERROR",
        "Company name cannot be blank",
        400
      );
    }
    patch.name = name;
  }
  if (input.epfNo !== undefined) {
    patch.epfNo = input.epfNo;
  }
  if (input.socsoNo !== undefined) {
    patch.socsoNo = input.socsoNo;
  }
  if (input.lhdnNo !== undefined) {
    patch.lhdnNo = input.lhdnNo;
  }
  if (input.hrdfEnabled !== undefined) {
    patch.hrdfEnabled = input.hrdfEnabled;
  }
  if (input.hrdfLevyPct !== undefined) {
    patch.hrdfLevyPct = normalizeLevyPct(input.hrdfLevyPct) ?? input.hrdfLevyPct;
  }
  try {
    const row = await updateCompany(db, input.companyId, patch);
    return toDirectoryRow(row);
  } catch (error) {
    if (
      error instanceof CompanyRepoError &&
      error.message.includes("not found")
    ) {
      throw new AdminCompaniesError(
        "NOT_FOUND",
        `Company ${input.companyId} not found`,
        404,
        { cause: error }
      );
    }
    throw error;
  }
}

export interface DeleteCompanyInput {
  readonly actorUserId: string;
  readonly companyId: string;
}

export async function deleteAdminCompany(
  db: Database,
  input: DeleteCompanyInput
): Promise<{ readonly ok: true }> {
  await requireSystemAdmin(db, input.actorUserId);
  const deps = await countCompanyDependencies(db, input.companyId);
  if (deps.employments > 0 || deps.payRuns > 0) {
    throw new AdminCompaniesError(
      "CONFLICT",
      `Cannot delete company with ${String(deps.employments)} employment(s) and ${String(deps.payRuns)} pay run(s)`,
      409
    );
  }
  try {
    await deleteCompany(db, input.companyId);
  } catch (error) {
    if (
      error instanceof CompanyRepoError &&
      error.message.includes("not found")
    ) {
      throw new AdminCompaniesError(
        "NOT_FOUND",
        `Company ${input.companyId} not found`,
        404,
        { cause: error }
      );
    }
    throw error;
  }
  return { ok: true };
}
