/**
 * Bearer-only business API client.
 *
 * Acquires a JWT via the injected token function (Neon Auth `token()`), never
 * sends cookies to VITE_API_BASE. On 401: re-acquire once, retry once, then
 * SessionExpiredError.
 */

import {
  type AdminUsersResponse,
  ApiClientError,
  type ApiErrorBody,
  type EmployeeSummary,
  type ImportReportResponse,
  type MeResponse,
  type PayRunSummary,
  type PayRunWorkspaceView,
  type PermissionsResponse,
  SessionExpiredError,
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
    getEmployees: (params?: GetEmployeesParams) =>
      requestJson<EmployeeSummary[]>(
        `/v1/employees${buildQuery({
          companyId: params?.companyId,
          search: params?.search,
        })}`
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
