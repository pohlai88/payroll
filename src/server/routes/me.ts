import { Hono } from "hono";
import type { Database } from "@/db/client";
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  type PermissionAction,
  type PermissionResource,
} from "@/domain/rbac/types";
import {
  listAccessibleCompanies,
  listEffectivePermissions,
} from "@/service/rbac";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";

export function meRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/me", async (c) => {
    try {
      const user = c.get("user");
      const companies = await listAccessibleCompanies(db, user.id);
      return c.json({
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        companies,
      });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/me/permissions", async (c) => {
    try {
      const user = c.get("user");
      const companyId = c.req.query("companyId") ?? null;
      const matrix = await listEffectivePermissions(db, user.id, companyId);
      const serialized = {} as Record<PermissionResource, PermissionAction[]>;
      for (const resource of PERMISSION_RESOURCES) {
        serialized[resource] = PERMISSION_ACTIONS.filter((action) =>
          matrix[resource].has(action)
        );
      }
      return c.json({ companyId, permissions: serialized });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
