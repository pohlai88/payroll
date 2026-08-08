/**
 * Invite-only resolveAppUser against a real database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "@/db/schema/rbac";
import {
  createUser,
  getUserByAuthSubject,
  linkUserAuthSubject,
} from "@/repo/rbac";
import { AuthError } from "@/server/auth/errors";
import type { NeonAuthClaims } from "@/server/auth/jwt";
import { resolveAppUser } from "@/server/auth/resolve-user";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "./harness/database";

const database = connectTestDatabase();
const { db } = database;

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  await seed(db);
});

beforeEach(async () => {
  await db.delete(users);
});

afterAll(async () => {
  await database.close();
});

function claims(
  partial: Pick<NeonAuthClaims, "sub" | "email"> &
    Partial<Omit<NeonAuthClaims, "sub" | "email">>
): NeonAuthClaims {
  return {
    emailVerified: undefined,
    name: undefined,
    banned: false,
    ...partial,
  };
}

describe("resolveAppUser", () => {
  it("returns INVITE_REQUIRED when email is unknown", async () => {
    try {
      await resolveAppUser(
        db,
        claims({ sub: "s1", email: "nobody@example.com" })
      );
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe("INVITE_REQUIRED");
    }
  });

  it("links auth_subject on first success for an invited user", async () => {
    await createUser(db, { email: "ada@example.com", name: "Ada" });
    const user = await resolveAppUser(
      db,
      claims({ sub: "neon-ada", email: "Ada@Example.com" })
    );
    expect(user.email).toBe("ada@example.com");
    expect(user.authSubject).toBe("neon-ada");
    const again = await getUserByAuthSubject(db, "neon-ada");
    expect(again?.id).toBe(user.id);
  });

  it("finds by auth_subject on subsequent calls", async () => {
    const created = await createUser(db, {
      email: "bob@example.com",
      name: "Bob",
    });
    await linkUserAuthSubject(db, {
      userId: created.id,
      authSubject: "neon-bob",
    });
    const user = await resolveAppUser(
      db,
      claims({ sub: "neon-bob", email: "other@example.com" })
    );
    expect(user.id).toBe(created.id);
  });

  it("rejects DISABLED users", async () => {
    await createUser(db, {
      email: "carol@example.com",
      name: "Carol",
      status: "DISABLED",
    });
    try {
      await resolveAppUser(
        db,
        claims({ sub: "neon-carol", email: "carol@example.com" })
      );
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe("USER_DISABLED");
    }
  });

  it("rejects subject conflict on invite email", async () => {
    const created = await createUser(db, {
      email: "erin@example.com",
      name: "Erin",
    });
    await linkUserAuthSubject(db, {
      userId: created.id,
      authSubject: "neon-erin",
    });
    try {
      await resolveAppUser(
        db,
        claims({ sub: "neon-other", email: "erin@example.com" })
      );
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe("AUTH_SUBJECT_CONFLICT");
    }
  });
});
