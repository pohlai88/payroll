/**
 * @feature auth
 * @layer route
 *
 * Bearer JWT → invite-resolved app user on the Hono context.
 *
 * When `DEV_AUTH_BYPASS=true` (local dev only), skips JWT verification and
 * resolves the developer user directly from the database by email.
 */

import { createMiddleware } from "hono/factory";
import type { Database } from "@/db/client";
import type { UserRow } from "@/db/schema/rbac";
import { getUserByEmail } from "@/repo/rbac";
import { AuthError } from "./errors";
import type { VerifyJwt } from "./jwt";
import { resolveAppUser } from "./resolve-user";

export interface AuthVariables {
  user: UserRow;
}

const DEV_EMAIL = "dev@example.com";

async function resolveDevUser(db: Database): Promise<UserRow> {
  const user = await getUserByEmail(db, DEV_EMAIL);
  if (user === null) {
    throw new AuthError(
      "UNAUTHORIZED",
      `DEV_AUTH_BYPASS: no user with email ${DEV_EMAIL}. Run: npm run db:seed && npm run setup:dev-user`
    );
  }
  return user;
}

export function authMiddleware(deps: {
  readonly db: Database;
  readonly verifyJwt: VerifyJwt;
}) {
  const devBypass = process.env.DEV_AUTH_BYPASS === "true";

  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    if (devBypass) {
      const user = await resolveDevUser(deps.db);
      c.set("user", user);
      await next();
      return;
    }

    const header = c.req.header("authorization");
    if (header === undefined || !header.toLowerCase().startsWith("bearer ")) {
      throw new AuthError("UNAUTHORIZED", "Missing Bearer token");
    }
    const token = header.slice("bearer ".length).trim();
    if (token.length === 0) {
      throw new AuthError("UNAUTHORIZED", "Missing Bearer token");
    }

    const claims = await deps.verifyJwt(token);
    const user = await resolveAppUser(deps.db, claims);
    c.set("user", user);
    await next();
  });
}
