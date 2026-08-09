/**
 * @feature admin-users
 * @layer route
 * @surface POST|GET /v1/admin/users; PATCH /v1/admin/users/:userId; POST|DELETE /v1/admin/users/:userId/roles
 * @chain
 *   ui:      src/web/admin/admin-page.tsx
 *   client:  getAdminUsers, createAdminUser, updateAdminUser, assignUserRole, revokeUserRole
 *   route:   src/server/routes/admin-users.ts
 *   service: src/service/admin-users.ts
 *   repo:    src/repo/rbac.ts
 *   schema:  src/db/schema/rbac.ts
 *   spine:   app.ts → adminUserRoutes; app.tsx + app-nav /admin
 *
 * SYSTEM_ADMIN user invite, status, and role assignment under /v1/admin/users.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
  assignUserRole,
  inviteUser,
  listUsers,
  revokeUserRoleAssignment,
  updateUserProfileFields,
  updateUserStatus,
} from "@/service/admin-users";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";

const inviteBody = z.object({
  email: z.string().min(1),
  name: z.string().min(1),
  roleCode: z.string().min(1).optional(),
  companyId: z.string().uuid().nullable().optional(),
});

const updateUserBody = z
  .object({
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
    name: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
  })
  .refine(
    (body) =>
      body.status !== undefined ||
      body.name !== undefined ||
      body.email !== undefined,
    { message: "At least one of status, name, or email is required" }
  );

const roleBody = z.object({
  roleCode: z.string().min(1),
  companyId: z.string().uuid().nullable().optional(),
});

export function adminUserRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.post("/admin/users", async (c) => {
    try {
      const body = inviteBody.parse(await c.req.json());
      const user = await inviteUser(db, {
        actorUserId: c.get("user").id,
        email: body.email,
        name: body.name,
        roleCode: body.roleCode,
        companyId: body.companyId,
      });
      return c.json(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          status: user.status,
          authSubject: user.authSubject,
        },
        201
      );
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/admin/users", async (c) => {
    try {
      const rows = await listUsers(db, c.get("user").id);
      return c.json({
        users: rows.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          status: u.status,
          authSubject: u.authSubject,
          createdAt: u.createdAt.toISOString(),
          roles: u.roles,
        })),
      });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.patch("/admin/users/:userId", async (c) => {
    try {
      const body = updateUserBody.parse(await c.req.json());
      const actorUserId = c.get("user").id;
      const userId = c.req.param("userId");

      let user =
        body.status === undefined
          ? null
          : await updateUserStatus(db, {
              actorUserId,
              userId,
              status: body.status,
            });

      if (body.name !== undefined || body.email !== undefined) {
        user = await updateUserProfileFields(db, {
          actorUserId,
          userId,
          name: body.name,
          email: body.email,
        });
      }

      // Unreachable: the Zod refine above guarantees at least one field, so
      // one of the branches above always assigns `user`.
      if (user === null) {
        throw new Error("unreachable: no fields to update");
      }

      return c.json({
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        authSubject: user.authSubject,
      });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/admin/users/:userId/roles", async (c) => {
    try {
      const body = roleBody.parse(await c.req.json());
      await assignUserRole(db, {
        actorUserId: c.get("user").id,
        userId: c.req.param("userId"),
        roleCode: body.roleCode,
        companyId: body.companyId,
      });
      return c.json({ ok: true as const });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.delete("/admin/users/:userId/roles", async (c) => {
    try {
      const body = roleBody.parse(await c.req.json());
      await revokeUserRoleAssignment(db, {
        actorUserId: c.get("user").id,
        userId: c.req.param("userId"),
        roleCode: body.roleCode,
        companyId: body.companyId,
      });
      return c.json({ ok: true as const });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
