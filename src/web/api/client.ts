/**
 * Bearer-only business API client.
 *
 * Acquires a JWT via the injected token function (Neon Auth `token()`), never
 * sends cookies to VITE_API_BASE. On 401: re-acquire once, retry once, then
 * SessionExpiredError.
 */

import type {
  PayslipDocumentDto,
  PayslipIndexRow,
} from "@/web/payrun/payslip-document/types";
import {
  type AdminUsersResponse,
  ApiClientError,
  type ApiErrorBody,
  type ArtifactsListResponse,
  type ArtifactType,
  type CloseRunResponse,
  type ClosureChecklistResponse,
  type DistributionChannel,
  type EmployeeSummary,
  type FindingsListResponse,
  type GateKind,
  type GateResult,
  type GetBatchResponse,
  type ImportReportResponse,
  type MeResponse,
  type PaymentsListResponse,
  type PayRunSummary,
  type PayRunWorkspaceView,
  type PermissionsResponse,
  type ReleaseCommitResponse,
  type ReleaseMethod,
  type ReleasePreviewResponse,
  SessionExpiredError,
  type SignedArtifactUrlResponse,
  type StoreArtifactResponse,
  type WithdrawalReason,
} from "./types";

const TRAILING_SLASH = /\/$/;

export type AcquireToken = () => Promise<string>;

export interface ApiClientDeps {
  readonly apiBase: string;
  readonly acquireToken: AcquireToken;
  readonly fetchImpl?: typeof fetch;
}

function companyQuery(companyId?: string | null): string {
  if (companyId === undefined || companyId === null || companyId === "") {
    return "";
  }
  return `?companyId=${encodeURIComponent(companyId)}`;
}

export interface GetPayRunsParams {
  readonly companyId?: string;
  readonly reportingMonth?: string;
}

export interface GetEmployeesParams {
  readonly companyId?: string;
  readonly search?: string;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      qs.set(key, value);
    }
  }
  const serialized = qs.toString();
  return serialized === "" ? "" : `?${serialized}`;
}

