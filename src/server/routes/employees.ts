/**
 * Employee list HTTP: `GET /v1/employees` for pay-run creation pickers.
 * Always scoped to companies the caller can access (never cross-tenant dump).
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
