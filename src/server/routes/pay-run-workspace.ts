/**
 * `GET /v1/pay-runs/:runId/workspace` — the main workspace read model.
 */

import { Hono } from "hono";
import type { Database } from "@/db/client";
import { loadWorkspaceView } from "@/repo/workspace";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";
import { requirePayRunAccess } from "./pay-run-access";

export function payRunWorkspaceRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/pay-runs/:runId/workspace", async (c) => {
    try {
      const runId = c.req.param("runId");
      const user = c.get("user");
      await requirePayRunAccess(db, user.id, "READ", runId);
      const view = await loadWorkspaceView(db, runId, user.id);
      if (view === null) {
        return c.json(
          { code: "NOT_FOUND", message: `no such run: ${runId}` },
          404
        );
      }
      return c.json(view);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
