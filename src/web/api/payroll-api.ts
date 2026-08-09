/**
 * Production API client — real VITE_API_BASE, no mock bypass.
 * Single surface: `payrollApi` / `getPayrollApi()`. No parallel `fetch*` wrappers.
 */

import { acquireAccessToken } from "@/web/auth/client";
import type { GetEmployeesParams, GetPayRunsParams } from "./client";
import { createApiClient } from "./client";
import type { GateKind, ReleaseMethod } from "./types";

export type { GetEmployeesParams, GetPayRunsParams } from "./client";
export type {
  ActionAvailability,
  AggregateTile,
  AnnualRemunerationSummaryDto,
  ArtifactRow,
  ArtifactsListResponse,
  ArtifactType,
  ChecklistItem,
  CloseRunResponse,
  ClosureChainResponse,
  ClosureChecklistResponse,
  CreatePayRunBody,
  DistributionChannel,
  EmployeeLineDto,
  EmployeeSummary,
  EmployeeVarianceDto,
  ExceptionFindingRow,
  ExceptionReportDto,
  FindingRow,
  FindingSeverity,
  FindingStatus,
  FindingsListResponse,
  FindingsSummary,
  GateIssue,
  GateKind,
  GateResult,
  GetBatchResponse,
  IssuedSeal,
  LinePaymentRow,
  LinePaymentState,
  MeCompany,
  MeResponse,
  NodeDiffRow,
  OkResponse,
  PaymentAttempt,
  PaymentAttemptStatus,
  PaymentRegisterDto,
  PaymentRegisterRow,
  PaymentsListResponse,
  PayRunMutationEnvelope,
  PayRunMutationKind,
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
  ReportMeta,
  RootValue,
  RunLineDiffDto,
  RunSeal,
  RunSealResponse,
  RunSummary,
  SealStatus,
  SignedArtifactUrlResponse,
  SparkPoint,
  StatutorySummaryDto,
  StoreArtifactResponse,
  TimestampOutcome,
  TimestampStatus,
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
  createAdminUser: (body: Parameters<PayrollApi["createAdminUser"]>[0]) =>
    getPayrollApi().createAdminUser(body),
  updateAdminUser: (
    userId: string,
    body: Parameters<PayrollApi["updateAdminUser"]>[1]
  ) => getPayrollApi().updateAdminUser(userId, body),
  assignUserRole: (
    userId: string,
    body: Parameters<PayrollApi["assignUserRole"]>[1]
  ) => getPayrollApi().assignUserRole(userId, body),
  revokeUserRole: (
    userId: string,
    body: Parameters<PayrollApi["revokeUserRole"]>[1]
  ) => getPayrollApi().revokeUserRole(userId, body),
  getAdminCompanies: () => getPayrollApi().getAdminCompanies(),
  createAdminCompany: (
    body: Parameters<PayrollApi["createAdminCompany"]>[0]
  ) => getPayrollApi().createAdminCompany(body),
  updateAdminCompany: (
    companyId: string,
    body: Parameters<PayrollApi["updateAdminCompany"]>[1]
  ) => getPayrollApi().updateAdminCompany(companyId, body),
  downloadEmployeeImportTemplate: (companyId?: string | null) =>
    getPayrollApi().downloadEmployeeImportTemplate(companyId),
  importEmployees: (body: string, contentType: string) =>
    getPayrollApi().importEmployees(body, contentType),
  getPayRuns: (params?: GetPayRunsParams) => getPayrollApi().getPayRuns(params),
  createPayRun: (body: Parameters<PayrollApi["createPayRun"]>[0]) =>
    getPayrollApi().createPayRun(body),
  getWorkspace: (runId: string) => getPayrollApi().getWorkspace(runId),
  recompute: (runId: string) => getPayrollApi().recompute(runId),
  review: (runId: string, calcRevision: string) =>
    getPayrollApi().review(runId, calcRevision),
  approve: (runId: string, calcRevision: string) =>
    getPayrollApi().approve(runId, calcRevision),
  demotePayRun: (runId: string) => getPayrollApi().demotePayRun(runId),
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
  getRunSeal: (runId: string) => getPayrollApi().getRunSeal(runId),
  getClosureChain: (runId: string) => getPayrollApi().getClosureChain(runId),
  getPayslip: (runId: string, lineId: string) =>
    getPayrollApi().getPayslip(runId, lineId),
  getPayslipIndex: (runId: string) => getPayrollApi().getPayslipIndex(runId),
  getLineDiff: (runId: string, lineId: string) =>
    getPayrollApi().getLineDiff(runId, lineId),
  getPaymentRegister: (runId: string) =>
    getPayrollApi().getPaymentRegister(runId),
  getStatutorySummary: (runId: string) =>
    getPayrollApi().getStatutorySummary(runId),
  getExceptionReport: (runId: string) =>
    getPayrollApi().getExceptionReport(runId),
  getAnnualRemunerationSummary: (employeeId: string, year: number) =>
    getPayrollApi().getAnnualRemunerationSummary(employeeId, year),
};
