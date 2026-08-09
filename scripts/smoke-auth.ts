/**
 * @feature auth
 * @layer spine
 *
 * One-shot local auth smoke: Neon Auth sign-in → JWT → GET /v1/me →
 * GET /v1/me/permissions (must be full SYSTEM_ADMIN matrix).
 * Usage: npm run auth:smoke
 */

import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  type PermissionAction,
  type PermissionResource,
} from "../src/domain/rbac/types";
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

type SerializedPermissionMatrix = Readonly<
  Record<PermissionResource, readonly PermissionAction[]>
>;

function assertFullPermissionMatrix(
  permissions: SerializedPermissionMatrix | null | undefined
): void {
  if (permissions === null || permissions === undefined) {
    throw new Error("permissions missing — expected SYSTEM_ADMIN full matrix");
  }
  for (const resource of PERMISSION_RESOURCES) {
    const actions = permissions[resource];
    if (actions === undefined) {
      throw new Error(`permissions missing resource ${resource}`);
    }
    const set = new Set(actions);
    for (const action of PERMISSION_ACTIONS) {
      if (!set.has(action)) {
        throw new Error(
          `permissions incomplete: ${resource}.${action} missing (not SYSTEM_ADMIN)`
        );
      }
    }
  }
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

  const authHeader = { authorization: `Bearer ${tokenBody.token}` };

  const me = await fetch(`${apiBase}/v1/me`, {
    headers: authHeader,
  });
  const meBody = await me.json();
  if (!me.ok) {
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
    throw new Error(`GET /v1/me failed ${me.status}`);
  }

  const perms = await fetch(`${apiBase}/v1/me/permissions`, {
    headers: authHeader,
  });
  const permsBody = (await perms.json()) as {
    permissions?: SerializedPermissionMatrix;
    message?: string;
  };
  if (!perms.ok) {
    throw new Error(
      `GET /v1/me/permissions failed ${perms.status}: ${permsBody.message ?? JSON.stringify(permsBody)}`
    );
  }
  assertFullPermissionMatrix(permsBody.permissions);

  console.log(
    JSON.stringify(
      {
        email,
        signIn: signIn.status,
        token: tokenRes.status,
        me: me.status,
        meBody,
        permissions: perms.status,
        systemAdmin: true,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
