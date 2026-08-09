/**
 * @feature rbac
 * @layer test
 *
 * Database-level RBAC invariants: seeded System Admin, unique assignments,
 * the system-role permission trigger, and cascade deletes.
 */

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { companies } from "@/db/schema/parties";
import {
  rolePermissions,
  roles,
  userRoleAssignments,
  users,
} from "@/db/schema/rbac";
import { SYSTEM_ADMIN_ROLE_CODE } from "@/domain/rbac/types";
import {
  assignUserToRole,
  createRole,
  createUser,
  deleteRole,
  grantPermission,
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
  // Keep the seeded SYSTEM_ADMIN role; wipe operational RBAC rows between cases.
  await db.delete(userRoleAssignments);
  await db.delete(rolePermissions);
  await db.delete(users);
  await db.delete(roles).where(eq(roles.isSystem, false));
  // TRUNCATE ... CASCADE, not a bare DELETE: the seed ships demo employments
  // that reference these companies, so deleting the parent directly trips
  // `employments_company_id_companies_id_fk`. This file owns its own company
  // fixtures (below), so clearing dependents with them is the intent.
  await database.truncate("companies");
});

afterAll(async () => {
  await database.close();
});

async function insertCompany(code: string): Promise<string> {
  const [row] = await db
    .insert(companies)
    .values({ code, name: `Company ${code}` })
    .returning();
  if (row === undefined) {
    throw new Error("failed to insert company");
  }
  return row.id;
}

describe("SYSTEM_ADMIN seed", () => {
  it("seeds exactly one system role with is_system and GLOBAL scope", async () => {
    const rows = await db
      .select()
      .from(roles)
      .where(eq(roles.code, SYSTEM_ADMIN_ROLE_CODE));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isSystem).toBe(true);
    expect(rows[0]?.scope).toBe("GLOBAL");
  });

  it("stores no role_permissions rows for the system role", async () => {
    const [admin] = await db
      .select()
      .from(roles)
      .where(eq(roles.code, SYSTEM_ADMIN_ROLE_CODE));
    expect(admin).toBeDefined();
    const cells = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, admin!.id));
    expect(cells).toHaveLength(0);
  });
});

describe("system-role permission trigger", () => {
  it("rejects inserting a permission matrix row for SYSTEM_ADMIN", async () => {
    const [admin] = await db
      .select()
      .from(roles)
      .where(eq(roles.code, SYSTEM_ADMIN_ROLE_CODE));
    expect(admin).toBeDefined();

    await expectRejected(
      db.insert(rolePermissions).values({
        roleId: admin!.id,
        resource: "PAY_RUN",
        action: "READ",
      }),
      /system role/i
    );
  });

  it("allows matrix rows for custom roles", async () => {
    const role = await createRole(db, {
      code: "PAYROLL_CLERK",
      name: "Payroll Clerk",
      scope: "COMPANY",
    });
    const cell = await grantPermission(db, role.id, "PAY_RUN", "READ");
    expect(cell.resource).toBe("PAY_RUN");
    expect(cell.action).toBe("READ");
  });
});

describe("unique assignments", () => {
  it("rejects duplicate global assignments of the same role to one user", async () => {
    const user = await createUser(db, {
      email: "admin@example.com",
      name: "Admin",
    });
    const [admin] = await db
      .select()
      .from(roles)
      .where(eq(roles.code, SYSTEM_ADMIN_ROLE_CODE));
    expect(admin).toBeDefined();

    await assignUserToRole(db, {
      userId: user.id,
      roleId: admin!.id,
      companyId: null,
    });

    await expectRejected(
      db.insert(userRoleAssignments).values({
        userId: user.id,
        roleId: admin!.id,
        companyId: null,
      }),
      /unique|duplicate/i
    );
  });

  it("rejects duplicate company assignments of the same role", async () => {
    const user = await createUser(db, {
      email: "clerk@example.com",
      name: "Clerk",
    });
    const companyId = await insertCompany("ACME");
    const role = await createRole(db, {
      code: "PAYROLL_CLERK",
      name: "Payroll Clerk",
      scope: "COMPANY",
    });

    await assignUserToRole(db, {
      userId: user.id,
      roleId: role.id,
      companyId,
    });

    await expectRejected(
      db.insert(userRoleAssignments).values({
        userId: user.id,
        roleId: role.id,
        companyId,
      }),
      /unique|duplicate/i
    );
  });

  it("requires companyId for COMPANY-scope roles and forbids it for GLOBAL", async () => {
    const user = await createUser(db, {
      email: "scope@example.com",
      name: "Scope",
    });
    const companyId = await insertCompany("BETA");
    const companyRole = await createRole(db, {
      code: "CLERK",
      name: "Clerk",
      scope: "COMPANY",
    });
    const [admin] = await db
      .select()
      .from(roles)
      .where(eq(roles.code, SYSTEM_ADMIN_ROLE_CODE));

    await expect(
      assignUserToRole(db, {
        userId: user.id,
        roleId: companyRole.id,
        companyId: null,
      })
    ).rejects.toBeInstanceOf(RbacRepoError);

    await expect(
      assignUserToRole(db, {
        userId: user.id,
        roleId: admin!.id,
        companyId,
      })
    ).rejects.toBeInstanceOf(RbacRepoError);
  });
});

describe("cascade deletes", () => {
  it("deletes assignments and permissions when a custom role is deleted", async () => {
    const user = await createUser(db, {
      email: "cascade@example.com",
      name: "Cascade",
    });
    const companyId = await insertCompany("GAMMA");
    const role = await createRole(db, {
      code: "TEMP",
      name: "Temporary",
      scope: "COMPANY",
    });
    await grantPermission(db, role.id, "REPORT", "READ");
    await assignUserToRole(db, {
      userId: user.id,
      roleId: role.id,
      companyId,
    });

    await deleteRole(db, role.id);

    const remainingPerms = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, role.id));
    const remainingAssigns = await db
      .select()
      .from(userRoleAssignments)
      .where(eq(userRoleAssignments.roleId, role.id));
    expect(remainingPerms).toHaveLength(0);
    expect(remainingAssigns).toHaveLength(0);
  });

  it("deletes assignments when a user is deleted", async () => {
    const user = await createUser(db, {
      email: "gone@example.com",
      name: "Gone",
    });
    const [admin] = await db
      .select()
      .from(roles)
      .where(eq(roles.code, SYSTEM_ADMIN_ROLE_CODE));
    await assignUserToRole(db, {
      userId: user.id,
      roleId: admin!.id,
      companyId: null,
    });

    await db.delete(users).where(eq(users.id, user.id));

    const remaining = await db
      .select()
      .from(userRoleAssignments)
      .where(eq(userRoleAssignments.userId, user.id));
    expect(remaining).toHaveLength(0);
  });

  it("refuses to delete the system role", async () => {
    const [admin] = await db
      .select()
      .from(roles)
      .where(eq(roles.code, SYSTEM_ADMIN_ROLE_CODE));
    await expect(deleteRole(db, admin!.id)).rejects.toBeInstanceOf(
      RbacRepoError
    );
  });
});

describe("roles_system_is_global check", () => {
  it("rejects a system role with COMPANY scope", async () => {
    await expectRejected(
      db.execute(sql`
        INSERT INTO roles (code, name, is_system, scope)
        VALUES ('BAD_SYSTEM', 'Bad', true, 'COMPANY')`),
      /roles_system_is_global|check/i
    );
  });
});
