/**
 * Process env for the Hono API. Missing required vars fail at startup.
 */

export interface ServerEnv {
  readonly databaseUrl: string;
  readonly neonAuthBaseUrl: string;
  readonly neonAuthJwksUrl: string;
  readonly port: number;
  readonly corsOrigin: string;
  readonly r2: {
    readonly accountId: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly bucket: string;
    readonly endpoint: string;
  } | null;
}

const TRAILING_SLASH = /\/$/;

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is not set`);
  }
  return value.trim();
}

export function requireServerEnv(
  env: NodeJS.ProcessEnv = process.env
): ServerEnv {
  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is not set");
  }

  const neonAuthBaseUrl = requireEnv(env, "NEON_AUTH_BASE_URL");
  const neonAuthJwksUrl =
    env.NEON_AUTH_JWKS_URL?.trim() ||
    `${neonAuthBaseUrl.replace(TRAILING_SLASH, "")}/.well-known/jwks.json`;

  const portRaw = env.PORT?.trim();
  const port = portRaw === undefined || portRaw === "" ? 8787 : Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT is not a positive integer: ${portRaw}`);
  }

  const corsRaw = env.CORS_ORIGIN?.trim();
  const corsOrigin =
    corsRaw === undefined || corsRaw === "" ? "http://localhost:5173" : corsRaw;

  const r2AccountId = env.R2_ACCOUNT_ID?.trim();
  const r2AccessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const r2Secret = env.R2_SECRET_ACCESS_KEY?.trim();
  const r2Bucket = env.R2_BUCKET?.trim();
  const r2Endpoint = env.R2_ENDPOINT?.trim();
  const r2Keys = [r2AccountId, r2AccessKeyId, r2Secret, r2Bucket, r2Endpoint];
  const r2Configured = r2Keys.every((v) => v !== undefined && v !== "");
  const r2Partial = r2Keys.some((v) => v !== undefined && v !== "");
  if (r2Partial && !r2Configured) {
    throw new Error(
      "R2_* env is partially set; provide R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT"
    );
  }

  return {
    databaseUrl: databaseUrl.trim(),
    neonAuthBaseUrl,
    neonAuthJwksUrl,
    port,
    corsOrigin,
    r2: r2Configured
      ? {
          accountId: r2AccountId as string,
          accessKeyId: r2AccessKeyId as string,
          secretAccessKey: r2Secret as string,
          bucket: r2Bucket as string,
          endpoint: r2Endpoint as string,
        }
      : null,
  };
}
