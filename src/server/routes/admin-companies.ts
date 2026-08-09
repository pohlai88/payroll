/**
 * @feature companies
 * @layer route
 * @surface GET|POST /v1/admin/companies; PATCH|DELETE /v1/admin/companies/:companyId
 * @chain
 *   ui:      src/web/companies/companies-page.tsx
 *   client:  getAdminCompanies, createAdminCompany, updateAdminCompany, deleteAdminCompany
 *   route:   src/server/routes/admin-companies.ts
 *   service: src/service/admin-companies.ts
 *   repo:    src/repo/companies.ts
 *   schema:  src/db/schema/parties.ts (companies)
 *   spine:   app.ts → adminCompanyRoutes; app.tsx + app-nav /companies
 *
 * Admin companies HTTP: directory CRUD under /v1/admin/companies.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
  createAdminCompany,
  deleteAdminCompany,
  listAdminCompanies,
  updateAdminCompany,
} from "@/service/admin-companies";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";

const createBody = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  epfNo: z.string().nullable().optional(),
  socsoNo: z.string().nullable().optional(),
  lhdnNo: z.string().nullable().optional(),
  hrdfEnabled: z.boolean().optional(),
  hrdfLevyPct: z.string().optional(),
});

const updateBody = z.object({
  name: z.string().min(1).optional(),
  epfNo: z.string().nullable().optional(),
  socsoNo: z.string().nullable().optional(),
  lhdnNo: z.string().nullable().optional(),
  hrdfEnabled: z.boolean().optional(),
  hrdfLevyPct: z.string().optional(),
});

export function adminCompanyRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/admin/companies", async (c) => {
    try {
      const companies = await listAdminCompanies(db, c.get("user").id);
      return c.json({ companies });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/admin/companies", async (c) => {
    try {
      const body = createBody.parse(await c.req.json());
      const company = await createAdminCompany(db, {
        actorUserId: c.get("user").id,
        ...body,
      });
      return c.json(company, 201);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.patch("/admin/companies/:companyId", async (c) => {
    try {
      const body = updateBody.parse(await c.req.json());
      const company = await updateAdminCompany(db, {
        actorUserId: c.get("user").id,
        companyId: c.req.param("companyId"),
        ...body,
      });
      return c.json(company);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.delete("/admin/companies/:companyId", async (c) => {
    try {
      const result = await deleteAdminCompany(db, {
        actorUserId: c.get("user").id,
        companyId: c.req.param("companyId"),
      });
      return c.json(result);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
