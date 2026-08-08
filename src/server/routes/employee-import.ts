/**
 * Auth-gated employee master import — template download + create-only POST.
 */

import { Hono } from "hono";
import type { Database } from "@/db/client";
import {
  buildEmployeeImportTemplateCsv,
  EMPLOYEE_IMPORT_MAX_BODY_BYTES,
  EmployeeImportError,
  importEmployeeRowsForActor,
  parseEmployeeImportBody,
} from "@/service/employee-import";
import { requirePermission } from "@/service/rbac";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";

function optionalCompanyId(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function assertBodyWithinLimit(contentLengthHeader: string | undefined): void {
  if (contentLengthHeader === undefined) {
    return;
  }
  const contentLength = Number(contentLengthHeader);
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    throw new EmployeeImportError(
      "VALIDATION_ERROR",
      "invalid Content-Length",
      400
    );
  }
  if (contentLength > EMPLOYEE_IMPORT_MAX_BODY_BYTES) {
    throw new EmployeeImportError(
      "PAYLOAD_TOO_LARGE",
      `import body exceeds ${EMPLOYEE_IMPORT_MAX_BODY_BYTES} bytes`,
      413
    );
  }
}

export function employeeImportRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/employee-import/template", async (c) => {
    try {
      const user = c.get("user");
      const companyId = optionalCompanyId(c.req.query("companyId"));
      await requirePermission(db, user.id, "EMPLOYMENT", "CREATE", companyId);
      const csv = await buildEmployeeImportTemplateCsv(db);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="employee-import-template.csv"',
        },
      });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/employee-import", async (c) => {
    try {
      assertBodyWithinLimit(c.req.header("content-length"));
      const text = await c.req.text();
      const rows = parseEmployeeImportBody(c.req.header("content-type"), text);
      const report = await importEmployeeRowsForActor(
        db,
        c.get("user").id,
        rows
      );
      return c.json(report);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
