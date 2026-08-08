import { describe, expect, it } from "vitest";
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  type PermissionAction,
  type PermissionResource,
} from "@/domain/rbac/types";
import { isSystemAdminPresentation } from "@/web/auth/is-system-admin";

function fullMatrix(): Record<PermissionResource, PermissionAction[]> {
  const out = {} as Record<PermissionResource, PermissionAction[]>;
  for (const resource of PERMISSION_RESOURCES) {
    out[resource] = [...PERMISSION_ACTIONS];
  }
  return out;
}

describe("isSystemAdminPresentation", () => {
  it("is true only for the full resource × action matrix", () => {
    expect(isSystemAdminPresentation(fullMatrix())).toBe(true);
  });

  it("is false when any cell is missing", () => {
    const matrix = fullMatrix();
    matrix.PAY_RUN = ["READ"];
    expect(isSystemAdminPresentation(matrix)).toBe(false);
  });

  it("is false for null/undefined", () => {
    expect(isSystemAdminPresentation(null)).toBe(false);
    expect(isSystemAdminPresentation(undefined)).toBe(false);
  });
});
