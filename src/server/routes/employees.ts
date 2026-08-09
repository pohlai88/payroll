/**
 * Employee list HTTP: `GET /v1/employees` for pay-run creation pickers.
 * Always scoped to companies the caller can access (never cross-tenant dump).
 */

import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "@/db/client";
import { employments, persons } from "@/db/schema/parties";
import { PermissionDeniedError } from "@/domain/rbac/authorize";
import { listAccessibleCompanies } from "@/service/rbac";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";

export interface EmployeeSummary {
  id: string;
  code: string;
  name: string;
  companyId: string;
  status: "ACTIVE" | "TERMINATED";
}

export function employeeRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/employees", async (c) => {
    try {
      const user = c.get("user");
      const companyId = c.req.query("companyId") ?? undefined;
      const search = c.req.query("search") ?? undefined;
      const accessible = await listAccessibleCompanies(db, user.id);
      const accessibleIds = accessible.map((company) => company.id);

      if (companyId !== undefined && !accessibleIds.includes(companyId)) {
        throw new PermissionDeniedError(
          user.id,
          "EMPLOYMENT",
          "READ",
          companyId
        );
      }

      const scopedCompanyIds =
        companyId === undefined ? accessibleIds : [companyId];

      if (scopedCompanyIds.length === 0) {
        return c.json([] satisfies EmployeeSummary[]);
      }

      const conditions = [
        inArray(employments.companyId, scopedCompanyIds),
        search
          ? or(
              ilike(persons.name, `%${search}%`),
              ilike(employments.employeeCode, `%${search}%`)
            )
          : undefined,
      ].filter((cond): cond is NonNullable<typeof cond> => cond !== undefined);

      const rows = await db
        .select({
          id: employments.id,
          code: employments.employeeCode,
          name: persons.name,
          companyId: employments.companyId,
          status: sql<
            "ACTIVE" | "TERMINATED"
          >`case when ${employments.terminationDate} is null then 'ACTIVE' else 'TERMINATED' end`,
        })
        .from(employments)
        .innerJoin(persons, eq(employments.personId, persons.id))
        .where(and(...conditions));

      return c.json(rows satisfies EmployeeSummary[]);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
