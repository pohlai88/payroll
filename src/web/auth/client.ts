/**
 * Neon Auth client for the SPA.
 *
 * Auth-endpoint session/cookie behaviour is owned by the SDK against
 * VITE_NEON_AUTH_URL. Business API calls use Bearer tokens only (see api/client).
 */

import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js/auth/vanilla/adapters";
import { SessionExpiredError } from "@/web/api/types";

function requireNeonAuthUrl(): string {
  const url = import.meta.env.VITE_NEON_AUTH_URL;
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("VITE_NEON_AUTH_URL is not set");
  }
  return url.trim();
}

interface TokenResult {
  data?: { token?: string | null } | null;
  error?: { message?: string } | null;
}

type AuthClient = ReturnType<
  typeof createAuthClient<
    ReturnType<ReturnType<typeof BetterAuthVanillaAdapter>>
  >
>;

let authClientSingleton: AuthClient | null = null;

/**
 * Better Auth vanilla client. Cross-origin session cookies for the Auth URL
 * stay at the Auth SDK layer only.
 */
function getAuthClient(): AuthClient {
  if (authClientSingleton === null) {
    authClientSingleton = createAuthClient(requireNeonAuthUrl(), {
      adapter: BetterAuthVanillaAdapter(),
    });
  }
  return authClientSingleton;
}

/**
 * Ask Neon Auth for a current JWT. Does not encode Neon session-refresh details.
 */
export async function acquireAccessToken(): Promise<string> {
  const client = getAuthClient() as AuthClient & {
    token?: (opts?: unknown) => Promise<TokenResult>;
  };
  if (typeof client.token !== "function") {
    throw new SessionExpiredError(
      "Neon Auth client does not expose token(); check @neondatabase/neon-js version"
    );
  }
  const result = await client.token();
  if (result.error) {
    throw new SessionExpiredError(
      result.error.message ?? "Token acquisition failed"
    );
  }
  const token = result.data?.token;
  if (typeof token !== "string" || token.length === 0) {
    throw new SessionExpiredError("No access token available");
  }
  return token;
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<void> {
  const result = await getAuthClient().signIn.email({ email, password });
  if (result.error) {
    throw new Error(result.error.message ?? "Sign-in failed");
  }
}

export async function signOutAuth(): Promise<void> {
  await getAuthClient().signOut();
}

export async function getAuthSession(): Promise<{
  email: string;
  name: string;
} | null> {
  const { data } = await getAuthClient().getSession();
  if (data === null || data === undefined || !("user" in data)) {
    return null;
  }
  const { user } = data;
  if (user === null || user === undefined) {
    return null;
  }
  const { email, name } = user;
  return {
    email: typeof email === "string" ? email : "",
    name: typeof name === "string" ? name : "",
  };
}
