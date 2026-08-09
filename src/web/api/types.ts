/**
 * @feature shell
 * @layer client
 *
 * Shared FE DTOs — per-feature section banners below. Keep in sync with producers.
 */

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

// --- @feature me @layer client ---
export interface MeCompany {
  readonly id: string;
  readonly code: string;
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

// --- @feature admin-users @layer client ---
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

// --- @feature companies @layer client ---
/**
 * Keep in sync with `CompanyDirectoryRow` in `src/service/admin-companies.ts`
 * (`GET|POST /v1/admin/companies`, `PATCH /v1/admin/companies/:companyId`).
 */
export interface AdminCompanyRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly epfNo: string | null;
  readonly socsoNo: string | null;
  readonly lhdnNo: string | null;
  readonly hrdfEnabled: boolean;
  readonly hrdfLevyPct: string;
  readonly createdAt: string;
}

export interface AdminCompaniesResponse {
  readonly companies: readonly AdminCompanyRow[];
}

/** Keep in sync with create body Zod in `src/server/routes/admin-companies.ts`. */
export interface CreateAdminCompanyBody {
  readonly code: string;
  readonly name: string;
  readonly epfNo?: string | null;
  readonly socsoNo?: string | null;
  readonly lhdnNo?: string | null;
  readonly hrdfEnabled?: boolean;
  readonly hrdfLevyPct?: string;
}

/** Keep in sync with patch body Zod in `src/server/routes/admin-companies.ts`. */
export interface UpdateAdminCompanyBody {
  readonly name?: string;
  readonly epfNo?: string | null;
  readonly socsoNo?: string | null;
  readonly lhdnNo?: string | null;
  readonly hrdfEnabled?: boolean;
  readonly hrdfLevyPct?: string;
}

// --- @feature employee-import @layer client ---
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
 * `GET /v1/pay-runs` row — Keep in sync with `src/repo/pay-run.ts` `PayRunSummary`.
 */
// --- @feature pay-run @layer client ---
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
 * `GET /v1/employees` row — Keep in sync with `src/repo/employees.ts` `EmployeeSummary`.
 */
// --- @feature employees @layer client ---
export interface EmployeeSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly companyId: string;
  readonly status: "ACTIVE" | "TERMINATED";
}

/**
 * The workspace read model — Keep in sync with `src/repo/workspace.ts`
 * `PayRunWorkspaceView` and nested DTOs.
 */
// --- @feature workspace @layer client ---
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

// --- @feature findings @layer client ---
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
  readonly lineId: string;
  readonly employeeId: string;
  readonly employeeCode: string;
  readonly employeeName: string;
  readonly roots: Readonly<Record<string, RootValue>>;
  readonly previousRoots: Readonly<Record<string, RootValue>> | null;
  readonly variance: EmployeeVarianceDto | null;
  readonly rootVariances: Readonly<Record<string, VarianceDto>> | null;
  readonly findingsCount: number;
}

export interface PayRunWorkspaceView {
  readonly run: RunSummary;
  readonly actionAvailability: ActionAvailability;
  readonly totals: readonly AggregateTile[];
  readonly findingsSummary: FindingsSummary | null;
  readonly lines: readonly EmployeeLineDto[];
}

// --- @feature control @layer client ---
export type LinePaymentState =
  | "READY"
  | "HOLD"
  | "RELEASED"
  | "PAID"
  | "FAILED_RETURNED"
  | "RECONCILED"
  | "WITHDRAWN";

export type WithdrawalReason =
  | "MOVED_TO_OFFCYCLE"
  | "DUPLICATE_LINE"
  | "EMPLOYEE_NOT_PAYABLE"
  | "PAYMENT_CANCELLED_BY_AUTHORITY"
  | "OTHER_CONTROLLED_EXCEPTION";

/**
 * `GET /v1/pay-runs/:runId/payments` row — see `src/server/routes/pay-run-control.ts`.
 * `employmentId` correlates this row to workspace `EmployeeLineDto.employeeId`.
 */
export interface LinePaymentRow {
  readonly lineId: string;
  readonly employmentId: string;
  readonly state: LinePaymentState;
  readonly holdReason: string | null;
  readonly releaseBatchId: string | null;
  readonly paymentRef: string | null;
  readonly netSen: number | null;
}

export interface PaymentsListResponse {
  readonly payments: readonly LinePaymentRow[];
}

export type ReleaseMethod = "BANK" | "CASH";

