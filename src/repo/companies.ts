/**
 * Company party persistence — directory reads and admin writes.
 *
 * Authorization lives in `src/service/admin-companies` / `src/service/rbac`;
 * this module only loads and mutates rows.
 */

import { asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { type CompanyRow, companies } from "@/db/schema/parties";

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
