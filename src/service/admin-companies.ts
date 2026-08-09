/**
 * System-admin company directory — list / create / update party rows used by
 * multicompany scope, import matching, and pay-run ownership.
 */

import type { Database } from "@/db/client";
import type { CompanyRow } from "@/db/schema/parties";
import {
  createCompany,
  listAllCompanies,
  updateCompany,
} from "@/repo/companies";
import { requireSystemAdmin } from "./rbac";

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
    throw new Error("Company code and name are required");
  }
  const row = await createCompany(db, {
    code,
    name,
    epfNo: input.epfNo ?? null,
    socsoNo: input.socsoNo ?? null,
    lhdnNo: input.lhdnNo ?? null,
    hrdfEnabled: input.hrdfEnabled ?? false,
    hrdfLevyPct: input.hrdfLevyPct ?? "1",
  });
  return toDirectoryRow(row);
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
      throw new Error("Company name cannot be blank");
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
    patch.hrdfLevyPct = input.hrdfLevyPct;
  }
  const row = await updateCompany(db, input.companyId, patch);
  return toDirectoryRow(row);
}