/** `POST /v1/pay-runs/:runId/release/preview` response — see `src/service/release.ts` `ReleasePreview`. */
export interface ReleaseEligibleLine {
  readonly lineId: string;
  readonly employmentId: string;
  readonly netSen: number;
  readonly bank: string;
  readonly account: string;
  readonly name: string;
}

export interface ReleaseExcludedLine {
  readonly lineId: string;
  readonly reason: string;
}

export interface ReleaseByBank {
  readonly bank: string;
  readonly count: number;
  readonly totalSen: number;
}

export interface ReleasePreviewResponse {
  readonly eligible: readonly ReleaseEligibleLine[];
  readonly excluded: readonly ReleaseExcludedLine[];
  readonly totalSen: number;
  readonly byBank: readonly ReleaseByBank[];
}

/** `POST /v1/pay-runs/:runId/release` response — see `src/service/release.ts` `commitRelease`. */
export interface ReleaseCommitResponse {
  readonly batchId: string;
  readonly registerArtifactId: string;
}

export type PaymentAttemptStatus = "PENDING" | "PAID" | "FAILED";
export type ReleaseBatchStatus =
  | "OPEN"
  | "PARTIALLY_SETTLED"
  | "SETTLED"
  | "SETTLED_WITH_FAILURES"
  | "CANCELLED";

/** `payment_attempts` row — see `src/db/schema/control.ts`. */
export interface PaymentAttempt {
  readonly id: string;
  readonly batchId: string;
  readonly lineId: string;
  readonly amountSen: number;
  readonly bankSnapshot: {
    readonly bank: string;
    readonly account: string;
    readonly name: string;
  };
  readonly status: PaymentAttemptStatus;
  readonly failedReason: string | null;
  readonly settledAt: string | null;
  readonly paymentRef: string | null;
  readonly createdAt: string;
}

/** `release_batches` row — see `src/db/schema/control.ts`. */
export interface ReleaseBatch {
  readonly id: string;
  readonly runId: string;
  readonly method: ReleaseMethod;
  readonly status: ReleaseBatchStatus;
  readonly totalSen: number;
  readonly lineCount: number;
  readonly registerArtifactId: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
}

/** `GET /v1/pay-runs/:runId/batches/:batchId` response — see `src/service/release.ts` `getBatch`. */
export interface GetBatchResponse {
  readonly batch: ReleaseBatch;
  readonly attempts: readonly PaymentAttempt[];
}

