/**
 * Employee list HTTP: `GET /v1/employees` for pay-run creation pickers.
 */

import { and, eq, ilike, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "@/db/client";
import { employments, persons } from "@/db/schema/parties";
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
      const companyId = c.req.query("companyId") ?? undefined;
      const search = c.req.query("search") ?? undefined;

      const conditions = [
        companyId ? eq(employments.companyId, companyId) : undefined,
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
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      return c.json(rows satisfies EmployeeSummary[]);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
