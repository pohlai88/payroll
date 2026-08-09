/**
 * @feature auth
 * @layer route
 *
 * Bearer JWT → invite-resolved app user on the Hono context.
 */

import { createMiddleware } from "hono/factory";
import type { Database } from "@/db/client";
import type { UserRow } from "@/db/schema/rbac";
import { AuthError } from "./errors";
import type { VerifyJwt } from "./jwt";
import { resolveAppUser } from "./resolve-user";

export interface AuthVariables {
  user: UserRow;
}

export function authMiddleware(deps: {
  readonly db: Database;
  readonly verifyJwt: VerifyJwt;
}) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
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
