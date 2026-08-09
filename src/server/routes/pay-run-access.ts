/**
 * Shared pay-run company lookup + PAY_RUN permission check for route handlers.
 */

import type { Database } from "@/db/client";
import type { PermissionAction } from "@/domain/rbac/types";
import { getPayRunCompanyId } from "@/repo/pay-run";
import { ControlError } from "@/service/control-errors";
import { requirePermission } from "@/service/rbac";

export async function requirePayRunAccess(
  db: Database,
  userId: string,
  action: PermissionAction,
  runId: string
): Promise<{ readonly companyId: string }> {
  const companyId = await getPayRunCompanyId(db, runId);
  if (companyId === null) {
    throw new ControlError("NOT_FOUND", `no such run: ${runId}`);
  }
  await requirePermission(db, userId, "PAY_RUN", action, companyId);
  return { companyId };
}
