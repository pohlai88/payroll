/**
 * Invite-only Neon Auth → app `users` resolution.
 */

import type { Database } from "@/db/client";
import type { UserRow } from "@/db/schema/rbac";
import { normalizeEmail } from "@/domain/rbac/email";
import {
  getUserByAuthSubject,
  getUserByEmail,
  linkUserAuthSubject,
} from "@/repo/rbac";
import { AuthError } from "./errors";
import type { NeonAuthClaims } from "./jwt";

export async function resolveAppUser(
  db: Database,
  claims: NeonAuthClaims
): Promise<UserRow> {
  const bySubject = await getUserByAuthSubject(db, claims.sub);
  if (bySubject !== null) {
    assertActive(bySubject);
    return bySubject;
  }

  const invited = await getUserByEmail(db, claims.email);
  if (invited === null) {
    throw new AuthError(
      "INVITE_REQUIRED",
      `No invite for ${normalizeEmail(claims.email)}`
    );
  }

  if (invited.authSubject !== null && invited.authSubject !== claims.sub) {
    throw new AuthError(
      "AUTH_SUBJECT_CONFLICT",
      "Invite email is linked to a different Neon Auth subject"
    );
  }

  assertActive(invited);

  if (invited.authSubject === claims.sub) {
    return invited;
  }

  try {
    const linked = await linkUserAuthSubject(db, {
      userId: invited.id,
      authSubject: claims.sub,
    });
    assertActive(linked);
    return linked;
  } catch (error) {
    // Unique race: another request linked this subject (or this user). Re-resolve.
    const again = await getUserByAuthSubject(db, claims.sub);
    if (again !== null) {
      assertActive(again);
      return again;
    }
    const byEmail = await getUserByEmail(db, claims.email);
    if (byEmail !== null && byEmail.authSubject === claims.sub) {
      assertActive(byEmail);
      return byEmail;
    }
    throw error;
  }
}

function assertActive(user: UserRow): void {
  if (user.status === "DISABLED") {
    throw new AuthError("USER_DISABLED", `User ${user.id} is disabled`);
  }
}