/** One row of `GET /v1/pay-runs/:runId/closure-checklist` — see `src/service/close.ts` `ChecklistItem`. */
export interface ChecklistItem {
  readonly item: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface ClosureChecklistResponse {
  readonly checklist: readonly ChecklistItem[];
}

/** Issued inside the closing transaction — see `src/service/closure-seal.ts`. */
export interface IssuedSeal {
  readonly sequence: number;
  readonly sealHash: string;
  readonly previousSealHash: string | null;
  readonly manifestSha256: string;
  readonly sealVersion: string;
  readonly closedAt: string;
  readonly closedBy: string;
}

/** RFC 3161 outcome; SKIPPED when no authority is configured. */
export interface TimestampOutcome {
  readonly state: "STAMPED" | "ALREADY_STAMPED" | "SKIPPED" | "FAILED";
  readonly detail: string;
  readonly tokenArtifactId: string | null;
  readonly genTime: string | null;
}

/** `POST /v1/pay-runs/:runId/close` response — see `src/service/close.ts` `closeRun`. */
export interface CloseRunResponse {
  readonly manifestArtifactId: string;
  readonly seal: IssuedSeal;
  readonly timestamp: TimestampOutcome;
}

/** One seal as verification found it — see `src/service/closure-seal.ts`. */
export interface SealStatus {
  readonly runId: string;
  readonly sequence: number;
  readonly sealHash: string;
  readonly previousSealHash: string | null;
  readonly manifestSha256: string;
  readonly manifestArtifactId: string;
  readonly closedAt: string;
  readonly closedBy: string;
  readonly sealVersion: string;
  readonly ok: boolean;
  /** Empty when `ok`. Each entry names one disagreement, in plain words. */
  readonly problems: readonly string[];
}

export interface RunSeal extends SealStatus {
  readonly companyId: string;
  readonly chainLength: number;
  readonly chainOk: boolean;
}

/** Whether third-party stamping is switched on for this deployment. */
export interface TimestampStatus {
  readonly configured: boolean;
  readonly tsaUrl: string | null;
  /** What to set `TSA_URL` to if a client asks for external corroboration. */
  readonly suggestedTsaUrl: string;
  readonly tokenArtifactId: string | null;
  readonly genTime: string | null;
}

/** `GET /v1/pay-runs/:runId/seal` response. `seal` is null until the run closes. */
export interface RunSealResponse {
  readonly seal: RunSeal | null;
  readonly timestamp: TimestampStatus;
}

/** `GET /v1/pay-runs/:runId/closure-chain` — the whole company chain. */
export interface ClosureChainResponse {
  readonly companyId: string;
  readonly length: number;
  readonly ok: boolean;
  readonly seals: readonly SealStatus[];
}

export type DistributionChannel =
  | "GENERATED"
  | "SENT"
  | "DELIVERED"
  | "HANDED"
  | "PRINTED";

// --- @feature artifacts @layer client ---
export type ArtifactType =
  | "EVIDENCE"
  | "PAYMENT_REGISTER"
  | "BANK_FILE"
  | "CASH_SHEET"
  | "PAYSLIP_PDF"
  | "MANIFEST"
  | "EXCEPTION_REPORT"
  | "TIMESTAMP_TOKEN";

/** Manual attach via HTTP/SPA — server-generated types are not uploadable. */
export type UploadArtifactType = "EVIDENCE" | "EXCEPTION_REPORT";

/**
 * Keep in sync with `ArtifactListItem` in `src/service/artifacts.ts`.
 */
export interface ArtifactRow {
  readonly id: string;
  readonly runId: string | null;
  readonly entityType:
    | "TRANSFER"
    | "EMPLOYMENT_PRIOR_YTD"
    | "PAY_RUN"
    | "OTHER";
  readonly entityId: string | null;
  readonly type: ArtifactType;
  readonly relativePath: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly mimeType: string;
  readonly source: "ATTACHED" | "GENERATED";
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface ArtifactDownload {
  readonly blob: Blob;
  readonly filename: string;
}

export interface ArtifactsListResponse {
  readonly artifacts: readonly ArtifactRow[];
}

export interface StoreArtifactResponse {
  readonly id: string;
  readonly sha256: string;
  readonly relativePath: string;
}

/**
 * `GET /v1/pay-runs/:runId/lines/:lineId/diff` row — see
 * `src/server/routes/pay-run-diff.ts` `NodeDiffRow`.
 */
// --- @feature diff @layer client ---
export interface NodeDiffRow {
  readonly d: "ADDED" | "REMOVED" | "VALUE" | "STRUCTURE" | "CITATION";
  readonly id: string;
  readonly label: string;
  readonly fromValue: string | null;
  readonly toValue: string | null;
  readonly deltaSen: number | null;
  readonly addedRefs: readonly string[];
  readonly removedRefs: readonly string[];
}

/** Keep in sync with `src/server/routes/pay-run-diff.ts` JSON body. */
export interface RunLineDiffDto {
  readonly runId: string;
  readonly lineId: string;
  readonly employmentId: string;
  readonly priorRunId: string | null;
  readonly diffs: readonly NodeDiffRow[];
}

/**
 * Keep in sync with `src/service/line-derivation.ts` `DerivedNodeDto` /
 * `LineDerivationDto` and `src/components/payroll/node-panel.tsx` `DerivedNode`.
 */
// --- @feature derivation @layer client ---
export interface DerivedNodeDto {
  readonly key: string;
  readonly kind:
    | "FORMULA"
    | "TABLE_LOOKUP"
    | "RATE"
    | "CAP"
    | "OVERRIDE"
    | "PASSTHROUGH"
    | "NOT_APPLICABLE";
  readonly label: {
    readonly key: string;
    readonly params?: Record<string, string | number>;
  };
  readonly sen: number | null;
  readonly citation: {
    readonly ruleId: string;
    readonly authority: string;
    readonly reference: string;
    readonly effectiveDate: string;
    readonly displayText: string;
  } | null;
  readonly citationStatus: "RESOLVED" | "UNRESOLVED";
  readonly flags: Array<"REVIEW_REQUIRED" | "UNVERIFIED" | "NOT_ENTERED">;
  readonly children?: readonly DerivedNodeDto[];
}

export interface LineDerivationDto {
  readonly runId: string;
  readonly lineId: string;
  readonly employmentId: string;
  readonly root: string;
  readonly rootKeys: readonly string[];
  readonly node: DerivedNodeDto | null;
}

// --- @feature reports @layer client ---
export interface ReportMeta {
  readonly companyId: string;
  readonly companyName: string;
  readonly runId?: string;
  readonly runStatus?: string;
  readonly calcRevision?: string | null;
  readonly generatedAt: string;
  readonly reportSchemaVersion: string;
}

export interface PaymentRegisterRow {
  readonly lineId: string;
  readonly employeeCode: string;
  readonly employeeName: string;
  readonly netSen: number | null;
  readonly paymentState: string | null;
  readonly paymentRef: string | null;
  readonly maskedBankAccount: string | null;
}

/** Keep in sync with `PaymentRegisterReport` in `src/service/pay-run-reports.ts`. */
export interface PaymentRegisterDto {
  readonly reportMeta: ReportMeta;
  readonly rows: readonly PaymentRegisterRow[];
  readonly totalNetSen: number;
  /** True when any row's net was null (unknown) and omitted from the sum. */
  readonly incomplete: boolean;
}

/** Keep in sync with `StatutorySummaryReport` in `src/service/pay-run-reports.ts`. */
export interface StatutorySummaryDto {
  readonly reportMeta: ReportMeta;
  readonly employeeCount: number;
  readonly grossTotalSen: number;
  readonly netTotalSen: number;
  readonly epfEeTotalSen: number;
  readonly epfErTotalSen: number;
  readonly socsoEeCoreTotalSen: number;
  readonly socsoErTotalSen: number;
  readonly eisEeTotalSen: number;
  readonly eisErTotalSen: number;
  readonly pcbNetTotalSen: number;
  readonly cp38TotalSen: number;
  /** True when any contributor sen was null and omitted from a total. */
  readonly incomplete: boolean;
}

export interface ExceptionFindingRow {
  readonly id: string;
  readonly severity: string;
  readonly status: string;
  readonly title: string;
  readonly detail: string;
  readonly lineId: string | null;
  readonly employeeName: string | null;
}

/** Keep in sync with `ExceptionReport` in `src/service/pay-run-reports.ts`. */
export interface ExceptionReportDto {
  readonly reportMeta: ReportMeta;
  readonly findings: readonly ExceptionFindingRow[];
}

/** Keep in sync with `AnnualRemunerationSummary` in `src/service/employee-remuneration.ts`. */
// --- @feature remuneration @layer client ---
export interface AnnualRemunerationSummaryDto {
  readonly reportMeta: ReportMeta;
  readonly year: number;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly employeeCode: string;
  readonly runsIncluded: readonly string[];
  readonly months: readonly string[];
  readonly grossSen: number;
  readonly netSen: number;
  readonly epfEeSen: number;
  readonly epfErSen: number;
  readonly socsoEeCoreSen: number;
  readonly eisEeSen: number;
  readonly pcbNetSen: number;
  readonly cp38Sen: number;
  /** True when any month's figure was null and omitted from a total. */
  readonly incomplete: boolean;
  readonly limitationNotice: string;
  readonly disclaimer: string;
}

/** Simple mutation ack — hold/unhold/withdraw/settle/reconcile/cancel, role assign/revoke. */
export interface OkResponse {
  readonly ok: true;
}

/**
 * Unified success payload for pay-run mutations.
 * Keep in sync with `src/service/pay-run-mutation-envelope.ts`.
 */
// --- @feature pay-run @layer client ---
export type PayRunMutationKind =
  | {
      readonly kind: "CREATE";
      readonly lineCount: number;
    }
  | {
      readonly kind: "RECOMPUTE";
      readonly computed: number;
      readonly failures: readonly {
        readonly employmentId: string;
        readonly reason: string;
      }[];
    }
  | { readonly kind: "REVIEW" }
  | { readonly kind: "APPROVE" }
  | { readonly kind: "DEMOTE" }
  | {
      readonly kind: "FINDINGS_SCAN";
      readonly scanned: number;
      readonly revision: string | null;
    }
  | {
      readonly kind: "FINDING_ACKNOWLEDGE";
      readonly findingId: string;
    };

export interface PayRunMutationEnvelope {
  readonly run: {
    readonly id: string;
    readonly companyId: string;
    readonly status: string;
    readonly calcRevision: string | null;
    readonly findingsScannedRevision: string | null;
    readonly reviewedRevision: string | null;
    readonly approvedRevision: string | null;
    readonly year: number;
    readonly month: number;
  };
  readonly counters: {
    readonly lineCount: number;
    readonly findingsTotal: number;
    readonly findingsOpen: number;
    readonly findingsBlocking: number;
    readonly findingsWarning: number;
    readonly gates: Readonly<
      Record<GateKind, { readonly ok: boolean; readonly issueCount: number }>
    >;
  };
  readonly mutation: PayRunMutationKind;
}

/** Keep in sync with create body Zod in `src/server/routes/pay-run.ts`. */
export interface CreatePayRunBody {
  readonly runId: string;
  readonly companyId: string;
  /** Omit to resolve MY-STATUTORY via `resolveRule` on periodEnd. */
  readonly rulePackId?: string;
  readonly year: number;
  readonly month: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly workingDays: number;
  readonly paidDays?: number | null;
  readonly onlyEmploymentIds?: readonly string[];
  readonly runType?: "REGULAR" | "OFFCYCLE";
  readonly offcycleReason?:
    | "CORRECTION"
    | "ARREARS"
    | "BONUS"
    | "MISSED_PAYMENT"
    | "FINAL_PAYMENT"
    | null;
}

export interface InviteAdminUserBody {
  readonly email: string;
  readonly name: string;
  readonly roleCode?: string;
  readonly companyId?: string | null;
}

export interface UpdateAdminUserBody {
  readonly status: "ACTIVE" | "DISABLED";
}

export interface AdminUserRoleBody {
  readonly roleCode: string;
  readonly companyId?: string | null;
}

/** Keep in sync with commit body Zod in `src/server/routes/transfers.ts`. */
// --- @feature transfer @layer client ---
export interface CommitTransferBody {
  readonly personId: string;
  readonly fromEmploymentId: string;
  readonly effectiveDate: string;
  readonly toCompanyId: string;
  readonly toEmployeeCode: string;
  readonly groupServiceContinuity: "CONTINUOUS" | "RESET";
  readonly continuityReason?: string | null;
  readonly leaveBenefitTreatmentNote?: string | null;
  readonly allowOverlap?: boolean;
  readonly overlapReason?: string | null;
  readonly evidenceArtifactId?: string | null;
  readonly payBasis?: "MONTHLY" | "DAILY" | "HOURLY";
  readonly baseRateSen?: number;
  readonly isMalaysian?: boolean;
  readonly isPermanentResident?: boolean;
  readonly epfApplicable?: boolean;
  readonly socsoApplicable?: boolean;
  readonly eisApplicable?: boolean;
  readonly pcbApplicable?: boolean;
  readonly epfMemberBeforeAug1998?: boolean | null;
  readonly eisPriorContribution?: boolean | null;
  readonly epfPartOverride?: "A" | "C" | "E" | "F" | "NONE" | null;
  readonly socsoCategoryOverride?: "FIRST" | "SECOND" | "NONE" | null;
  readonly epfNo?: string | null;
  readonly socsoNo?: string | null;
  readonly tin?: string | null;
  readonly bankName?: string | null;
  readonly bankAccountNo?: string | null;
  readonly bankAccountName?: string | null;
}

/** Keep in sync with `CommitTransferResult` in `src/service/transfer.ts`. */
export interface CommitTransferResponse {
  readonly transferId: string;
  readonly toEmploymentId: string;
}

/**
 * Keep in sync with `POST /v1/transfers/findings/:findingId/acknowledge` in
 * `src/server/routes/transfers.ts`.
 */
export interface AcknowledgeTransferFindingResponse {
  readonly ok: boolean;
}

/** Keep in sync with wage departure Zod in `src/server/routes/treatments.ts`. */
// --- @feature treatments @layer client ---
export interface WageTreatmentDepartureBody {
  readonly scheme: "EPF" | "SOCSO" | "EIS" | "HRD";
  readonly subject: boolean;
  readonly effectiveFrom: string;
  readonly reason: string;
  readonly approvedBy: string;
}

/** Keep in sync with PCB departure Zod in `src/server/routes/treatments.ts`. */
export interface PcbClassDepartureBody {
  readonly class: "NORMAL" | "ADDITIONAL" | "EXCLUDED";
  readonly effectiveFrom: string;
  readonly reason: string;
  readonly approvedBy: string;
}

/** Keep in sync with treatments departure JSON `{ id }`. */
export interface DepartureResponse {
  readonly id: string;
}
