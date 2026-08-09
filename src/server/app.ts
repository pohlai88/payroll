/**
 * @feature shell
 * @layer spine
 *
 * Hono application factory — injectable DB + JWT verifier for tests.
 * Per-route registration lines carry their own `@feature … @layer spine` banners.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Database } from "@/db/client";
import type { ArtifactStore } from "@/domain/artifacts/store";
import { setArtifactStore } from "@/service/artifacts";
import type { VerifyJwt } from "./auth/jwt";
import { type AuthVariables, authMiddleware } from "./auth/middleware";
import { handleRouteError } from "./errors";
import { adminCompanyRoutes } from "./routes/admin-companies";
import { adminUserRoutes } from "./routes/admin-users";
import { employeeImportRoutes } from "./routes/employee-import";
import { employeeRemunerationRoutes } from "./routes/employee-remuneration";
import { employeeRoutes } from "./routes/employees";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { payRunRoutes } from "./routes/pay-run";
import { payRunControlRoutes } from "./routes/pay-run-control";
import { payRunDerivationRoutes } from "./routes/pay-run-derivation";
import { payRunDiffRoutes } from "./routes/pay-run-diff";
import { payRunPayslipRoutes } from "./routes/pay-run-payslip";
import { payRunReportRoutes } from "./routes/pay-run-reports";
import { payRunWorkspaceRoutes } from "./routes/pay-run-workspace";
import { transferRoutes } from "./routes/transfers";
import { treatmentRoutes } from "./routes/treatments";

export interface AppDeps {
  readonly db: Database;
  readonly verifyJwt: VerifyJwt;
  readonly corsOrigin?: string;
  readonly artifactStore?: ArtifactStore;
}

export function createApp(deps: AppDeps): Hono {
  if (deps.artifactStore !== undefined) {
    setArtifactStore(deps.artifactStore);
  }

  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: (deps.corsOrigin ?? "http://localhost:5173,http://localhost:5174")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    })
  );

  // --- @feature health @layer spine ---
  app.route("/", healthRoutes);

  const v1 = new Hono<{ Variables: AuthVariables }>();
  v1.use("*", authMiddleware(deps));
  // --- @feature me @layer spine ---
  v1.route("/", meRoutes(deps.db));
  // --- @feature admin-users @layer spine ---
  v1.route("/", adminUserRoutes(deps.db));
  // --- @feature companies @layer spine ---
  v1.route("/", adminCompanyRoutes(deps.db));
  // --- @feature employee-import @layer spine ---
  v1.route("/", employeeImportRoutes(deps.db));
  // --- @feature employees @layer spine ---
  v1.route("/", employeeRoutes(deps.db));
  // --- @feature pay-run @layer spine ---
  v1.route("/", payRunRoutes(deps.db));
  // --- @feature control @layer spine ---
  v1.route("/", payRunControlRoutes(deps.db));
  // --- @feature workspace @layer spine ---
  v1.route("/", payRunWorkspaceRoutes(deps.db));
  // --- @feature payslip @layer spine ---
  v1.route("/", payRunPayslipRoutes(deps.db));
  // --- @feature diff @layer spine ---
  v1.route("/", payRunDiffRoutes(deps.db));
  // --- @feature derivation @layer spine ---
  v1.route("/", payRunDerivationRoutes(deps.db));
  // --- @feature reports @layer spine ---
  v1.route("/", payRunReportRoutes(deps.db));
  // --- @feature remuneration @layer spine ---
  v1.route("/", employeeRemunerationRoutes(deps.db));
  // --- @feature transfer @layer spine ---
  v1.route("/", transferRoutes(deps.db));
  // --- @feature treatments @layer spine ---
  v1.route("/", treatmentRoutes(deps.db));
  v1.onError((error, c) => handleRouteError(c, error));

  app.route("/v1", v1);
  app.onError((error, c) => handleRouteError(c, error));

  return app;
}
