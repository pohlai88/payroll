/**
 * Users, roles and the permission matrix.
 *
 * System Admin is the only seeded role (`is_system = true`); its access is
 * implicit and total, never stored in `role_permissions`. Every other role is
 * created at runtime and granted cells of the resource × action matrix.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  // biome-ignore lint/suspicious/noDeprecatedImports: only the varargs overload is deprecated; every call here uses primaryKey({ columns: [...] }).
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  permissionAction,
  permissionResource,
  roleScope,
  userStatus,
} from "./enums";
import { companies } from "./parties";

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    name: text().notNull(),
    status: userStatus().notNull().default("ACTIVE"),
    /**
     * Neon Auth user id (`sub`). Null until the invitee's first successful
     * authenticated API call links the IdP identity to this row.
     */
    authSubject: text("auth_subject"),
    createdAt,
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    uniqueIndex("users_auth_subject_unique")
      .on(t.authSubject)
      .where(sql`${t.authSubject} IS NOT NULL`),
    check("users_email_not_blank", sql`length(btrim(${t.email})) > 0`),
    check("users_name_not_blank", sql`length(btrim(${t.name})) > 0`),
  ]
);

/**
 * A named bundle of permission grants.
 *
 * Exactly one row is system-owned: `SYSTEM_ADMIN`. That role never appears in
 * `role_permissions` — a BEFORE INSERT trigger rejects such rows — and the
 * authorization service treats holding it as full access.
 */
export const roles = pgTable(
  "roles",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    name: text().notNull(),
    description: text(),
    isSystem: boolean("is_system").notNull().default(false),
    scope: roleScope().notNull().default("COMPANY"),
    createdAt,
  },
  (t) => [
    check("roles_code_not_blank", sql`length(btrim(${t.code})) > 0`),
    check("roles_name_not_blank", sql`length(btrim(${t.name})) > 0`),
    // The system role is always global; company-scoped system roles are nonsense.
    check(
      "roles_system_is_global",
      sql`${t.isSystem} = false OR ${t.scope} = 'GLOBAL'`
    ),
  ]
);

/**
 * One granted cell of the permission matrix for a custom (non-system) role.
 * Absence of a row means the action is not granted.
 */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    resource: permissionResource().notNull(),
    action: permissionAction().notNull(),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.resource, t.action] }),
    index("role_permissions_role").on(t.roleId),
  ]
);

/**
 * Assigns a role to a user, optionally within one company.
 *
 * `company_id` is NULL for GLOBAL-scope roles and required for COMPANY-scope
 * roles (enforced in the service/repo layer — CHECK cannot join tables). Partial
 * unique indexes keep both the null and non-null cases free of duplicates.
 */
export const userRoleAssignments = pgTable(
  "user_role_assignments",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    createdAt,
  },
  (t) => [
    // One global assignment of a given role per user.
    uniqueIndex("user_role_assignments_global_unique")
      .on(t.userId, t.roleId)
      .where(sql`${t.companyId} IS NULL`),
    // One company assignment of a given role per user per company.
    uniqueIndex("user_role_assignments_company_unique")
      .on(t.userId, t.roleId, t.companyId)
      .where(sql`${t.companyId} IS NOT NULL`),
    index("user_role_assignments_user").on(t.userId),
    index("user_role_assignments_role").on(t.roleId),
    index("user_role_assignments_company").on(t.companyId),
  ]
);

export type UserRow = typeof users.$inferSelect;
export type RoleRow = typeof roles.$inferSelect;
export type RolePermissionRow = typeof rolePermissions.$inferSelect;
export type UserRoleAssignmentRow = typeof userRoleAssignments.$inferSelect;
