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
  type ImportReportResponse,
  type MeResponse,
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

export function createApiClient(deps: ApiClientDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = deps.apiBase.replace(TRAILING_SLASH, "");

  async function request<T>(
    path: string,
    init: RequestInit = {},
    retried = false
  ): Promise<T> {
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
      return await request<T>(path, init, true);
    }

    if (!response.ok) {
      throw await toApiError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  async function requestText(path: string, retried = false): Promise<string> {
    let token: string;
    try {
      token = await deps.acquireToken();
    } catch (error) {
      throw new SessionExpiredError(
        error instanceof Error ? error.message : "Failed to acquire token",
        { cause: error }
      );
    }

    const headers = new Headers();
    headers.set("Authorization", `Bearer ${token}`);

    const response = await fetchImpl(`${base}${path}`, {
      headers,
      credentials: "omit",
    });

    if (response.status === 401) {
      if (retried) {
        throw new SessionExpiredError();
      }
      return await requestText(path, true);
    }

    if (!response.ok) {
      throw await toApiError(response);
    }

    return await response.text();
  }

  return {
    getMe: () => request<MeResponse>("/v1/me"),
    getPermissions: (companyId?: string | null) => {
      const q =
        companyId === undefined || companyId === null || companyId === ""
          ? ""
          : `?companyId=${encodeURIComponent(companyId)}`;
      return request<PermissionsResponse>(`/v1/me/permissions${q}`);
    },
    getAdminUsers: () => request<AdminUsersResponse>("/v1/admin/users"),
    downloadEmployeeImportTemplate: (companyId?: string | null) => {
      const q =
        companyId === undefined || companyId === null || companyId === ""
          ? ""
          : `?companyId=${encodeURIComponent(companyId)}`;
      return requestText(`/v1/employee-import/template${q}`);
    },
    importEmployees: (body: string, contentType: string) =>
      request<ImportReportResponse>("/v1/employee-import", {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      }),
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
