/**
 * @feature companies
 * @layer repo
 * @hub src/server/routes/admin-companies.ts
 *
 * Company party persistence — directory reads and admin writes.
 * Authorization lives in `src/service/admin-companies` / `src/service/rbac`;
 * this module only loads and mutates rows.
 */

import { asc, count, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { type CompanyRow, companies, employments } from "@/db/schema/parties";
import { payRuns } from "@/db/schema/run";

export class CompanyRepoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanyRepoError";
  }
}

export async function listAllCompanies(db: Database): Promise<CompanyRow[]> {
  return await db.select().from(companies).orderBy(asc(companies.name));
}

export async function listCompaniesByIds(
  db: Database,
  companyIds: readonly string[]
): Promise<CompanyRow[]> {
  if (companyIds.length === 0) {
    return [];
  }
  return await db
    .select()
    .from(companies)
    .where(inArray(companies.id, [...companyIds]))
    .orderBy(asc(companies.name));
}

export async function createCompany(
  db: Database,
  input: {
    code: string;
    name: string;
    epfNo?: string | null;
    socsoNo?: string | null;
    lhdnNo?: string | null;
    hrdfEnabled?: boolean;
    hrdfLevyPct?: string;
  }
): Promise<CompanyRow> {
  const [row] = await db
    .insert(companies)
    .values({
      code: input.code,
      name: input.name,
      epfNo: input.epfNo ?? null,
      socsoNo: input.socsoNo ?? null,
      lhdnNo: input.lhdnNo ?? null,
      hrdfEnabled: input.hrdfEnabled ?? false,
      hrdfLevyPct: input.hrdfLevyPct ?? "1",
    })
    .returning();
  if (row === undefined) {
    throw new CompanyRepoError("createCompany: insert returned no row");
  }
  return row;
}

export async function updateCompany(
  db: Database,
  companyId: string,
  patch: Partial<{
    name: string;
    epfNo: string | null;
    socsoNo: string | null;
    lhdnNo: string | null;
    hrdfEnabled: boolean;
    hrdfLevyPct: string;
  }>
): Promise<CompanyRow> {
  const [row] = await db
    .update(companies)
    .set(patch)
    .where(eq(companies.id, companyId))
    .returning();
  if (row === undefined) {
    throw new CompanyRepoError(`updateCompany: company ${companyId} not found`);
  }
  return row;
}

export async function countCompanyDependencies(
  db: Database,
  companyId: string
): Promise<{ readonly employments: number; readonly payRuns: number }> {
  const [employmentRow] = await db
    .select({ value: count() })
    .from(employments)
    .where(eq(employments.companyId, companyId));
  const [payRunRow] = await db
    .select({ value: count() })
    .from(payRuns)
    .where(eq(payRuns.companyId, companyId));
  return {
    employments: Number(employmentRow?.value ?? 0),
    payRuns: Number(payRunRow?.value ?? 0),
  };
}

export async function deleteCompany(
  db: Database,
  companyId: string
): Promise<void> {
  const deleted = await db
    .delete(companies)
    .where(eq(companies.id, companyId))
    .returning({ id: companies.id });
  if (deleted.length === 0) {
    throw new CompanyRepoError(`deleteCompany: company ${companyId} not found`);
  }
}
