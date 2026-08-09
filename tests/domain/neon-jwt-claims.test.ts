/**
 * @feature auth
 * @layer test
 */

import { describe, expect, it } from "vitest";
import { AuthError } from "@/server/auth/errors";
import { parseNeonAuthClaims } from "@/server/auth/jwt";

describe("parseNeonAuthClaims", () => {
  it("accepts sub + email", () => {
    const claims = parseNeonAuthClaims({
      sub: "neon-1",
      email: "ada@example.com",
      emailVerified: false,
      name: "Ada",
    });
    expect(claims).toEqual({
      sub: "neon-1",
      email: "ada@example.com",
      emailVerified: false,
      name: "Ada",
      banned: false,
    });
  });

  it("accepts id as subject when sub is absent", () => {
    const claims = parseNeonAuthClaims({
      id: "neon-2",
      email: "bob@example.com",
    });
    expect(claims.sub).toBe("neon-2");
  });

  it("rejects missing email", () => {
    expect(() => parseNeonAuthClaims({ sub: "x" })).toThrow(AuthError);
    try {
      parseNeonAuthClaims({ sub: "x" });
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe("UNAUTHORIZED");
    }
  });

  it("rejects banned users", () => {
    try {
      parseNeonAuthClaims({
        sub: "x",
        email: "a@b.com",
        banned: true,
      });
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe("AUTH_BANNED");
    }
  });
});
