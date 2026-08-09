/**
 * @feature reports
 * @layer route
 * @surface GET /v1/pay-runs/:runId/reports/payment-register|statutory-summary|exception-report
 * @chain
 *   ui:      src/web/reports/reports-page.tsx; payment-register.tsx; statutory-summary.tsx; exception-report.tsx
 *   client:  getPaymentRegister, getStatutorySummary, getExceptionReport
 *   route:   src/server/routes/pay-run-reports.ts
 *   service: src/service/pay-run-reports.ts (masking, totals, DTO assembly)
 *   repo:    src/repo/pay-run-reports.ts
 *   schema:  src/db/schema/run.ts; control.ts; findings.ts; parties.ts
 *   spine:   app.ts → payRunReportRoutes; app.tsx + app-nav /reports
 *
 * Run-scoped report facades. PAY_RUN READ is enforced here at the edge via
 * `requirePayRunAccess`, matching every other run-scoped route module.
 */
import { Hono } from "hono";
import type { Database } from "@/db/client";
import {
  loadExceptionReport,
  loadPaymentRegister,
  loadStatutorySummary,
} from "@/service/pay-run-reports";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";
import { requirePayRunAccess } from "./pay-run-access";

export function payRunReportRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/pay-runs/:runId/reports/payment-register", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      return c.json(await loadPaymentRegister(db, runId));
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/pay-runs/:runId/reports/statutory-summary", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      return c.json(await loadStatutorySummary(db, runId));
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/pay-runs/:runId/reports/exception-report", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      return c.json(await loadExceptionReport(db, runId));
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
