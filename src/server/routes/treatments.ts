/**
 * @feature treatments
 * @layer route
 * @surface POST /v1/pay-items/:payItemId/treatments/departures; POST /v1/pay-items/:payItemId/pcb-classes/departures
 * @chain
 *   ui:      src/web/treatments/treatments-page.tsx
 *   client:  recordWageTreatmentDeparture, recordPcbClassDeparture
 *   route:   src/server/routes/treatments.ts
 *   service: src/service/treatments.ts
 *   repo:    (none — service → schema)
 *   schema:  src/db/schema/treatments.ts; catalog.ts; run.ts (auditEvents)
 *   spine:   app.ts → treatmentRoutes; app.tsx + app-nav /treatments
 *
 * Governed pay-item wage-treatment / PCB-class APPROVED_DEPARTURE writes.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
  recordPcbClassDepartureForActor,
  recordWageTreatmentDepartureForActor,
} from "@/service/treatments";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const wageDepartureBody = z.object({
  scheme: z.enum(["EPF", "SOCSO", "EIS", "HRD"]),
  subject: z.boolean(),
  effectiveFrom: isoDate,
  reason: z.string().min(1),
  approvedBy: z.string().min(1),
});

const pcbDepartureBody = z.object({
  class: z.enum(["NORMAL", "ADDITIONAL", "EXCLUDED"]),
  effectiveFrom: isoDate,
  reason: z.string().min(1),
  approvedBy: z.string().min(1),
});

export function treatmentRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.post("/pay-items/:payItemId/treatments/departures", async (c) => {
    try {
      const user = c.get("user");
      const body = wageDepartureBody.parse(await c.req.json());
      const result = await recordWageTreatmentDepartureForActor(
        db,
        { userId: user.id, email: user.email },
        {
          payItemId: c.req.param("payItemId"),
          ...body,
        }
      );
      return c.json(result, 201);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pay-items/:payItemId/pcb-classes/departures", async (c) => {
    try {
      const user = c.get("user");
      const body = pcbDepartureBody.parse(await c.req.json());
      const result = await recordPcbClassDepartureForActor(
        db,
        { userId: user.id, email: user.email },
        {
          payItemId: c.req.param("payItemId"),
          ...body,
        }
      );
      return c.json(result, 201);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
