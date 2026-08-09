import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
  createAdminCompany,
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

  return app;
}
