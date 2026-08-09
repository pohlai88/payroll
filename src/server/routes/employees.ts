/**
 * @feature employees
 * @layer route
 * @surface GET /v1/employees
 * @chain
 *   ui:      src/web/employees/employees-page.tsx
 *   client:  getEmployees
 *   route:   src/server/routes/employees.ts
 *   service: src/service/employees.ts
 *   repo:    src/repo/employees.ts
 *   schema:  src/db/schema/parties.ts (persons, employments)
 *   spine:   app.ts → employeeRoutes; app.tsx + app-nav /employees
 *
 * Tenant-scoped employee directory for roster + pay-run pickers.
 */

import { Hono } from "hono";
import type { Database } from "@/db/client";
import { listEmployeesForActor } from "@/service/employees";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";

export function employeeRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/employees", async (c) => {
    try {
      const user = c.get("user");
      const companyId = c.req.query("companyId") ?? undefined;
      const search = c.req.query("search") ?? undefined;
      const rows = await listEmployeesForActor(db, user.id, {
        companyId,
        search,
      });
      return c.json(rows);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
