/**
 * @feature auth
 * @layer ui
 *
 * UI presentation predicate for System Admin — not an authorization mechanism.
 *
 * Derived from server-returned effective permissions using the canonical
 * resource/action lists. Hiding UI never grants or denies API access.
 */

import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  type PermissionAction,
  type PermissionResource,
} from "@/domain/rbac/types";

export type SerializedPermissionMatrix = Readonly<
  Record<PermissionResource, readonly PermissionAction[]>
>;

export function isSystemAdminPresentation(
  permissions: SerializedPermissionMatrix | null | undefined
): boolean {
  if (permissions === null || permissions === undefined) {
    return false;
  }
  for (const resource of PERMISSION_RESOURCES) {
    const actions = permissions[resource];
    if (actions === undefined) {
      return false;
    }
    const set = new Set(actions);
    for (const action of PERMISSION_ACTIONS) {
      if (!set.has(action)) {
        return false;
      }
    }
  }
  return true;
}
