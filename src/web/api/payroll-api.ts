/**
 * Production API client — real VITE_API_BASE, no mock bypass.
 */

import { acquireAccessToken } from "@/web/auth/client";
import type { GetEmployeesParams, GetPayRunsParams } from "./client";
import { createApiClient } from "./client";
import type { GateKind } from "./types";

export type { GetEmployeesParams, GetPayRunsParams } from "./client";
export type {
  ActionAvailability,
  AggregateTile,
  EmployeeLineDto,
  EmployeeSummary,
  EmployeeVarianceDto,
  FindingRow,
  FindingSeverity,
  FindingStatus,
  FindingsListResponse,
  FindingsSummary,
  GateIssue,
  GateKind,
  GateResult,
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
  review: (runId: string, calcRevision: string) =>
    getPayrollApi().review(runId, calcRevision),
  approve: (runId: string, calcRevision: string) =>
    getPayrollApi().approve(runId, calcRevision),
  getFindings: (runId: string) => getPayrollApi().getFindings(runId),
  scanFindings: (runId: string) => getPayrollApi().scanFindings(runId),
  acknowledgeFinding: (runId: string, findingId: string, note?: string) =>
    getPayrollApi().acknowledgeFinding(runId, findingId, note),
  evaluateGate: (runId: string, gate: GateKind) =>
    getPayrollApi().evaluateGate(runId, gate),
  getEmployees: (params?: GetEmployeesParams) =>
    getPayrollApi().getEmployees(params),
};
