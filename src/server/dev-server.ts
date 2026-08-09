/**
 * @feature shell
 * @layer spine
 *
 * Local API process — `npm run dev:api`.
 */

import { serve } from "@hono/node-server";
import { createDatabase, createPool } from "@/db/client";
import { createR2Store } from "@/domain/artifacts/r2-store";
import { setArtifactStore } from "@/service/artifacts";
import { createApp } from "./app";
import { createNeonJwtVerifier } from "./auth/jwt";
import { requireServerEnv } from "./env";
import { loadEnvLocal } from "./load-env-local";

loadEnvLocal();
const env = requireServerEnv();
const pool = createPool(env.databaseUrl);
const db = createDatabase(pool);
const verifyJwt = createNeonJwtVerifier({
  jwksUrl: env.neonAuthJwksUrl,
  authBaseUrl: env.neonAuthBaseUrl,
});

const artifactStore = env.r2 === null ? undefined : createR2Store(env.r2);
if (artifactStore !== undefined) {
  setArtifactStore(artifactStore);
}

const app = createApp({
  db,
  verifyJwt,
  corsOrigin: env.corsOrigin,
  artifactStore,
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
