import type { PermissionAction, PermissionResource } from "@/domain/rbac/types";

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

export class SessionExpiredError extends Error {
  constructor(message = "Session expired", options?: ErrorOptions) {
    super(message, options);
    this.name = "SessionExpiredError";
  }
}

export interface MeResponse {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly status: string;
}

export interface PermissionsResponse {
  readonly companyId: string | null;
  readonly permissions: Readonly<
    Record<PermissionResource, readonly PermissionAction[]>
  >;
}

export interface AdminUserRow {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly status: string;
  readonly authSubject: string | null;
}

export interface AdminUsersResponse {
  readonly users: readonly AdminUserRow[];
}

export interface ImportRowError {
  readonly field: string;
  readonly reason: string;
}

export type ImportRowOutcome =
  | {
      readonly status: "CREATED";
      readonly rowNumber: number;
      readonly employeeCode: string;
      readonly employmentId: string;
    }
  | {
      readonly status: "SKIPPED_EXISTING";
      readonly rowNumber: number;
      readonly employeeCode: string;
    }
  | {
      readonly status: "FAILED";
      readonly rowNumber: number;
      readonly employeeCode: string | null;
      readonly errors: readonly ImportRowError[];
    };

export interface ImportReportResponse {
  readonly created: number;
  readonly skippedExisting: number;
  readonly failed: number;
  readonly rows: readonly ImportRowOutcome[];
}
