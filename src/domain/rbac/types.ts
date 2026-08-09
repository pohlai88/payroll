/**
 * @feature rbac
 * @layer domain
 *
 * RBAC domain types — mirrored 1:1 with the Postgres enums in
 * `src/db/schema/enums.ts`. Members are written out literally rather than
 * derived, so a code change without a migration fails loudly in
 * `tests/db/enums.test.ts`.
 */

/** Closed list of modules that appear as rows in the permission matrix. */
export type PermissionResource =
  | "COMPANY"
  | "EMPLOYMENT"
  | "PAY_RUN"
  | "PAY_ITEM"
  | "RULE_PACK"
  | "REPORT";

/** Closed list of CRUD verbs that appear as columns in the permission matrix. */
export type PermissionAction = "CREATE" | "READ" | "UPDATE" | "DELETE";

/** How far a role's grants reach. */
export type RoleScope = "GLOBAL" | "COMPANY";

/** Login account life-cycle. */
export type UserStatus = "ACTIVE" | "DISABLED";

/** Stable code of the single seeded system role. */
export const SYSTEM_ADMIN_ROLE_CODE = "SYSTEM_ADMIN" as const;

export const PERMISSION_RESOURCES = [
  "COMPANY",
  "EMPLOYMENT",
  "PAY_RUN",
  "PAY_ITEM",
  "RULE_PACK",
  "REPORT",
] as const satisfies readonly PermissionResource[];

export const PERMISSION_ACTIONS = [
  "CREATE",
  "READ",
  "UPDATE",
  "DELETE",
] as const satisfies readonly PermissionAction[];

/**
 * Effective grants for one user in one company context — suitable for rendering
 * or editing a permission-matrix UI. Every resource key is present; an empty
 * set means no actions are granted for that resource.
 */
export type PermissionMatrix = Readonly<
  Record<PermissionResource, ReadonlySet<PermissionAction>>
>;

/** Build an empty matrix (every resource maps to an empty set). */
export function emptyPermissionMatrix(): PermissionMatrix {
  return {
    COMPANY: new Set(),
    EMPLOYMENT: new Set(),
    PAY_RUN: new Set(),
    PAY_ITEM: new Set(),
    RULE_PACK: new Set(),
    REPORT: new Set(),
  };
}

/** Full matrix — every resource × every action. Used for System Admin. */
export function fullPermissionMatrix(): PermissionMatrix {
  return {
    COMPANY: new Set(PERMISSION_ACTIONS),
    EMPLOYMENT: new Set(PERMISSION_ACTIONS),
    PAY_RUN: new Set(PERMISSION_ACTIONS),
    PAY_ITEM: new Set(PERMISSION_ACTIONS),
    RULE_PACK: new Set(PERMISSION_ACTIONS),
    REPORT: new Set(PERMISSION_ACTIONS),
  };
}
