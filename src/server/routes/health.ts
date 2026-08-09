/**
 * @feature health
 * @layer route
 * @surface GET /health
 * @chain
 *   route:   src/server/routes/health.ts
 *   spine:   app.ts → healthRoutes (public; outside /v1 auth)
 *
 * Liveness probe — no Bearer, no client method.
 */

import { Hono } from "hono";

export const healthRoutes = new Hono().get("/health", (c) =>
  c.json({ ok: true as const })
);
