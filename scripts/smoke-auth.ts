/**
 * @feature auth
 * @layer spine
 *
 * One-shot local auth smoke: Neon Auth sign-in → JWT → GET /v1/me.
 * Usage: npx tsx scripts/smoke-auth.ts
 */

import { loadEnvLocal } from "../src/server/load-env-local";

loadEnvLocal();

const authBase = process.env.NEON_AUTH_BASE_URL?.replace(/\/$/, "");
const apiBase = (
  process.env.VITE_API_BASE ?? `http://localhost:${process.env.PORT ?? "8787"}`
).replace(/\/$/, "");
const email = process.env.VITE_DEV_EMAIL ?? "dev@example.com";
const password = process.env.VITE_DEV_PASSWORD ?? "dev123456";

if (authBase === undefined || authBase === "") {
  throw new Error("NEON_AUTH_BASE_URL is not set");
}

async function main(): Promise<void> {
  const signIn = await fetch(`${authBase}/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:5173",
    },
    body: JSON.stringify({ email, password }),
  });
  const signInBody = (await signIn.json()) as {
    token?: string;
    message?: string;
    code?: string;
  };
  if (!signIn.ok) {
    throw new Error(
      `sign-in failed ${signIn.status}: ${signInBody.code ?? ""} ${signInBody.message ?? JSON.stringify(signInBody)}`
    );
  }

  const cookie = signIn.headers.getSetCookie?.().join("; ") ?? "";
  const sessionToken = signInBody.token;
  if (typeof sessionToken !== "string" || sessionToken.length === 0) {
    throw new Error("sign-in returned no session token");
  }

  const tokenRes = await fetch(`${authBase}/token`, {
    headers: {
      origin: "http://localhost:5173",
      cookie:
        cookie.length > 0
          ? cookie
          : `__Secure-neon-auth.session_token=${sessionToken}`,
    },
  });
  const tokenBody = (await tokenRes.json()) as {
    token?: string;
    message?: string;
  };
  if (!tokenRes.ok || typeof tokenBody.token !== "string") {
    throw new Error(
      `token failed ${tokenRes.status}: ${tokenBody.message ?? JSON.stringify(tokenBody)}`
    );
  }

  const me = await fetch(`${apiBase}/v1/me`, {
    headers: { authorization: `Bearer ${tokenBody.token}` },
  });
  const meBody = await me.json();
  console.log(
    JSON.stringify(
      {
        email,
        signIn: signIn.status,
        token: tokenRes.status,
        me: me.status,
        meBody,
      },
      null,
      2
    )
  );
  if (!me.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
