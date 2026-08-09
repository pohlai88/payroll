/**
 * GET /v1/pay-runs/:runId/lines/:lineId/derivation?root=pcbNet
 * Compute-on-read derivation tree for the workspace derivation drawer.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "@/db/client";
import { getLineDerivation } from "@/service/line-derivation";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";
import { requirePayRunAccess } from "./pay-run-access";

const querySchema = z.object({
  root: z.string().min(1).optional(),
});

export function payRunDerivationRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/pay-runs/:runId/lines/:lineId/derivation", async (c) => {
    try {
      const runId = c.req.param("runId");
      const lineId = c.req.param("lineId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      const query = querySchema.parse({
        root: c.req.query("root") ?? undefined,
      });
      const dto = await getLineDerivation(db, runId, lineId, query.root);
      return c.json(dto);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
