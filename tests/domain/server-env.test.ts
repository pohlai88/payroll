import { describe, expect, it } from "vitest";
import { requireServerEnv } from "@/server/env";

describe("requireServerEnv", () => {
  it("reads from the provided env object (not only process.env)", () => {
    const env = requireServerEnv({
      DATABASE_URL: "postgres://test",
      NEON_AUTH_BASE_URL: "https://ep.example/neondb/auth",
    });
    expect(env.databaseUrl).toBe("postgres://test");
    expect(env.neonAuthBaseUrl).toBe("https://ep.example/neondb/auth");
    expect(env.neonAuthJwksUrl).toBe(
      "https://ep.example/neondb/auth/.well-known/jwks.json"
    );
    expect(env.port).toBe(8787);
    expect(env.corsOrigin).toBe("http://localhost:5173,http://localhost:5174");
    expect(env.r2).toBeNull();
  });

  it("reads R2 config when all five vars are set", () => {
    const env = requireServerEnv({
      DATABASE_URL: "postgres://test",
      NEON_AUTH_BASE_URL: "https://ep.example/neondb/auth",
      R2_ACCOUNT_ID: "acct",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "bucket",
      R2_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
    });
    expect(env.r2?.bucket).toBe("bucket");
  });

  it("fails when R2 env is only partially set", () => {
    expect(() =>
      requireServerEnv({
        DATABASE_URL: "postgres://test",
        NEON_AUTH_BASE_URL: "https://ep.example/neondb/auth",
        R2_BUCKET: "bucket",
      })
    ).toThrow(/R2_/);
  });

  it("prefers NEON_AUTH_JWKS_URL when set", () => {
    const env = requireServerEnv({
      DATABASE_URL: "postgres://test",
      NEON_AUTH_BASE_URL: "https://ep.example/neondb/auth",
      NEON_AUTH_JWKS_URL: "https://jwks.example/keys",
      PORT: "9000",
      CORS_ORIGIN: "http://localhost:3000",
    });
    expect(env.neonAuthJwksUrl).toBe("https://jwks.example/keys");
    expect(env.port).toBe(9000);
    expect(env.corsOrigin).toBe("http://localhost:3000");
  });

  it("fails when DATABASE_URL missing", () => {
    expect(() =>
      requireServerEnv({
        NEON_AUTH_BASE_URL: "https://ep.example/neondb/auth",
      })
    ).toThrow(/DATABASE_URL/);
  });

  it("fails when NEON_AUTH_BASE_URL missing on the provided env", () => {
    expect(() =>
      requireServerEnv({
        DATABASE_URL: "postgres://test",
      })
    ).toThrow(/NEON_AUTH_BASE_URL/);
  });
});