export function createApiClient(deps: ApiClientDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = deps.apiBase.replace(TRAILING_SLASH, "");

  async function requestRaw(
    path: string,
    init: RequestInit = {},
    retried = false
  ): Promise<Response> {
    let token: string;
    try {
      token = await deps.acquireToken();
    } catch (error) {
      throw new SessionExpiredError(
        error instanceof Error ? error.message : "Failed to acquire token",
        { cause: error }
      );
    }

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    // Intentionally omit credentials — business API is Bearer-only.
    const response = await fetchImpl(`${base}${path}`, {
      ...init,
      headers,
      credentials: "omit",
    });

    if (response.status === 401) {
      if (retried) {
        throw new SessionExpiredError();
      }
      return await requestRaw(path, init, true);
    }

    if (!response.ok) {
      throw await toApiError(response);
    }

    return response;
  }

  async function requestJson<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const response = await requestRaw(path, init);
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  async function requestText(path: string): Promise<string> {
    const response = await requestRaw(path);
    return await response.text();
  }

  return {
    getMe: () => requestJson<MeResponse>("/v1/me"),
    getPermissions: (companyId?: string | null) =>
      requestJson<PermissionsResponse>(
        `/v1/me/permissions${companyQuery(companyId)}`
      ),
    getAdminUsers: () => requestJson<AdminUsersResponse>("/v1/admin/users"),
    downloadEmployeeImportTemplate: (companyId?: string | null) =>
      requestText(`/v1/employee-import/template${companyQuery(companyId)}`),
    importEmployees: (body: string, contentType: string) =>
      requestJson<ImportReportResponse>("/v1/employee-import", {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      }),
    getPayRuns: (params?: GetPayRunsParams) =>
      requestJson<PayRunSummary[]>(
        `/v1/pay-runs${buildQuery({
          companyId: params?.companyId,
          reportingMonth: params?.reportingMonth,
        })}`
      ),
    getWorkspace: (runId: string) =>
      requestJson<PayRunWorkspaceView>(`/v1/pay-runs/${runId}/workspace`),
    recompute: (runId: string) =>
      requestJson<void>(`/v1/pay-runs/${runId}/recompute`, {
        method: "POST",
      }),
    review: (runId: string, calcRevision: string) =>
      requestJson<void>(`/v1/pay-runs/${runId}/review`, {
        method: "POST",
        body: JSON.stringify({ calcRevision }),
      }),
    approve: (runId: string, calcRevision: string) =>
      requestJson<void>(`/v1/pay-runs/${runId}/approve`, {
        method: "POST",
        body: JSON.stringify({ calcRevision }),
      }),
    getFindings: (runId: string) =>
      requestJson<FindingsListResponse>(`/v1/pay-runs/${runId}/findings`),
    scanFindings: (runId: string) =>
      requestJson<void>(`/v1/pay-runs/${runId}/findings/scan`, {
        method: "POST",
      }),
    acknowledgeFinding: (runId: string, findingId: string, note?: string) =>
      requestJson<void>(
        `/v1/pay-runs/${runId}/findings/${findingId}/acknowledge`,
        {
          method: "POST",
          body: JSON.stringify(note === undefined ? {} : { note }),
        }
      ),
    evaluateGate: (runId: string, gate: GateKind) =>
      requestJson<GateResult>(`/v1/pay-runs/${runId}/gates/${gate}`),
    getEmployees: (params?: GetEmployeesParams) =>
      requestJson<EmployeeSummary[]>(
        `/v1/employees${buildQuery({
          companyId: params?.companyId,
          search: params?.search,
        })}`
      ),
    getPayments: (runId: string) =>
      requestJson<PaymentsListResponse>(`/v1/pay-runs/${runId}/payments`),
    holdLine: (runId: string, lineId: string, reason: string) =>
      requestJson<void>(`/v1/pay-runs/${runId}/lines/${lineId}/hold`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    unholdLine: (runId: string, lineId: string) =>
      requestJson<void>(`/v1/pay-runs/${runId}/lines/${lineId}/unhold`, {
        method: "POST",
      }),
    withdrawLine: (
      runId: string,
      lineId: string,
      body: {
        readonly reasonCode: WithdrawalReason;
        readonly note: string;
        readonly postApprovalApprover?: string;
        readonly replacementRunId?: string;
      }
    ) =>
      requestJson<void>(`/v1/pay-runs/${runId}/lines/${lineId}/withdraw`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    previewRelease: (runId: string, lineIds: readonly string[]) =>
      requestJson<ReleasePreviewResponse>(
        `/v1/pay-runs/${runId}/release/preview`,
        {
          method: "POST",
          body: JSON.stringify({ lineIds }),
        }
      ),
    commitRelease: (
      runId: string,
      lineIds: readonly string[],
      method: ReleaseMethod
    ) =>
      requestJson<ReleaseCommitResponse>(`/v1/pay-runs/${runId}/release`, {
        method: "POST",
        body: JSON.stringify({ lineIds, method }),
      }),
    getBatch: (runId: string, batchId: string) =>
      requestJson<GetBatchResponse>(`/v1/pay-runs/${runId}/batches/${batchId}`),
    settleAttempt: (
      runId: string,
      attemptId: string,
      body: {
        readonly outcome: "PAID" | "FAILED";
        readonly paymentRef?: string;
        readonly failedReason?: string;
      }
    ) =>
      requestJson<void>(`/v1/pay-runs/${runId}/attempts/${attemptId}/settle`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    reconcileAttempt: (
      runId: string,
      attemptId: string,
      evidenceArtifactId?: string
    ) =>
      requestJson<void>(
        `/v1/pay-runs/${runId}/attempts/${attemptId}/reconcile`,
        {
          method: "POST",
          body: JSON.stringify(
            evidenceArtifactId === undefined ? {} : { evidenceArtifactId }
          ),
        }
      ),
    cancelRelease: (runId: string, batchId: string, reason: string) =>
      requestJson<void>(`/v1/pay-runs/${runId}/batches/${batchId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    recordDistribution: (
      runId: string,
      lineId: string,
      body: {
        readonly channel: DistributionChannel;
        readonly artifactId?: string;
        readonly note?: string;
      }
    ) =>
      requestJson<{ id: string }>(
        `/v1/pay-runs/${runId}/lines/${lineId}/distributions`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      ),
    getArtifacts: (runId: string) =>
      requestJson<ArtifactsListResponse>(`/v1/pay-runs/${runId}/artifacts`),
    uploadArtifact: (
      runId: string,
      body: {
        readonly filename: string;
        readonly mimeType: string;
        readonly base64: string;
        readonly type: ArtifactType;
      }
    ) =>
      requestJson<StoreArtifactResponse>(`/v1/pay-runs/${runId}/artifacts`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getArtifactUrl: (runId: string, artifactId: string) =>
      requestJson<SignedArtifactUrlResponse>(
        `/v1/pay-runs/${runId}/artifacts/${artifactId}/url`
      ),
    getClosureChecklist: (runId: string) =>
      requestJson<ClosureChecklistResponse>(
        `/v1/pay-runs/${runId}/closure-checklist`
      ),
    closeRun: (runId: string) =>
      requestJson<CloseRunResponse>(`/v1/pay-runs/${runId}/close`, {
        method: "POST",
      }),
    getPayslip: (runId: string, lineId: string) =>
      requestJson<PayslipDocumentDto>(
        `/v1/pay-runs/${runId}/lines/${lineId}/payslip`
      ),
    getPayslipIndex: (runId: string) =>
      requestJson<{ payslips: PayslipIndexRow[] }>(
        `/v1/pay-runs/${runId}/payslips`
      ),
  };
}

async function toApiError(response: Response): Promise<ApiClientError> {
  let code = "INTERNAL_ERROR";
  let message = response.statusText || `HTTP ${response.status}`;
  try {
    const body = (await response.json()) as ApiErrorBody;
    const { code: bodyCode, message: bodyMessage } = body;
    if (typeof bodyCode === "string" && bodyCode.length > 0) {
      code = bodyCode;
    }
    if (typeof bodyMessage === "string" && bodyMessage.length > 0) {
      message = bodyMessage;
    }
  } catch {
    // Non-JSON error body — keep statusText defaults.
  }
  return new ApiClientError(code, message, response.status);
}
