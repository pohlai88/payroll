/**
 * users.auth_subject — Neon Auth subject linking for invite-only identity.
 */

import { isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "@/db/schema/rbac";
import { normalizeEmail } from "@/domain/rbac/email";
import {
  createUser,
  getUserByAuthSubject,
  getUserByEmail,
  linkUserAuthSubject,
  RbacRepoError,
} from "@/repo/rbac";
import { seed } from "../../scripts/seed";
import {
  ALL_TABLES,
  connectTestDatabase,
  expectRejected,
} from "./harness/database";

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

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
  });

  it("rejects blank", () => {
    expect(() => normalizeEmail("   ")).toThrow(/blank/);
  });
});

describe("users.auth_subject", () => {
  it("createUser stores null authSubject and normalized email", async () => {
    const row = await createUser(db, {
      email: "  Ada@Example.COM ",
      name: "Ada",
    });
    expect(row.email).toBe("ada@example.com");
    expect(row.authSubject).toBeNull();
  });

  it("getUserByEmail matches normalized form", async () => {
    await createUser(db, { email: "bob@example.com", name: "Bob" });
    const found = await getUserByEmail(db, "  Bob@Example.COM ");
    expect(found?.name).toBe("Bob");
  });

  it("linkUserAuthSubject sets subject and getUserByAuthSubject finds it", async () => {
    const user = await createUser(db, {
      email: "carol@example.com",
      name: "Carol",
    });
    const linked = await linkUserAuthSubject(db, {
      userId: user.id,
      authSubject: "neon-sub-carol",
    });
    expect(linked.authSubject).toBe("neon-sub-carol");
    const found = await getUserByAuthSubject(db, "neon-sub-carol");
    expect(found?.id).toBe(user.id);
  });

  it("rejects blank auth_subject", async () => {
    const user = await createUser(db, {
      email: "dave@example.com",
      name: "Dave",
    });
    await expect(
      linkUserAuthSubject(db, { userId: user.id, authSubject: "  " })
    ).rejects.toBeInstanceOf(RbacRepoError);
  });

  it("rejects linking a different subject onto an already-linked user", async () => {
    const user = await createUser(db, {
      email: "erin@example.com",
      name: "Erin",
    });
    await linkUserAuthSubject(db, {
      userId: user.id,
      authSubject: "neon-sub-erin",
    });
    await expect(
      linkUserAuthSubject(db, {
        userId: user.id,
        authSubject: "neon-sub-other",
      })
    ).rejects.toBeInstanceOf(RbacRepoError);
  });

  it("idempotent when linking the same subject again", async () => {
    const user = await createUser(db, {
      email: "frank@example.com",
      name: "Frank",
    });
    await linkUserAuthSubject(db, {
      userId: user.id,
      authSubject: "neon-sub-frank",
    });
    const again = await linkUserAuthSubject(db, {
      userId: user.id,
      authSubject: "neon-sub-frank",
    });
    expect(again.authSubject).toBe("neon-sub-frank");
  });

  it("enforces unique auth_subject across users", async () => {
    const a = await createUser(db, { email: "a@example.com", name: "A" });
    const b = await createUser(db, { email: "b@example.com", name: "B" });
    await linkUserAuthSubject(db, {
      userId: a.id,
      authSubject: "shared-sub",
    });
    await expectRejected(
      linkUserAuthSubject(db, { userId: b.id, authSubject: "shared-sub" }),
      /users_auth_subject_unique|unique/i
    );
  });

  it("allows multiple users with null auth_subject", async () => {
    await createUser(db, { email: "u1@example.com", name: "U1" });
    await createUser(db, { email: "u2@example.com", name: "U2" });
    const rows = await db.select().from(users).where(isNull(users.authSubject));
    expect(rows).toHaveLength(2);
  });
});
