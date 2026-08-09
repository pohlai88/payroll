/**
 * @feature auth
 * @layer route
 *
 * Neon Auth JWT verification and claim parsing.
 *
 * The API accepts Bearer tokens only — session cookies stay with Neon Auth /
 * the Phase 4 SPA. Verification uses the branch JWKS (EdDSA).
 */

import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import { AuthError } from "./errors";

export interface NeonAuthClaims {
  readonly sub: string;
  readonly email: string;
  readonly emailVerified: boolean | undefined;
  readonly name: string | undefined;
  readonly banned: boolean;
}

export type VerifyJwt = (token: string) => Promise<NeonAuthClaims>;

/**
 * Pull the identity fields we care about out of a verified payload.
 *
 * Invite-only access is enforced later via the app `users` table — Phase 3
 * does not require `emailVerified`.
 */
export function parseNeonAuthClaims(payload: JWTPayload): NeonAuthClaims {
  const idClaim = (payload as JWTPayload & { id?: unknown }).id;
  const subRaw =
    payload.sub ?? (typeof idClaim === "string" ? idClaim : undefined);
  if (typeof subRaw !== "string" || subRaw.trim().length === 0) {
    throw new AuthError("UNAUTHORIZED", "JWT missing subject");
  }

  const emailRaw = payload.email;
  if (typeof emailRaw !== "string" || emailRaw.trim().length === 0) {
    throw new AuthError("UNAUTHORIZED", "JWT missing email");
  }

  if (payload.banned === true) {
    throw new AuthError("AUTH_BANNED", "Neon Auth user is banned");
  }

  const emailVerified =
    typeof payload.emailVerified === "boolean"
      ? payload.emailVerified
      : undefined;
  const name = typeof payload.name === "string" ? payload.name : undefined;

  return {
    sub: subRaw.trim(),
    email: emailRaw,
    emailVerified,
    name,
    banned: false,
  };
}

export function createNeonJwtVerifier(input: {
  readonly jwksUrl: string;
  readonly authBaseUrl: string;
}): VerifyJwt {
  const jwks = createRemoteJWKSet(new URL(input.jwksUrl));
  const { origin } = new URL(input.authBaseUrl);

  return async (token: string): Promise<NeonAuthClaims> => {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: origin,
        audience: origin,
        algorithms: ["EdDSA"],
      });
      return parseNeonAuthClaims(payload);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      // Custom AuthError(code, message, ErrorOptions) — cause is the 3rd arg.
      // biome-ignore lint/style/useErrorCause: ErrorOptions passed through to Error
      throw new AuthError("UNAUTHORIZED", "JWT verification failed", {
        cause: error,
      });
    }
  };
}
