/**
 * @feature shell
 * @layer client
 *
 * Production API client — real VITE_API_BASE, no mock bypass.
 * Single surface: `payrollApi` / `getPayrollApi()`. No parallel `fetch*` wrappers.
 */

import { acquireAccessToken } from "@/web/auth/client";
import type { GetEmployeesParams, GetPayRunsParams } from "./client";
import { createApiClient } from "./client";
import type { GateKind, ReleaseMethod } from "./types";

export type { GetEmployeesParams, GetPayRunsParams } from "./client";
export type {
  AcknowledgeTransferFindingResponse,
  ActionAvailability,
  AggregateTile,
  AnnualRemunerationSummaryDto,
  ArtifactDownload,
  ArtifactRow,
  ArtifactsListResponse,
  ArtifactType,
  ChecklistItem,
  CloseRunResponse,
  ClosureChainResponse,
  ClosureChecklistResponse,
  CommitTransferBody,
  CommitTransferResponse,
  CreatePayRunBody,
  DepartureResponse,
  DerivedNodeDto,
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
  LineDerivationDto,
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
  PcbClassDepartureBody,
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
  SparkPoint,
  StatutorySummaryDto,
  StoreArtifactResponse,
  TimestampOutcome,
  TimestampStatus,
  UploadArtifactType,
  VarianceDto,
  WageTreatmentDepartureBody,
  WithdrawalReason,
} from "./types";

function requireApiBase(): string {
  const base = import.meta.env.VITE_API_BASE;
  if (typeof base !== "string" || base.trim() === "") {
    throw new Error("VITE_API_BASE is not set");
  }
  return base.trim();
}

const devAuthBypass = import.meta.env.VITE_DEV_AUTH_BYPASS === "true";

function devToken(): Promise<string> {
  return Promise.resolve("dev-bypass");
}

type PayrollApi = ReturnType<typeof createApiClient>;

let payrollApiSingleton: PayrollApi | null = null;

export function getPayrollApi(): PayrollApi {
  if (payrollApiSingleton === null) {
    payrollApiSingleton = createApiClient({
      apiBase: requireApiBase(),
      acquireToken: devAuthBypass ? devToken : acquireAccessToken,
    });
  }
  return payrollApiSingleton;
}

