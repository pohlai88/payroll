/**
 * @feature remuneration
 * @layer route
 * @surface GET /v1/employees/:employeeId/remuneration-summary/:year
 * @chain
 *   ui:      src/web/reports/reports-page.tsx; annual-remuneration-summary.tsx
 *   client:  getAnnualRemunerationSummary
 *   route:   src/server/routes/employee-remuneration.ts
 *   service: src/service/employee-remuneration.ts (REPORT READ + aggregation)
 *   repo:    src/repo/employee-remuneration.ts
 *   schema:  src/db/schema/run.ts; parties.ts
 *   spine:   app.ts → employeeRemunerationRoutes; reports portal annual tab
 *
 * Annual remuneration summary (not Form EA / C.P.8A).
 */
import { Hono } from "hono";
import type { Database } from "@/db/client";
import { getAnnualRemunerationSummaryForActor } from "@/service/employee-remuneration";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";

const MIN_YEAR = 2000;
const MAX_YEAR = 2999;

export function employeeRemunerationRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/employees/:employeeId/remuneration-summary/:year", async (c) => {
    try {
      const employeeId = c.req.param("employeeId");
      const year = Number(c.req.param("year"));
      if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
        return c.json(
          { code: "VALIDATION_ERROR", message: "invalid year" },
          400
        );
      }

      const summary = await getAnnualRemunerationSummaryForActor(
        db,
        c.get("user").id,
        employeeId,
        year
      );
      return c.json(summary);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
