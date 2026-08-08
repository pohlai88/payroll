/**
 * Production API client — real VITE_API_BASE, no mock bypass.
 */

import { acquireAccessToken } from "@/web/auth/client";
import type { GetEmployeesParams, GetPayRunsParams } from "./client";
import { createApiClient } from "./client";

export type { GetEmployeesParams, GetPayRunsParams } from "./client";
export type {
  ActionAvailability,
  AggregateTile,
  EmployeeLineDto,
  EmployeeSummary,
  EmployeeVarianceDto,
  FindingsSummary,
  MeCompany,
  MeResponse,
  PayRunSummary,
  PayRunWorkspaceView,
  RootValue,
  RunSummary,
  SparkPoint,
  VarianceDto,
} from "./types";

function requireApiBase(): string {
  const base = import.meta.env.VITE_API_BASE;
  if (typeof base !== "string" || base.trim() === "") {
    throw new Error("VITE_API_BASE is not set");
  }
  return base.trim();
}

type PayrollApi = ReturnType<typeof createApiClient>;

let payrollApiSingleton: PayrollApi | null = null;

export function getPayrollApi(): PayrollApi {
  if (payrollApiSingleton === null) {
    payrollApiSingleton = createApiClient({
      apiBase: requireApiBase(),
      acquireToken: acquireAccessToken,
    });
  }
  return payrollApiSingleton;
}

/** Convenience alias for shell code — same lazy singleton. */
export const payrollApi = {
  getMe: () => getPayrollApi().getMe(),
  getPermissions: (companyId?: string | null) =>
    getPayrollApi().getPermissions(companyId),
  getAdminUsers: () => getPayrollApi().getAdminUsers(),
  downloadEmployeeImportTemplate: (companyId?: string | null) =>
    getPayrollApi().downloadEmployeeImportTemplate(companyId),
  importEmployees: (body: string, contentType: string) =>
    getPayrollApi().importEmployees(body, contentType),
  getPayRuns: (params?: GetPayRunsParams) => getPayrollApi().getPayRuns(params),
  getWorkspace: (runId: string) => getPayrollApi().getWorkspace(runId),
  recompute: (runId: string) => getPayrollApi().recompute(runId),
  review: (runId: string) => getPayrollApi().review(runId),
  approve: (runId: string) => getPayrollApi().approve(runId),
  getEmployees: (params?: GetEmployeesParams) =>
    getPayrollApi().getEmployees(params),
};
