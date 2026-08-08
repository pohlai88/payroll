/**
 * Shared pay-run company lookup + PAY_RUN permission check for route handlers.
 */

import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { payRuns } from "@/db/schema/run";
import type { PermissionAction } from "@/domain/rbac/types";
import { ControlError } from "@/service/control-errors";
import { requirePermission } from "@/service/rbac";

export async function requirePayRunAccess(
  db: Database,
  userId: string,
  action: PermissionAction,
  runId: string
): Promise<{ readonly companyId: string }> {
  const [run] = await db
    .select({ companyId: payRuns.companyId })
    .from(payRuns)
    .where(eq(payRuns.id, runId))
    .limit(1);
  if (run === undefined) {
    throw new ControlError("NOT_FOUND", `no such run: ${runId}`);
  }
  await requirePermission(db, userId, "PAY_RUN", action, run.companyId);
  return { companyId: run.companyId };
}
