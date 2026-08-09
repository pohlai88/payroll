/**
 * @feature shell
 * @layer test
 */

import { describe, expect, it } from "vitest";
import { applyEnvLines, parseEnvFile } from "@/server/load-env-local";

describe("parseEnvFile", () => {
  it("parses keys, strips quotes, skips comments and blanks", () => {
    const lines = parseEnvFile(`
# comment
DATABASE_URL=postgres://local
NEON_AUTH_BASE_URL="https://example.test/auth"
EMPTY=

SKIP
NAME='Ada'
`);
    expect(lines).toEqual([
      { key: "DATABASE_URL", value: "postgres://local" },
      { key: "NEON_AUTH_BASE_URL", value: "https://example.test/auth" },
      { key: "EMPTY", value: "" },
      { key: "NAME", value: "Ada" },
    ]);
  });
});

describe("applyEnvLines", () => {
  it("does not overwrite existing env keys", () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: "from-shell" };
    applyEnvLines(
      [
        { key: "DATABASE_URL", value: "from-file" },
        { key: "NEON_AUTH_BASE_URL", value: "https://auth" },
      ],
      env
    );
    expect(env.DATABASE_URL).toBe("from-shell");
    expect(env.NEON_AUTH_BASE_URL).toBe("https://auth");
  });
});
