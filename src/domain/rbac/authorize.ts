/**
 * Pure authorization evaluation — no database, no I/O.
 *
 * The service layer loads a user's assignments and grants, then hands them
 * here. Keeping the decision function pure means the matrix rules can be
 * unit-tested without a Postgres fixture.
 */

import {
  emptyPermissionMatrix,
  fullPermissionMatrix,
  type PermissionAction,
  type PermissionMatrix,
  type PermissionResource,
  type RoleScope,
  SYSTEM_ADMIN_ROLE_CODE,
} from "./types";

/** One role assignment plus the permission cells granted to that role. */
export interface AuthRoleGrant {
  readonly roleCode: string;
  readonly isSystem: boolean;
  readonly scope: RoleScope;
  /** Null for GLOBAL roles; the company the COMPANY-scoped role is bound to. */
  readonly companyId: string | null;
  readonly permissions: ReadonlyArray<{
    readonly resource: PermissionResource;
    readonly action: PermissionAction;
  }>;
}

/**
 * Whether `companyId` makes this assignment applicable.
 *
 * GLOBAL assignments always apply. COMPANY assignments apply only when the
 * caller supplies a matching company id.
 */
function assignmentApplies(
  grant: AuthRoleGrant,
  companyId: string | null | undefined
): boolean {
  if (grant.scope === "GLOBAL") {
    return true;
  }
  if (companyId === undefined || companyId === null) {
    return false;
  }
  return grant.companyId === companyId;
}

/** True when any applicable assignment is the system admin role. */
export function isSystemAdmin(
  grants: readonly AuthRoleGrant[],
  companyId?: string | null
): boolean {
  return grants.some(
    (g) =>
      (g.isSystem || g.roleCode === SYSTEM_ADMIN_ROLE_CODE) &&
      assignmentApplies(g, companyId)
  );
}

/**
 * Decide whether the caller may perform `action` on `resource`.
 *
 * System Admin short-circuits to true. Otherwise the union of permission cells
 * across applicable role assignments is checked; absence is deny.
 */
export function hasPermission(
  grants: readonly AuthRoleGrant[],
  resource: PermissionResource,
  action: PermissionAction,
  companyId?: string | null
): boolean {
  if (isSystemAdmin(grants, companyId)) {
    return true;
  }

  for (const grant of grants) {
    if (!assignmentApplies(grant, companyId)) {
      continue;
    }
    for (const cell of grant.permissions) {
      if (cell.resource === resource && cell.action === action) {
        return true;
      }
    }
  }
  return false;
}

export class PermissionDeniedError extends Error {
  readonly userId: string;
  readonly resource: PermissionResource;
  readonly action: PermissionAction;
  readonly companyId: string | null | undefined;

  constructor(
    userId: string,
    resource: PermissionResource,
    action: PermissionAction,
    companyId?: string | null
  ) {
    super(
      `permission denied: user ${userId} cannot ${action} on ${resource}` +
        (companyId === undefined || companyId === null
          ? ""
          : ` (company ${companyId})`)
    );
    this.name = "PermissionDeniedError";
    this.userId = userId;
    this.resource = resource;
    this.action = action;
    this.companyId = companyId;
  }
}

export function requirePermission(
  grants: readonly AuthRoleGrant[],
  userId: string,
  resource: PermissionResource,
  action: PermissionAction,
  companyId?: string | null
): void {
  if (!hasPermission(grants, resource, action, companyId)) {
    throw new PermissionDeniedError(userId, resource, action, companyId);
  }
}

/**
 * Union of grants into a matrix suitable for UI rendering. System Admin yields
 * the full matrix; otherwise only cells from applicable roles are filled.
 */
export function listEffectivePermissions(
  grants: readonly AuthRoleGrant[],
  companyId?: string | null
): PermissionMatrix {
  if (isSystemAdmin(grants, companyId)) {
    return fullPermissionMatrix();
  }

  const matrix = emptyPermissionMatrix();
  const mutable: Record<PermissionResource, Set<PermissionAction>> = {
    COMPANY: new Set(matrix.COMPANY),
    EMPLOYMENT: new Set(matrix.EMPLOYMENT),
    PAY_RUN: new Set(matrix.PAY_RUN),
    PAY_ITEM: new Set(matrix.PAY_ITEM),
    RULE_PACK: new Set(matrix.RULE_PACK),
    REPORT: new Set(matrix.REPORT),
  };

  for (const grant of grants) {
    if (!assignmentApplies(grant, companyId)) {
      continue;
    }
    for (const cell of grant.permissions) {
      mutable[cell.resource].add(cell.action);
    }
  }

  return mutable;
}
