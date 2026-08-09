/**
 * @feature rbac
 * @layer test
 *
 * Pure authorization evaluation against fixtures — no database.
 */

import { describe, expect, it } from "vitest";
import {
  type AuthRoleGrant,
  hasPermission,
  listEffectivePermissions,
  PermissionDeniedError,
  requirePermission,
} from "@/domain/rbac/authorize";
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  SYSTEM_ADMIN_ROLE_CODE,
} from "@/domain/rbac/types";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

function systemAdminGrant(): AuthRoleGrant {
  return {
    roleCode: SYSTEM_ADMIN_ROLE_CODE,
    isSystem: true,
    scope: "GLOBAL",
    companyId: null,
    permissions: [],
  };
}

function payrollClerkGrant(
  companyId: string,
  permissions: AuthRoleGrant["permissions"]
): AuthRoleGrant {
  return {
    roleCode: "PAYROLL_CLERK",
    isSystem: false,
    scope: "COMPANY",
    companyId,
    permissions,
  };
}

function globalAuditorGrant(
  permissions: AuthRoleGrant["permissions"]
): AuthRoleGrant {
  return {
    roleCode: "AUDITOR",
    isSystem: false,
    scope: "GLOBAL",
    companyId: null,
    permissions,
  };
}

describe("hasPermission", () => {
  it("denies by default when the user has no grants", () => {
    expect(hasPermission([], "PAY_RUN", "READ")).toBe(false);
  });

  it("grants System Admin every resource and action regardless of company", () => {
    const grants = [systemAdminGrant()];
    for (const resource of PERMISSION_RESOURCES) {
      for (const action of PERMISSION_ACTIONS) {
        expect(hasPermission(grants, resource, action)).toBe(true);
        expect(hasPermission(grants, resource, action, COMPANY_A)).toBe(true);
      }
    }
  });

  it("applies global-role permissions regardless of companyId", () => {
    const grants = [
      globalAuditorGrant([
        { resource: "PAY_RUN", action: "READ" },
        { resource: "REPORT", action: "READ" },
      ]),
    ];
    expect(hasPermission(grants, "PAY_RUN", "READ", COMPANY_A)).toBe(true);
    expect(hasPermission(grants, "PAY_RUN", "READ", COMPANY_B)).toBe(true);
    expect(hasPermission(grants, "PAY_RUN", "READ")).toBe(true);
    expect(hasPermission(grants, "PAY_RUN", "UPDATE", COMPANY_A)).toBe(false);
  });

  it("applies company-scoped roles only to the matching company", () => {
    const grants = [
      payrollClerkGrant(COMPANY_A, [
        { resource: "PAY_RUN", action: "CREATE" },
        { resource: "PAY_RUN", action: "READ" },
        { resource: "EMPLOYMENT", action: "READ" },
      ]),
    ];
    expect(hasPermission(grants, "PAY_RUN", "CREATE", COMPANY_A)).toBe(true);
    expect(hasPermission(grants, "PAY_RUN", "CREATE", COMPANY_B)).toBe(false);
    expect(hasPermission(grants, "PAY_RUN", "CREATE")).toBe(false);
    expect(hasPermission(grants, "EMPLOYMENT", "UPDATE", COMPANY_A)).toBe(
      false
    );
  });

  it("unions permissions across multiple assigned roles", () => {
    const grants = [
      payrollClerkGrant(COMPANY_A, [{ resource: "PAY_RUN", action: "READ" }]),
      globalAuditorGrant([{ resource: "REPORT", action: "READ" }]),
    ];
    expect(hasPermission(grants, "PAY_RUN", "READ", COMPANY_A)).toBe(true);
    expect(hasPermission(grants, "REPORT", "READ", COMPANY_A)).toBe(true);
    expect(hasPermission(grants, "PAY_RUN", "READ", COMPANY_B)).toBe(false);
    expect(hasPermission(grants, "REPORT", "READ", COMPANY_B)).toBe(true);
  });
});

describe("requirePermission", () => {
  it("throws PermissionDeniedError when the action is not granted", () => {
    expect(() => requirePermission([], "user-1", "COMPANY", "DELETE")).toThrow(
      PermissionDeniedError
    );
  });

  it("does not throw when the action is granted", () => {
    expect(() =>
      requirePermission([systemAdminGrant()], "user-1", "COMPANY", "DELETE")
    ).not.toThrow();
  });
});

describe("listEffectivePermissions", () => {
  it("returns the full matrix for System Admin", () => {
    const matrix = listEffectivePermissions([systemAdminGrant()]);
    for (const resource of PERMISSION_RESOURCES) {
      expect([...matrix[resource]].sort()).toEqual(
        [...PERMISSION_ACTIONS].sort()
      );
    }
  });

  it("returns only granted cells for custom roles in a company context", () => {
    const matrix = listEffectivePermissions(
      [
        payrollClerkGrant(COMPANY_A, [
          { resource: "PAY_RUN", action: "READ" },
          { resource: "PAY_RUN", action: "UPDATE" },
        ]),
      ],
      COMPANY_A
    );
    expect([...matrix.PAY_RUN].sort()).toEqual(["READ", "UPDATE"]);
    expect([...matrix.COMPANY]).toEqual([]);
  });

  it("returns an empty matrix when company-scoped grants do not match", () => {
    const matrix = listEffectivePermissions(
      [payrollClerkGrant(COMPANY_A, [{ resource: "PAY_RUN", action: "READ" }])],
      COMPANY_B
    );
    for (const resource of PERMISSION_RESOURCES) {
      expect([...matrix[resource]]).toEqual([]);
    }
  });
});
