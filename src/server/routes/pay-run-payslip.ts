/**
 * @feature payslip
 * @layer route
 * @surface GET /v1/pay-runs/:runId/payslips; GET /v1/pay-runs/:runId/lines/:lineId/payslip
 * @chain
 *   ui:      src/web/payrun/payslip-page.tsx; src/web/payrun/payslip-document/*
 *   client:  getPayslip, getPayslipIndex
 *   route:   src/server/routes/pay-run-payslip.ts
 *   service: (none — route → repo)
 *   repo:    src/repo/payslip.ts
 *   schema:  src/db/schema/run.ts; parties.ts
 *   spine:   app.ts → payRunPayslipRoutes; app.tsx /pay-runs/:runId/payslip/:lineId
 *
 * Payslip index + document read facade. FE DTO twin: payrun/payslip-document/types.ts (not types.ts).
 */

import { Hono } from "hono";
import type { Database } from "@/db/client";
import { listPayslipIndex, loadPayslipDocument } from "@/repo/payslip";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";
import { requirePayRunAccess } from "./pay-run-access";

export function payRunPayslipRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/pay-runs/:runId/payslips", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      const payslips = await listPayslipIndex(db, runId);
      return c.json({ payslips });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/pay-runs/:runId/lines/:lineId/payslip", async (c) => {
    try {
      const runId = c.req.param("runId");
      const lineId = c.req.param("lineId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);

      const result = await loadPayslipDocument(db, runId, lineId);
      if (!result.ok) {
        const message =
          result.missing === "run"
            ? `no such run: ${runId}`
            : `no such line: ${lineId}`;
        return c.json({ code: "NOT_FOUND", message }, 404);
      }
      return c.json(result.document);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
