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

export interface MeCompany {
  readonly id: string;
  readonly name: string;
}

export interface MeResponse {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly status: string;
  readonly companies: readonly MeCompany[];
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

/**
 * `GET /v1/pay-runs` row — see `src/repo/pay-run.ts` `PayRunSummary`.
 */
export interface PayRunSummary {
  readonly id: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly label: string;
  readonly year: number;
  readonly month: number;
  readonly status: string;
  readonly employeeCount: number;
  readonly createdAt: string;
}

/**
 * `GET /v1/employees` row — see `src/server/routes/employees.ts` `EmployeeSummary`.
 */
export interface EmployeeSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly companyId: string;
  readonly status: "ACTIVE" | "TERMINATED";
}

/**
 * The workspace read model — see `src/repo/workspace.ts`.
 * Mirrors the server's `PayRunWorkspaceView` and its nested DTOs exactly;
 * this is the client-side twin of that file, not an independent contract.
 */
export interface VarianceDto {
  readonly previousSen: number | null;
  readonly deltaSen: number | null;
  readonly deltaBps: number | null;
  readonly direction: "UP" | "DOWN" | "SAME" | "NO_PRIOR";
}

export interface SparkPoint {
  readonly reportingMonth: string;
  readonly sen: number;
}

export interface AggregateTile {
  readonly key: string;
  readonly label: string;
  readonly currentSen: number | null;
  readonly variance: VarianceDto;
  readonly history: readonly SparkPoint[];
}

export interface RunSummary {
  readonly id: string;
  readonly companyId: string;
  readonly companyName: string;
  /** `YYYY-MM`. */
  readonly reportingMonth: string;
  readonly status: string;
  readonly label: string;
  /** Content hash of the last successful recompute; required by review/approve. */
  readonly calcRevision: string | null;
}

export type FindingSeverity = "INFO" | "REVIEW" | "WARNING" | "BLOCKING";
export type FindingStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
export type GateKind = "REVIEW" | "APPROVAL" | "RELEASE" | "CLOSE";

/**
 * One `anomaly_findings` row from `GET /v1/pay-runs/:runId/findings`.
 * Timestamps arrive as ISO strings after JSON serialization.
 */
export interface FindingRow {
  readonly id: string;
  readonly runId: string | null;
  readonly transferId: string | null;
  readonly lineId: string | null;
  readonly ruleId: string;
  readonly fingerprint: string;
  readonly severity: FindingSeverity;
  readonly blocks: readonly string[];
  readonly title: string;
  readonly detail: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly status: FindingStatus;
  readonly ackNote: string | null;
  readonly ackActor: string | null;
  readonly ackAt: string | null;
  readonly detectedRevision: string | null;
  readonly resolvedAt: string | null;
  readonly resolvedRevision: string | null;
  readonly resolutionType: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FindingsListResponse {
  readonly findings: readonly FindingRow[];
}

export interface GateIssue {
  readonly kind: "finding" | "prerequisite";
  readonly code: string;
  readonly message: string;
  readonly lineId?: string;
  readonly findingId?: string;
}

export interface GateResult {
  readonly ok: boolean;
  readonly issues: readonly GateIssue[];
}

export interface ActionAvailability {
  readonly canRecompute: boolean;
  readonly canReview: boolean;
  readonly canApprove: boolean;
  readonly canClose: boolean;
}

export interface FindingsSummary {
  readonly blockingCount: number;
  readonly warningCount: number;
}

export interface RootValue {
  readonly sen: number | null;
  readonly notApplicable: boolean;
}

export interface EmployeeVarianceDto {
  readonly hasChanges: boolean;
  readonly changedRootKeys: readonly string[];
  readonly direction: "UP" | "DOWN" | "SAME" | "NO_PRIOR";
}

export interface EmployeeLineDto {
  readonly employeeId: string;
  readonly employeeCode: string;
  readonly employeeName: string;
  readonly roots: Readonly<Record<string, RootValue>>;
  readonly previousRoots: Readonly<Record<string, RootValue>> | null;
  readonly variance: EmployeeVarianceDto | null;
  readonly findingsCount: number;
}

export interface PayRunWorkspaceView {
  readonly run: RunSummary;
  readonly actionAvailability: ActionAvailability;
  readonly totals: readonly AggregateTile[];
  readonly findingsSummary: FindingsSummary | null;
  readonly lines: readonly EmployeeLineDto[];
}
