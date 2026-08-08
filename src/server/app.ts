/**
 * Hono application factory — injectable DB + JWT verifier for tests.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Database } from "@/db/client";
import type { ArtifactStore } from "@/domain/artifacts/store";
import type { VerifyJwt } from "./auth/jwt";
import { type AuthVariables, authMiddleware } from "./auth/middleware";
import { handleRouteError } from "./errors";
import { adminUserRoutes } from "./routes/admin-users";
import { employeeImportRoutes } from "./routes/employee-import";
import { employeeRoutes } from "./routes/employees";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { payRunRoutes } from "./routes/pay-run";
import { payRunControlRoutes } from "./routes/pay-run-control";
import { payRunWorkspaceRoutes } from "./routes/pay-run-workspace";

export interface AppDeps {
  readonly db: Database;
  readonly verifyJwt: VerifyJwt;
  readonly corsOrigin?: string;
  readonly artifactStore?: ArtifactStore;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: deps.corsOrigin ?? "http://localhost:5173",
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    })
  );

  app.route("/", healthRoutes);

  const v1 = new Hono<{ Variables: AuthVariables }>();
  v1.use("*", authMiddleware(deps));
  v1.route("/", meRoutes(deps.db));
  v1.route("/", adminUserRoutes(deps.db));
  v1.route("/", employeeImportRoutes(deps.db));
  v1.route("/", employeeRoutes(deps.db));
  v1.route("/", payRunRoutes(deps.db));
  v1.route(
    "/",
    payRunControlRoutes(deps.db, { artifactStore: deps.artifactStore })
  );
  v1.route("/", payRunWorkspaceRoutes(deps.db));
  v1.onError((error, c) => handleRouteError(c, error));

  app.route("/v1", v1);
  app.onError((error, c) => handleRouteError(c, error));

  return app;
}
