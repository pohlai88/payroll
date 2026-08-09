/**
 * @feature rbac
 * @layer route
 * @surface GET|POST /v1/admin/roles; DELETE /v1/admin/roles/:roleId; POST|DELETE /v1/admin/roles/:roleId/permissions
 * @chain
 *   ui:      src/web/admin/roles-page.tsx
 *   client:  getAdminRoles, createAdminRole, deleteAdminRole, setAdminRolePermission
 *   route:   src/server/routes/admin-roles.ts
 *   service: src/service/admin-roles.ts
 *   repo:    src/repo/rbac.ts
 *   schema:  src/db/schema/rbac.ts (roles, role_permissions)
 *   spine:   app.ts → adminRoleRoutes; app.tsx + app-nav /roles
 *
 * SYSTEM_ADMIN role + permission-matrix HTTP under /v1/admin/roles.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "@/db/client";
import { PERMISSION_ACTIONS, PERMISSION_RESOURCES } from "@/domain/rbac/types";
import {
  createAdminRole,
  deleteAdminRole,
  listAdminRoles,
  setRolePermission,
} from "@/service/admin-roles";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";

const createBody = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  scope: z.enum(["GLOBAL", "COMPANY"]),
});

const permissionBody = z.object({
  resource: z.enum(PERMISSION_RESOURCES),
  action: z.enum(PERMISSION_ACTIONS),
});

export function adminRoleRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/admin/roles", async (c) => {
    try {
      const roles = await listAdminRoles(db, c.get("user").id);
      return c.json({ roles });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/admin/roles", async (c) => {
    try {
      const body = createBody.parse(await c.req.json());
      const role = await createAdminRole(db, {
        actorUserId: c.get("user").id,
        ...body,
      });
      return c.json(role, 201);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.delete("/admin/roles/:roleId", async (c) => {
    try {
      const result = await deleteAdminRole(db, {
        actorUserId: c.get("user").id,
        roleId: c.req.param("roleId"),
      });
      return c.json(result);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/admin/roles/:roleId/permissions", async (c) => {
    try {
      const body = permissionBody.parse(await c.req.json());
      const role = await setRolePermission(db, {
        actorUserId: c.get("user").id,
        roleId: c.req.param("roleId"),
        resource: body.resource,
        action: body.action,
        granted: true,
      });
      return c.json(role);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.delete("/admin/roles/:roleId/permissions", async (c) => {
    try {
      const body = permissionBody.parse(await c.req.json());
      const role = await setRolePermission(db, {
        actorUserId: c.get("user").id,
        roleId: c.req.param("roleId"),
        resource: body.resource,
        action: body.action,
        granted: false,
      });
      return c.json(role);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
