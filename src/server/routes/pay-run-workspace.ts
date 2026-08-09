/**
 * @feature workspace
 * @layer route
 * @surface GET /v1/pay-runs/:runId/workspace
 * @chain
 *   ui:      src/web/payrun/workspace.tsx
 *   client:  getWorkspace
 *   route:   src/server/routes/pay-run-workspace.ts
 *   service: (none — route → repo; AuthZ via pay-run-access)
 *   repo:    src/repo/workspace.ts; src/repo/pay-line-roots.ts
 *   schema:  src/db/schema/run.ts; findings.ts; parties.ts
 *   spine:   app.ts → payRunWorkspaceRoutes; app.tsx /pay-runs/:runId
 *
 * Main pay-run workspace read model (no dedicated service layer yet).
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
      const view = await loadWorkspaceView(db, runId);
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