/** Convenience alias for shell code — same lazy singleton. */
export const payrollApi = {
  // --- @feature me @layer client ---
  getMe: () => getPayrollApi().getMe(),
  getPermissions: (companyId?: string | null) =>
    getPayrollApi().getPermissions(companyId),
  // --- @feature admin-users @layer client ---
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
  // --- @feature rbac @layer client ---
  getAdminRoles: () => getPayrollApi().getAdminRoles(),
  createAdminRole: (body: Parameters<PayrollApi["createAdminRole"]>[0]) =>
    getPayrollApi().createAdminRole(body),
  deleteAdminRole: (roleId: string) => getPayrollApi().deleteAdminRole(roleId),
  grantAdminRolePermission: (
    roleId: string,
    body: Parameters<PayrollApi["grantAdminRolePermission"]>[1]
  ) => getPayrollApi().grantAdminRolePermission(roleId, body),
  revokeAdminRolePermission: (
    roleId: string,
    body: Parameters<PayrollApi["revokeAdminRolePermission"]>[1]
  ) => getPayrollApi().revokeAdminRolePermission(roleId, body),
  // --- @feature companies @layer client ---
  getAdminCompanies: () => getPayrollApi().getAdminCompanies(),
  createAdminCompany: (body: Parameters<PayrollApi["createAdminCompany"]>[0]) =>
    getPayrollApi().createAdminCompany(body),
  updateAdminCompany: (
    companyId: string,
    body: Parameters<PayrollApi["updateAdminCompany"]>[1]
  ) => getPayrollApi().updateAdminCompany(companyId, body),
  deleteAdminCompany: (companyId: string) =>
    getPayrollApi().deleteAdminCompany(companyId),
  // --- @feature employee-import @layer client ---
  downloadEmployeeImportTemplate: (companyId?: string | null) =>
    getPayrollApi().downloadEmployeeImportTemplate(companyId),
  importEmployees: (body: string, contentType: string) =>
    getPayrollApi().importEmployees(body, contentType),
  // --- @feature pay-run @layer client ---
  getPayRuns: (params?: GetPayRunsParams) => getPayrollApi().getPayRuns(params),
  createPayRun: (body: Parameters<PayrollApi["createPayRun"]>[0]) =>
    getPayrollApi().createPayRun(body),
  // --- @feature workspace @layer client ---
  getWorkspace: (runId: string) => getPayrollApi().getWorkspace(runId),
  recompute: (runId: string) => getPayrollApi().recompute(runId),
  review: (runId: string, calcRevision: string) =>
    getPayrollApi().review(runId, calcRevision),
  approve: (runId: string, calcRevision: string) =>
    getPayrollApi().approve(runId, calcRevision),
  demotePayRun: (runId: string) => getPayrollApi().demotePayRun(runId),
  // --- @feature findings @layer client ---
  getFindings: (runId: string) => getPayrollApi().getFindings(runId),
  scanFindings: (runId: string) => getPayrollApi().scanFindings(runId),
  acknowledgeFinding: (runId: string, findingId: string, note?: string) =>
    getPayrollApi().acknowledgeFinding(runId, findingId, note),
  // --- @feature gates @layer client ---
  evaluateGate: (runId: string, gate: GateKind) =>
    getPayrollApi().evaluateGate(runId, gate),
  // --- @feature employees @layer client ---
  getEmployees: (params?: GetEmployeesParams) =>
    getPayrollApi().getEmployees(params),
  // --- @feature control @layer client ---
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
  // --- @feature artifacts @layer client ---
  getArtifacts: (runId: string) => getPayrollApi().getArtifacts(runId),
  uploadArtifact: (
    runId: string,
    body: Parameters<PayrollApi["uploadArtifact"]>[1]
  ) => getPayrollApi().uploadArtifact(runId, body),
  downloadArtifact: (runId: string, artifactId: string) =>
    getPayrollApi().downloadArtifact(runId, artifactId),
  getClosureChecklist: (runId: string) =>
    getPayrollApi().getClosureChecklist(runId),
  closeRun: (runId: string) => getPayrollApi().closeRun(runId),
  getRunSeal: (runId: string) => getPayrollApi().getRunSeal(runId),
  getClosureChain: (runId: string) => getPayrollApi().getClosureChain(runId),
  // --- @feature payslip @layer client ---
  getPayslip: (runId: string, lineId: string) =>
    getPayrollApi().getPayslip(runId, lineId),
  getPayslipIndex: (runId: string) => getPayrollApi().getPayslipIndex(runId),
  // --- @feature diff @layer client ---
  getLineDiff: (runId: string, lineId: string) =>
    getPayrollApi().getLineDiff(runId, lineId),
  // --- @feature derivation @layer client ---
  getLineDerivation: (runId: string, lineId: string, root?: string) =>
    getPayrollApi().getLineDerivation(runId, lineId, root),
  // --- @feature reports @layer client ---
  getPaymentRegister: (runId: string) =>
    getPayrollApi().getPaymentRegister(runId),
  getStatutorySummary: (runId: string) =>
    getPayrollApi().getStatutorySummary(runId),
  getExceptionReport: (runId: string) =>
    getPayrollApi().getExceptionReport(runId),
  // --- @feature remuneration @layer client ---
  getAnnualRemunerationSummary: (employeeId: string, year: number) =>
    getPayrollApi().getAnnualRemunerationSummary(employeeId, year),
  // --- @feature transfer @layer client ---
  commitTransfer: (body: Parameters<PayrollApi["commitTransfer"]>[0]) =>
    getPayrollApi().commitTransfer(body),
  acknowledgeTransferFinding: (findingId: string, note?: string) =>
    getPayrollApi().acknowledgeTransferFinding(findingId, note),
  // --- @feature treatments @layer client ---
  recordWageTreatmentDeparture: (
    payItemId: string,
    body: Parameters<PayrollApi["recordWageTreatmentDeparture"]>[1]
  ) => getPayrollApi().recordWageTreatmentDeparture(payItemId, body),
  recordPcbClassDeparture: (
    payItemId: string,
    body: Parameters<PayrollApi["recordPcbClassDeparture"]>[1]
  ) => getPayrollApi().recordPcbClassDeparture(payItemId, body),
};
