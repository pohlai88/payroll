/**
 * Production API client — real VITE_API_BASE, no mock bypass.
 */

import { acquireAccessToken } from "@/web/auth/client";
import type {
  PayslipDocumentDto,
  PayslipIndexRow,
} from "@/web/payrun/payslip-document/types";
import type { GetEmployeesParams, GetPayRunsParams } from "./client";
import { createApiClient } from "./client";
import type { GateKind, ReleaseMethod, RunLineDiffDto } from "./types";

export type { GetEmployeesParams, GetPayRunsParams } from "./client";
export type {
  ActionAvailability,
  AggregateTile,
  ArtifactRow,
  ArtifactsListResponse,
  ArtifactType,
  ChecklistItem,
  CloseRunResponse,
  ClosureChecklistResponse,
  DistributionChannel,
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
  GetBatchResponse,
  LinePaymentRow,
  LinePaymentState,
  MeCompany,
  MeResponse,
  NodeDiffRow,
  PaymentAttempt,
  PaymentAttemptStatus,
  PaymentsListResponse,
  PayRunSummary,
  PayRunWorkspaceView,
  ReleaseBatch,
  ReleaseBatchStatus,
  ReleaseByBank,
  ReleaseCommitResponse,
  ReleaseEligibleLine,
  ReleaseExcludedLine,
  ReleaseMethod,
  ReleasePreviewResponse,
  RootValue,
  RunLineDiffDto,
  RunSummary,
  SignedArtifactUrlResponse,
  SparkPoint,
  StoreArtifactResponse,
  VarianceDto,
  WithdrawalReason,
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
  getPayments: (runId: string) => getPayrollApi().getPayments(runId),
  holdLine: (runId: string, lineId: string, reason: string) =>
    getPayrollApi().holdLine(runId, lineId, reason),
  unholdLine: (runId: string, lineId: string) =>
    getPayrollApi().unholdLine(runId, lineId),
  withdrawLine: (
    runId: string,
    lineId: string,
    body: Parameters<PayrollApi["withdrawLine"]>[2]
  ) => getPayrollApi().withdrawLine(runId, lineId, body),
  previewRelease: (runId: string, lineIds: readonly string[]) =>
    getPayrollApi().previewRelease(runId, lineIds),
  commitRelease: (
    runId: string,
    lineIds: readonly string[],
    method: ReleaseMethod
  ) => getPayrollApi().commitRelease(runId, lineIds, method),
  getBatch: (runId: string, batchId: string) =>
    getPayrollApi().getBatch(runId, batchId),
  settleAttempt: (
    runId: string,
    attemptId: string,
    body: Parameters<PayrollApi["settleAttempt"]>[2]
  ) => getPayrollApi().settleAttempt(runId, attemptId, body),
  reconcileAttempt: (
    runId: string,
    attemptId: string,
    evidenceArtifactId?: string
  ) => getPayrollApi().reconcileAttempt(runId, attemptId, evidenceArtifactId),
  cancelRelease: (runId: string, batchId: string, reason: string) =>
    getPayrollApi().cancelRelease(runId, batchId, reason),
  recordDistribution: (
    runId: string,
    lineId: string,
    body: Parameters<PayrollApi["recordDistribution"]>[2]
  ) => getPayrollApi().recordDistribution(runId, lineId, body),
  getArtifacts: (runId: string) => getPayrollApi().getArtifacts(runId),
  uploadArtifact: (
    runId: string,
    body: Parameters<PayrollApi["uploadArtifact"]>[1]
  ) => getPayrollApi().uploadArtifact(runId, body),
  getArtifactUrl: (runId: string, artifactId: string) =>
    getPayrollApi().getArtifactUrl(runId, artifactId),
  getClosureChecklist: (runId: string) =>
    getPayrollApi().getClosureChecklist(runId),
  closeRun: (runId: string) => getPayrollApi().closeRun(runId),
};

export function fetchPayslip(
  runId: string,
  lineId: string
): Promise<PayslipDocumentDto> {
  return getPayrollApi().getPayslip(runId, lineId);
}

export function fetchPayslipIndex(
  runId: string
): Promise<{ payslips: PayslipIndexRow[] }> {
  return getPayrollApi().getPayslipIndex(runId);
}

export function fetchLineDiff(
  runId: string,
  lineId: string
): Promise<RunLineDiffDto> {
  return getPayrollApi().getLineDiff(runId, lineId);
}
