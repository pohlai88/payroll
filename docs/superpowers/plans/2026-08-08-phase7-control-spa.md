# Phase 7 — Control SPA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing Phase 7 backend (payments, release, settle, reconcile, distribute, close, R2 artifacts) into the workspace SPA so a pay run can go from APPROVED through CLOSED entirely from the UI, per [the approved design](../specs/2026-08-08-phase7-control-spa-design.md).

**Architecture:** Five new presentational components under `src/web/payrun/` (`payments-panel`, `release-panel`, `batch-drawer`, `closure-checklist-dialog`, `artifacts-panel`) fetch-on-mount and refetch-after-mutation against the 14 already-implemented Phase 7 routes, mirroring the exact pattern `findings-panel.tsx` / `gate-check-dialog.tsx` established in Phase 5C. `workspace.tsx` owns cross-panel state (release selection, active batch, closure checklist) exactly like it already owns gate-check state.

**Tech Stack:** React 19, TypeScript, wouter, Hono client (`src/web/api`), shadcn/base-ui primitives (`Dialog`, `Sheet`, `Select`, `Checkbox`, `Collapsible`), Vitest for the API-client layer, Biome/ultracite for lint, `tsc --noEmit` for types.

## Global Constraints

- `payments` (`src/service/payments.ts`) remains the sole writer of `line_payments` state — the SPA never assigns a state itself; it only calls the existing service-backed routes and renders what comes back.
- No optimistic mutations anywhere in this plan: every action calls the server, awaits the response, then refetches.
- `actionAvailability.canClose` (already computed server-side in `src/repo/workspace.ts`) gates the Close button — never re-derived from `run.status` client-side.
- Closure succeeds only through the server's mechanical `closureChecklist` (`src/service/close.ts`) — the dialog renders it verbatim, it does not compute its own eligibility.
- `LinePaymentState` badges use neutral (`outline`/`secondary`) styling, never `status-ok`/`status-bad` — payment states are process states, not success/failure.
- No new service functions or domain rules. The one exception, called out explicitly in Task 2, is a single additional column on an existing SELECT in `src/server/routes/pay-run-control.ts` (`GET /pay-runs/:runId/payments`) — needed because the current response has no field that correlates a payment row back to the workspace's `EmployeeLineDto.employeeId` (which is actually `employments.id`, not `payLines.id`). This is exposing already-joined data, not new business logic.
- Follow existing code style: `readonly` props/interfaces, `useCallback` for all handlers passed as props or used in effect deps, named exports at the bottom of each file (`export type { X }; export { Y };`).

---

### Task 1: API types + client methods for Phase 7 routes

**Files:**
- Modify: `src/web/api/types.ts`
- Modify: `src/web/api/client.ts`
- Modify: `src/web/api/payroll-api.ts`
- Test: `tests/domain/api-client.test.ts`

**Interfaces:**
- Produces: `LinePaymentState`, `LinePaymentRow`, `PaymentsListResponse`, `WithdrawalReason`, `ReleaseMethod`, `ReleaseEligibleLine`, `ReleaseExcludedLine`, `ReleaseByBank`, `ReleasePreviewResponse`, `ReleaseCommitResponse`, `PaymentAttemptStatus`, `PaymentAttempt`, `ReleaseBatchStatus`, `ReleaseBatch`, `GetBatchResponse`, `ChecklistItem`, `ClosureChecklistResponse`, `CloseRunResponse`, `DistributionChannel`, `ArtifactType`, `ArtifactRow`, `ArtifactsListResponse`, `StoreArtifactResponse`, `SignedArtifactUrlResponse` — all consumed by Tasks 3–7.
- Produces on the client: `getPayments`, `holdLine`, `unholdLine`, `withdrawLine`, `previewRelease`, `commitRelease`, `getBatch`, `settleAttempt`, `reconcileAttempt`, `cancelRelease`, `recordDistribution`, `getArtifacts`, `uploadArtifact`, `getArtifactUrl`, `getClosureChecklist`, `closeRun`.

- [ ] **Step 1: Add Phase 7 DTOs to `src/web/api/types.ts`**

Append at the end of the file (after `PayRunWorkspaceView`):

```typescript
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
 * `employmentId` correlates this row to `EmployeeLineDto.employeeId` (Task 2 adds it
 * to the server SELECT; it is not present until that task lands).
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
  readonly bankSnapshot: { readonly bank: string; readonly account: string; readonly name: string };
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

/** `POST /v1/pay-runs/:runId/close` response — see `src/service/close.ts` `closeRun`. */
export interface CloseRunResponse {
  readonly manifestArtifactId: string;
}

export type DistributionChannel =
  | "GENERATED"
  | "SENT"
  | "DELIVERED"
  | "HANDED"
  | "PRINTED";

export type ArtifactType =
  | "EVIDENCE"
  | "PAYMENT_REGISTER"
  | "BANK_FILE"
  | "CASH_SHEET"
  | "PAYSLIP_PDF"
  | "MANIFEST"
  | "EXCEPTION_REPORT";

/** `artifacts` row — see `src/db/schema/artifacts.ts`. */
export interface ArtifactRow {
  readonly id: string;
  readonly runId: string | null;
  readonly entityType: "TRANSFER" | "EMPLOYMENT_PRIOR_YTD" | "PAY_RUN" | "OTHER";
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

export interface ArtifactsListResponse {
  readonly artifacts: readonly ArtifactRow[];
}

export interface StoreArtifactResponse {
  readonly id: string;
  readonly sha256: string;
  readonly relativePath: string;
}

export interface SignedArtifactUrlResponse {
  readonly url: string;
  readonly filename: string;
}
```

- [ ] **Step 2: Add client methods to `src/web/api/client.ts`**

First, add the new type imports to the existing `import { … } from "./types"` block (keep alphabetical, matching existing style):

```typescript
import {
  type AdminUsersResponse,
  ApiClientError,
  type ApiErrorBody,
  type ArtifactsListResponse,
  type ArtifactType,
  type ClosureChecklistResponse,
  type CloseRunResponse,
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
  type SignedArtifactUrlResponse,
  type StoreArtifactResponse,
  type WithdrawalReason,
  SessionExpiredError,
} from "./types";
```

Then insert these methods into the object returned by `createApiClient`, right after the existing `getEmployees` entry (before the closing `};`):

```typescript
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
      requestJson<GetBatchResponse>(
        `/v1/pay-runs/${runId}/batches/${batchId}`
      ),
    settleAttempt: (
      runId: string,
      attemptId: string,
      body: {
        readonly outcome: "PAID" | "FAILED";
        readonly paymentRef?: string;
        readonly failedReason?: string;
      }
    ) =>
      requestJson<void>(
        `/v1/pay-runs/${runId}/attempts/${attemptId}/settle`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      ),
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
```

- [ ] **Step 3: Re-export from `src/web/api/payroll-api.ts`**

Add to the `export type { … } from "./types"` block (keep alphabetical):

```typescript
export type {
  ActionAvailability,
  AggregateTile,
  ArtifactRow,
  ArtifactsListResponse,
  ArtifactType,
  ChecklistItem,
  ClosureChecklistResponse,
  CloseRunResponse,
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
  RunSummary,
  SignedArtifactUrlResponse,
  SparkPoint,
  StoreArtifactResponse,
  VarianceDto,
  WithdrawalReason,
} from "./types";
```

Add to the `payrollApi` convenience-alias object, after the existing `getEmployees` entry:

```typescript
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
```

Also add `ReleaseMethod` to the existing `import type { GetEmployeesParams, GetPayRunsParams } from "./client";` line's neighbour import — add a new import line right below it:

```typescript
import type { ReleaseMethod } from "./types";
```

- [ ] **Step 4: Write client tests for the new methods**

Append to `tests/domain/api-client.test.ts`, inside the existing `describe("createApiClient", …)` block (add before the final closing `});`):

```typescript
  it("getPayments requests the payments list", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ payments: [] }));
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => Promise.resolve("tok"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await api.getPayments("run-1");
    const [url] = (fetchImpl.mock.calls[0] ?? []) as unknown as [string];
    expect(url).toBe("http://api.test/v1/pay-runs/run-1/payments");
  });

  it("holdLine POSTs the reason", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }));
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => Promise.resolve("tok"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await api.holdLine("run-1", "line-1", "moved off-cycle");
    const [url, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://api.test/v1/pay-runs/run-1/lines/line-1/hold");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      reason: "moved off-cycle",
    });
  });

  it("previewRelease POSTs lineIds", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ eligible: [], excluded: [], totalSen: 0, byBank: [] })
    );
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => Promise.resolve("tok"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await api.previewRelease("run-1", ["line-1", "line-2"]);
    const [url, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://api.test/v1/pay-runs/run-1/release/preview");
    expect(JSON.parse(init.body as string)).toEqual({
      lineIds: ["line-1", "line-2"],
    });
  });

  it("commitRelease POSTs lineIds and method", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ batchId: "run-1-B01", registerArtifactId: "art-1" })
    );
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => Promise.resolve("tok"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await api.commitRelease("run-1", ["line-1"], "BANK");
    expect(result.batchId).toBe("run-1-B01");
    const [, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toEqual({
      lineIds: ["line-1"],
      method: "BANK",
    });
  });

  it("closeRun POSTs with no body", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ manifestArtifactId: "art-manifest" })
    );
    const api = createApiClient({
      apiBase: "http://api.test",
      acquireToken: () => Promise.resolve("tok"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await api.closeRun("run-1");
    expect(result.manifestArtifactId).toBe("art-manifest");
    const [url, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://api.test/v1/pay-runs/run-1/close");
    expect(init.method).toBe("POST");
  });
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/domain/api-client.test.ts`
Expected: all tests pass (existing 5 + new 5 = 10 passed).

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx ultracite check src/web/api tests/domain/api-client.test.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/web/api/types.ts src/web/api/client.ts src/web/api/payroll-api.ts tests/domain/api-client.test.ts
git commit -m "feat(web-api): add Phase 7 payments/release/close/artifacts client methods"
```

---

### Task 2: Server fix — correlate payment rows to employees + HTTP test

**Why this task exists:** `EmployeeLineDto.employeeId` (the workspace DTO the grid/slide-over use) is actually `employments.id` (see `src/repo/workspace.ts:376`, `employeeId: line.employmentId`). But `GET /pay-runs/:runId/payments` currently selects only `lineId, state, holdReason, releaseBatchId, paymentRef, netSen` — no field shared with `EmployeeLineDto`. Without a correlating key, `PaymentsPanel` (Task 3) cannot join a payment row back to an employee's name/code. `payLines.employmentId` is already available because the query already joins `payLines`; this task adds one field to that existing SELECT. No new join, no new table, no new route, no new service function.

**Files:**
- Modify: `src/server/routes/pay-run-control.ts:71-83`
- Test: Create `tests/db/pay-run-payments-api.test.ts`

**Interfaces:**
- Consumes: existing `payLines`, `linePayments` schema (`src/db/schema/run.ts`, `src/db/schema/control.ts`), existing `createApp` test harness pattern (`tests/db/pay-run-workspace.test.ts`).
- Produces: `GET /v1/pay-runs/:runId/payments` response rows now include `employmentId: string`, matching the `LinePaymentRow` type added in Task 1.

- [ ] **Step 1: Add `employmentId` to the SELECT**

In `src/server/routes/pay-run-control.ts`, modify the `GET /pay-runs/:runId/payments` handler:

```typescript
  app.get("/pay-runs/:runId/payments", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      const rows = await db
        .select({
          lineId: linePayments.lineId,
          employmentId: payLines.employmentId,
          state: linePayments.state,
          holdReason: linePayments.holdReason,
          releaseBatchId: linePayments.releaseBatchId,
          paymentRef: linePayments.paymentRef,
          netSen: payLines.netSen,
        })
        .from(linePayments)
        .innerJoin(payLines, eq(payLines.id, linePayments.lineId))
        .where(eq(payLines.runId, runId));
      return c.json({ payments: rows });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });
```

(Only the `employmentId: payLines.employmentId,` line is new — inserted right after `lineId: linePayments.lineId,`.)

- [ ] **Step 2: Write the failing test**

Create `tests/db/pay-run-payments-api.test.ts`:

```typescript
/**
 * `GET /v1/pay-runs/:runId/payments` — verifies each row carries `employmentId`
 * so the SPA can correlate payment state back to `EmployeeLineDto.employeeId`.
 */

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { roles, userRoleAssignments, users } from "@/db/schema/rbac";
import { SYSTEM_ADMIN_ROLE_CODE } from "@/domain/rbac/types";
import { assignUserToRole, createUser, getRoleByCode } from "@/repo/rbac";
import { createApp } from "@/server/app";
import { AuthError } from "@/server/auth/errors";
import type { NeonAuthClaims, VerifyJwt } from "@/server/auth/jwt";
import { seed } from "../../scripts/seed";
import { ALL_TABLES, connectTestDatabase } from "./harness/database";

const database = connectTestDatabase();
const { db } = database;

const COMPANY_ID = "eeeeeeee-0000-4000-8000-000000000001";
const PERSON_ID = "eeeeeeee-0000-4000-8000-000000000002";
const EMPLOYMENT_ID = "eeeeeeee-0000-4000-8000-000000000003";
const RUN_ID = "API-PAYMENTS-2026-07";
const ADMIN_EMAIL = "payments-admin@example.com";

let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);

  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'PAYCORP', 'Payments Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'PAYMENTS WORKER', '900101-10-7777', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable,
      bank_name, bank_account_no, bank_account_name)
    VALUES (${EMPLOYMENT_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'P001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false,
            'MAYBANK', '1234567890', 'PAYMENTS WORKER')`);
});

beforeEach(async () => {
  await db.delete(userRoleAssignments);
  await db.delete(users);
  await db.delete(roles).where(eq(roles.isSystem, false));
  await database.truncate("audit_events", "pay_runs");
});

afterAll(async () => {
  await database.close();
});

function claims(partial: { sub: string; email: string }): NeonAuthClaims {
  return {
    sub: partial.sub,
    email: partial.email,
    emailVerified: undefined,
    name: undefined,
    banned: false,
  };
}

function verifier(map: Record<string, NeonAuthClaims>): VerifyJwt {
  return (token) => {
    const c = map[token];
    if (c === undefined) {
      return Promise.reject(
        new AuthError("UNAUTHORIZED", "unknown test token")
      );
    }
    return Promise.resolve(c);
  };
}

async function makeAdmin(email: string): Promise<void> {
  const user = await createUser(db, { email, name: "Payments Admin" });
  const role = await getRoleByCode(db, SYSTEM_ADMIN_ROLE_CODE);
  if (role === null) {
    throw new Error("SYSTEM_ADMIN missing");
  }
  await assignUserToRole(db, {
    userId: user.id,
    roleId: role.id,
    companyId: null,
  });
}

function adminApp() {
  return createApp({
    db,
    verifyJwt: verifier({
      admin: claims({ sub: "neon-payments-admin", email: ADMIN_EMAIL }),
    }),
  });
}

async function createReviewApproveRun(
  app: ReturnType<typeof createApp>
): Promise<void> {
  const create = await app.request("/v1/pay-runs", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      runId: RUN_ID,
      companyId: COMPANY_ID,
      rulePackId,
      year: 2026,
      month: 7,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      workingDays: 22,
      paidDays: 22,
    }),
  });
  if (create.status !== 201) {
    throw new Error(`setup: create failed with ${create.status}`);
  }

  const recompute = await app.request(`/v1/pay-runs/${RUN_ID}/recompute`, {
    method: "POST",
    headers: { Authorization: "Bearer admin" },
  });
  if (recompute.status !== 200) {
    throw new Error(`setup: recompute failed with ${recompute.status}`);
  }
  const { run } = (await recompute.json()) as { run: { calcRevision: string } };

  const review = await app.request(`/v1/pay-runs/${RUN_ID}/review`, {
    method: "POST",
    headers: {
      Authorization: "Bearer admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ calcRevision: run.calcRevision }),
  });
  if (review.status !== 200) {
    throw new Error(`setup: review failed with ${review.status}`);
  }

  const approve = await app.request(`/v1/pay-runs/${RUN_ID}/approve`, {
    method: "POST",
    headers: {
      Authorization: "Bearer admin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ calcRevision: run.calcRevision }),
  });
  if (approve.status !== 200) {
    throw new Error(`setup: approve failed with ${approve.status}`);
  }
}

describe("GET /v1/pay-runs/:runId/payments", () => {
  it("includes employmentId on each row so the SPA can correlate to EmployeeLineDto", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const app = adminApp();
    await createReviewApproveRun(app);

    const res = await app.request(`/v1/pay-runs/${RUN_ID}/payments`, {
      headers: { Authorization: "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      payments: { lineId: string; employmentId: string; state: string }[];
    };
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0]?.employmentId).toBe(EMPLOYMENT_ID);
    expect(body.payments[0]?.state).toBe("READY");
  });
});
```

- [ ] **Step 3: Run it to verify it currently fails**

Run: `npx vitest run tests/db/pay-run-payments-api.test.ts`
Expected: FAIL — `body.payments[0]?.employmentId` is `undefined`, not `EMPLOYMENT_ID` (if Step 1 has not been applied yet in your working copy; if you applied Step 1 first, apply it after seeing this fail by temporarily reverting, or simply proceed — the important check is that the assertion is meaningful).

- [ ] **Step 4: Confirm the fix (from Step 1) makes it pass**

Run: `npx vitest run tests/db/pay-run-payments-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full DB test suite to check for regressions**

Run: `npx vitest run tests/db/pay-run-payments-api.test.ts tests/db/control-lifecycle.test.ts tests/db/pay-run-api.test.ts`
Expected: all pass — `control-lifecycle.test.ts` calls the service functions directly and is unaffected by an additive SELECT column.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx ultracite check src/server/routes/pay-run-control.ts tests/db/pay-run-payments-api.test.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/routes/pay-run-control.ts tests/db/pay-run-payments-api.test.ts
git commit -m "fix(control-api): expose employmentId on payments list for SPA correlation"
```

---

### Task 3: `PaymentsPanel` component + workspace wiring

**Files:**
- Create: `src/web/payrun/payments-panel.tsx`
- Modify: `src/web/payrun/workspace.tsx`

**Interfaces:**
- Consumes: `LinePaymentRow`, `LinePaymentState`, `WithdrawalReason`, `EmployeeLineDto`, `DistributionChannel` from `@/web/api/payroll-api`; `payrollApi.getPayments/holdLine/unholdLine/withdrawLine/recordDistribution`.
- Produces: `PaymentsPanel` component with props `{ runId, lines, readOnly, selectedLineIds, onSelectionChange, refreshKey }`. `selectedLineIds`/`onSelectionChange` are consumed by `ReleasePanel` in Task 4 — `PaymentsPanel` is the only place a line can be checked for release.

- [ ] **Step 1: Create `src/web/payrun/payments-panel.tsx`**

```typescript
/**
 * Workspace payments panel — one row per pay line's `line_payments` state.
 * Row actions mirror `PAY_TRANSITIONS` in `src/service/payments.ts` exactly:
 * Hold/Withdraw on READY, Unhold/Withdraw on HOLD, Withdraw on FAILED_RETURNED,
 * "Record distribution" on PAID/RECONCILED. No other state gets an action —
 * RELEASED/PAID move only through the release/batch flow (ReleasePanel,
 * BatchDrawer). The checkbox column (READY/FAILED_RETURNED only) feeds
 * ReleasePanel's selection. When `readOnly`, the panel renders with no
 * checkboxes and no action buttons.
 */

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { MoneyCell } from "@/components/payroll/money-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  DistributionChannel,
  EmployeeLineDto,
  LinePaymentRow,
  LinePaymentState,
  WithdrawalReason,
} from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";

interface PaymentsPanelProps {
  readonly runId: string;
  readonly lines: readonly EmployeeLineDto[];
  readonly readOnly: boolean;
  readonly selectedLineIds: readonly string[];
  readonly onSelectionChange: (ids: readonly string[]) => void;
  readonly refreshKey: number;
}

const WITHDRAWAL_REASONS: readonly {
  readonly value: WithdrawalReason;
  readonly label: string;
}[] = [
  { value: "MOVED_TO_OFFCYCLE", label: "Moved to off-cycle" },
  { value: "DUPLICATE_LINE", label: "Duplicate line" },
  { value: "EMPLOYEE_NOT_PAYABLE", label: "Employee not payable" },
  {
    value: "PAYMENT_CANCELLED_BY_AUTHORITY",
    label: "Payment cancelled by authority",
  },
  { value: "OTHER_CONTROLLED_EXCEPTION", label: "Other controlled exception" },
];

const DISTRIBUTION_CHANNELS: readonly {
  readonly value: DistributionChannel;
  readonly label: string;
}[] = [
  { value: "GENERATED", label: "Generated" },
  { value: "SENT", label: "Sent" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "HANDED", label: "Handed" },
  { value: "PRINTED", label: "Printed" },
];

/** Every `LinePaymentState` renders with the same neutral badge — payment
 * states are process states, not success/failure (see Global Constraints). */
const STATE_BADGE_CLASS = "border-border bg-muted text-muted-foreground";

type ActionDialog =
  | { readonly type: "hold"; readonly lineId: string }
  | { readonly type: "withdraw"; readonly lineId: string }
  | { readonly type: "distribute"; readonly lineId: string };

function PaymentsPanel({
  runId,
  lines,
  readOnly,
  selectedLineIds,
  onSelectionChange,
  refreshKey,
}: PaymentsPanelProps) {
  const [payments, setPayments] = useState<readonly LinePaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);

  const employeeByEmploymentId = useMemo(() => {
    const map = new Map<string, EmployeeLineDto>();
    for (const line of lines) {
      map.set(line.employeeId, line);
    }
    return map;
  }, [lines]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await payrollApi.getPayments(runId);
      setPayments(res.payments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const selectedSet = useMemo(
    () => new Set(selectedLineIds),
    [selectedLineIds]
  );

  const handleToggle = useCallback(
    (lineId: string, checked: boolean) => {
      const next = new Set(selectedSet);
      if (checked) {
        next.add(lineId);
      } else {
        next.delete(lineId);
      }
      onSelectionChange([...next]);
    },
    [onSelectionChange, selectedSet]
  );

  const closeDialog = useCallback(() => {
    setDialog(null);
  }, []);

  const handleUnhold = useCallback(
    async (lineId: string) => {
      setBusyLineId(lineId);
      setError(null);
      try {
        await payrollApi.unholdLine(runId, lineId);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unhold failed");
      } finally {
        setBusyLineId(null);
      }
    },
    [load, runId]
  );

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="font-medium text-sm">Payments</span>
        <span className="text-muted-foreground text-xs">
          {payments.length} line{payments.length === 1 ? "" : "s"}
        </span>
      </div>

      {error === null ? null : (
        <p className="px-3 py-2 text-destructive text-sm">{error}</p>
      )}

      {loading && payments.length === 0 ? (
        <p className="px-3 py-4 text-muted-foreground text-sm">
          Loading payments…
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {readOnly ? null : <TableHead className="w-8" />}
                <TableHead>Employee</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Net</TableHead>
                {readOnly ? null : <TableHead className="w-56">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <PaymentRow
                  busy={busyLineId === payment.lineId}
                  employee={employeeByEmploymentId.get(payment.employmentId)}
                  key={payment.lineId}
                  onOpenDialog={setDialog}
                  onToggle={handleToggle}
                  onUnhold={handleUnhold}
                  payment={payment}
                  readOnly={readOnly}
                  selected={selectedSet.has(payment.lineId)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <HoldDialog
        onClose={closeDialog}
        onDone={load}
        runId={runId}
        target={dialog?.type === "hold" ? dialog.lineId : null}
      />
      <WithdrawDialog
        onClose={closeDialog}
        onDone={load}
        runId={runId}
        target={dialog?.type === "withdraw" ? dialog.lineId : null}
      />
      <DistributeDialog
        onClose={closeDialog}
        onDone={load}
        runId={runId}
        target={dialog?.type === "distribute" ? dialog.lineId : null}
      />
    </div>
  );
}

interface PaymentRowProps {
  readonly payment: LinePaymentRow;
  readonly employee: EmployeeLineDto | undefined;
  readonly readOnly: boolean;
  readonly selected: boolean;
  readonly busy: boolean;
  readonly onToggle: (lineId: string, checked: boolean) => void;
  readonly onUnhold: (lineId: string) => void;
  readonly onOpenDialog: (dialog: ActionDialog) => void;
}

function PaymentRow({
  payment,
  employee,
  readOnly,
  selected,
  busy,
  onToggle,
  onUnhold,
  onOpenDialog,
}: PaymentRowProps) {
  const { state, lineId } = payment;
  const checkable = state === "READY" || state === "FAILED_RETURNED";

  const handleToggle = useCallback(
    (checked: boolean) => onToggle(lineId, checked),
    [lineId, onToggle]
  );
  const handleHold = useCallback(
    () => onOpenDialog({ type: "hold", lineId }),
    [lineId, onOpenDialog]
  );
  const handleWithdraw = useCallback(
    () => onOpenDialog({ type: "withdraw", lineId }),
    [lineId, onOpenDialog]
  );
  const handleDistribute = useCallback(
    () => onOpenDialog({ type: "distribute", lineId }),
    [lineId, onOpenDialog]
  );
  const handleUnhold = useCallback(() => onUnhold(lineId), [lineId, onUnhold]);

  return (
    <TableRow>
      {readOnly ? null : (
        <TableCell>
          <Checkbox
            checked={selected}
            disabled={!checkable}
            onCheckedChange={handleToggle}
          />
        </TableCell>
      )}
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-mono text-muted-foreground text-xs">
            {employee?.employeeCode ?? "—"}
          </span>
          <span className="text-foreground text-sm">
            {employee?.employeeName ?? "Unknown employee"}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Badge className={cn("w-fit text-xs", STATE_BADGE_CLASS)}>
            {state}
          </Badge>
          {state === "HOLD" && payment.holdReason !== null ? (
            <span className="text-muted-foreground text-xs">
              {payment.holdReason}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <MoneyCell sen={payment.netSen} />
      </TableCell>
      {readOnly ? null : (
        <TableCell>
          <div className="flex flex-wrap gap-1.5">
            {state === "READY" ? (
              <Button
                disabled={busy}
                onClick={handleHold}
                size="sm"
                variant="outline"
              >
                Hold
              </Button>
            ) : null}
            {state === "HOLD" ? (
              <Button
                disabled={busy}
                onClick={handleUnhold}
                size="sm"
                variant="outline"
              >
                {busy ? "Working…" : "Unhold"}
              </Button>
            ) : null}
            {state === "READY" || state === "HOLD" || state === "FAILED_RETURNED" ? (
              <Button
                disabled={busy}
                onClick={handleWithdraw}
                size="sm"
                variant="outline"
              >
                Withdraw
              </Button>
            ) : null}
            {state === "PAID" || state === "RECONCILED" ? (
              <Button
                disabled={busy}
                onClick={handleDistribute}
                size="sm"
                variant="outline"
              >
                Record distribution
              </Button>
            ) : null}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

interface DialogBaseProps {
  readonly runId: string;
  readonly target: string | null;
  readonly onClose: () => void;
  readonly onDone: () => void;
}

function HoldDialog({ runId, target, onClose, onDone }: DialogBaseProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReasonChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setReason(e.target.value),
    []
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !submitting) {
        setReason("");
        setError(null);
        onClose();
      }
    },
    [onClose, submitting]
  );

  const handleConfirm = useCallback(async () => {
    if (target === null || reason.trim() === "") {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await payrollApi.holdLine(runId, target, reason.trim());
      setReason("");
      onClose();
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hold failed");
    } finally {
      setSubmitting(false);
    }
  }, [onClose, onDone, reason, runId, target]);

  return (
    <Dialog onOpenChange={handleOpenChange} open={target !== null}>
      <DialogContent className="sm:max-w-sm" showCloseButton>
        <DialogHeader>
          <DialogTitle>Hold payment</DialogTitle>
          <DialogDescription>
            Reason is recorded on the audit trail.
          </DialogDescription>
        </DialogHeader>
        <Input
          disabled={submitting}
          onChange={handleReasonChange}
          placeholder="Hold reason (required)"
          value={reason}
        />
        {error === null ? null : (
          <p className="text-destructive text-sm">{error}</p>
        )}
        <DialogFooter>
          <Button
            disabled={submitting}
            onClick={onClose}
            size="sm"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={submitting || reason.trim() === ""}
            onClick={handleConfirm}
            size="sm"
          >
            {submitting ? "Working…" : "Hold"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawDialog({ runId, target, onClose, onDone }: DialogBaseProps) {
  const [reasonCode, setReasonCode] = useState<WithdrawalReason | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNoteChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setNote(e.target.value),
    []
  );
  const handleReasonChange = useCallback((value: string | null) => {
    setReasonCode(value as WithdrawalReason | null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !submitting) {
        setReasonCode(null);
        setNote("");
        setError(null);
        onClose();
      }
    },
    [onClose, submitting]
  );

  const canConfirm = reasonCode !== null && note.trim() !== "";

  const handleConfirm = useCallback(async () => {
    if (target === null || !canConfirm || reasonCode === null) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await payrollApi.withdrawLine(runId, target, {
        reasonCode,
        note: note.trim(),
      });
      setReasonCode(null);
      setNote("");
      onClose();
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed");
    } finally {
      setSubmitting(false);
    }
  }, [canConfirm, note, onClose, onDone, reasonCode, runId, target]);

  return (
    <Dialog onOpenChange={handleOpenChange} open={target !== null}>
      <DialogContent className="sm:max-w-sm" showCloseButton>
        <DialogHeader>
          <DialogTitle>Withdraw line</DialogTitle>
          <DialogDescription>
            Removes this line from payment. This does not affect run totals.
          </DialogDescription>
        </DialogHeader>
        <Select onValueChange={handleReasonChange} value={reasonCode ?? undefined}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Reason (required)" />
          </SelectTrigger>
          <SelectContent>
            {WITHDRAWAL_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          disabled={submitting}
          onChange={handleNoteChange}
          placeholder="Note (required)"
          value={note}
        />
        {error === null ? null : (
          <p className="text-destructive text-sm">{error}</p>
        )}
        <DialogFooter>
          <Button
            disabled={submitting}
            onClick={onClose}
            size="sm"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={submitting || !canConfirm}
            onClick={handleConfirm}
            size="sm"
          >
            {submitting ? "Working…" : "Withdraw"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DistributeDialog({ runId, target, onClose, onDone }: DialogBaseProps) {
  const [channel, setChannel] = useState<DistributionChannel | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNoteChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setNote(e.target.value),
    []
  );
  const handleChannelChange = useCallback((value: string | null) => {
    setChannel(value as DistributionChannel | null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !submitting) {
        setChannel(null);
        setNote("");
        setError(null);
        onClose();
      }
    },
    [onClose, submitting]
  );

  const handleConfirm = useCallback(async () => {
    if (target === null || channel === null) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await payrollApi.recordDistribution(runId, target, {
        channel,
        note: note.trim() === "" ? undefined : note.trim(),
      });
      setChannel(null);
      setNote("");
      onClose();
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Record failed");
    } finally {
      setSubmitting(false);
    }
  }, [channel, note, onClose, onDone, runId, target]);

  return (
    <Dialog onOpenChange={handleOpenChange} open={target !== null}>
      <DialogContent className="sm:max-w-sm" showCloseButton>
        <DialogHeader>
          <DialogTitle>Record distribution</DialogTitle>
          <DialogDescription>
            How was the payslip/advice delivered for this line?
          </DialogDescription>
        </DialogHeader>
        <Select onValueChange={handleChannelChange} value={channel ?? undefined}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Channel (required)" />
          </SelectTrigger>
          <SelectContent>
            {DISTRIBUTION_CHANNELS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          disabled={submitting}
          onChange={handleNoteChange}
          placeholder="Note (optional)"
          value={note}
        />
        {error === null ? null : (
          <p className="text-destructive text-sm">{error}</p>
        )}
        <DialogFooter>
          <Button
            disabled={submitting}
            onClick={onClose}
            size="sm"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={submitting || channel === null} onClick={handleConfirm} size="sm">
            {submitting ? "Working…" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { PaymentsPanelProps };
export { PaymentsPanel };
```

- [ ] **Step 2: Wire into `workspace.tsx`**

Add the import (alongside the other payrun imports):

```typescript
import { PaymentsPanel } from "./payments-panel";
```

Add state (near the other `useState` declarations, after `gateError`):

```typescript
  const [paymentsSelection, setPaymentsSelection] = useState<
    readonly string[]
  >([]);
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState(0);
```

Render the panel conditionally, right after `<FindingsPanel …/>` and before `<EmployeeGrid …/>`:

```tsx
        {view.run.status === "APPROVED" || view.run.status === "CLOSED" ? (
          <PaymentsPanel
            lines={view.lines}
            onSelectionChange={setPaymentsSelection}
            readOnly={view.run.status === "CLOSED"}
            refreshKey={paymentsRefreshKey}
            runId={runId}
            selectedLineIds={paymentsSelection}
          />
        ) : null}
```

`paymentsSelection` and `setPaymentsRefreshKey` are unused by anything else yet — Task 4 wires `ReleasePanel` to them, so this compiles but `paymentsRefreshKey`'s setter will show as an unused-variable warning until Task 4. To keep Task 3 independently green, mark it as intentionally-not-yet-consumed by adding a one-line comment above the state declaration:

```typescript
  // Bumped by ReleasePanel/BatchDrawer in a later task to force PaymentsPanel to refetch.
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState(0);
```

Biome/ultracite does not flag unused `useState` setters (only unused `const`/`let` bindings that are never read at all), so `setPaymentsRefreshKey` being unread is not a lint error — `paymentsRefreshKey` itself is read (passed to `PaymentsPanel`), so this compiles cleanly.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx ultracite check src/web/payrun/payments-panel.tsx src/web/payrun/workspace.tsx`
Expected: no errors. Fix any `noJsxPropsBind`/`useOptionalChain`/`noNestedTernary` findings the same way Phase 5C did (extract inline arrow functions to `useCallback`, extract nested ternaries to helper functions) — do not suppress the rule.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev` (or the existing Vite dev script), open a pay run that has been approved (seed data or a run you drive through DRAFT→REVIEWED→APPROVED via the UI), and confirm:
- The Payments panel renders with one row per employee, checkbox column present.
- Hold → dialog requires a reason, on confirm the row's badge flips to `HOLD` and shows the reason.
- Unhold flips it back to `READY`.
- Withdraw requires both a reason and a note; on confirm the row's badge flips to `WITHDRAWN` and its checkbox disappears (no longer checkable).

- [ ] **Step 5: Commit**

```bash
git add src/web/payrun/payments-panel.tsx src/web/payrun/workspace.tsx
git commit -m "feat(workspace): add PaymentsPanel with hold/unhold/withdraw/distribute"
```

---

### Task 4: `ReleasePanel` + `BatchDrawer` + workspace wiring

**Files:**
- Create: `src/web/payrun/release-panel.tsx`
- Create: `src/web/payrun/batch-drawer.tsx`
- Modify: `src/web/payrun/workspace.tsx`

**Interfaces:**
- Consumes: `payrollApi.previewRelease/commitRelease/getBatch/settleAttempt/reconcileAttempt/cancelRelease`; `ReleasePreviewResponse`, `ReleaseMethod`, `GetBatchResponse`, `PaymentAttempt`, `ArtifactRow` from `@/web/api/payroll-api`; `paymentsSelection`/`setPaymentsSelection`/`paymentsRefreshKey`/`setPaymentsRefreshKey` from Task 3's workspace state.
- Produces: `ReleasePanel` props `{ runId, selectedLineIds, onCleared, onReleased }` where `onReleased: (batchId: string) => void`. `BatchDrawer` props `{ runId, batchId, open, onClose, onChanged, artifacts? }` where `artifacts` defaults to `[]` (Task 6 supplies the real list).

- [ ] **Step 1: Create `src/web/payrun/release-panel.tsx`**

```typescript
/**
 * Release panel — appears once >=1 payment line is checked. Preview shows the
 * server's eligible/excluded/byBank breakdown verbatim (the SPA never
 * re-derives why a line was excluded); Commit creates the release batch.
 */

import { useCallback, useState } from "react";
import { MoneyCell } from "@/components/payroll/money-cell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReleaseMethod, ReleasePreviewResponse } from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";

interface ReleasePanelProps {
  readonly runId: string;
  readonly selectedLineIds: readonly string[];
  readonly onCleared: () => void;
  readonly onReleased: (batchId: string) => void;
}

function ReleasePanel({
  runId,
  selectedLineIds,
  onCleared,
  onReleased,
}: ReleasePanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ReleasePreviewResponse | null>(null);
  const [method, setMethod] = useState<ReleaseMethod>("BANK");
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !committing) {
        setOpen(false);
        setPreview(null);
        setError(null);
      }
    },
    [committing]
  );

  const handleCancelDialog = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  const handlePreview = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await payrollApi.previewRelease(runId, selectedLineIds);
      setPreview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [runId, selectedLineIds]);

  const handleMethodChange = useCallback((value: string | null) => {
    if (value === "BANK" || value === "CASH") {
      setMethod(value);
    }
  }, []);

  const handleCommit = useCallback(async () => {
    setCommitting(true);
    setError(null);
    try {
      const res = await payrollApi.commitRelease(
        runId,
        selectedLineIds,
        method
      );
      setOpen(false);
      setPreview(null);
      onCleared();
      onReleased(res.batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Release failed");
    } finally {
      setCommitting(false);
    }
  }, [method, onCleared, onReleased, runId, selectedLineIds]);

  if (selectedLineIds.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
      <span className="text-sm">
        {selectedLineIds.length} line{selectedLineIds.length === 1 ? "" : "s"}{" "}
        selected for release
      </span>
      <div className="flex items-center gap-2">
        <Button onClick={onCleared} size="sm" variant="ghost">
          Clear
        </Button>
        <Button onClick={handlePreview} size="sm">
          Preview release
        </Button>
      </div>

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>Release preview</DialogTitle>
            <DialogDescription>
              Excluded reasons and totals come directly from the server.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="text-muted-foreground text-sm">Evaluating…</p>
          ) : null}

          {!loading && preview !== null ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {preview.eligible.length} eligible ·{" "}
                  {preview.excluded.length} excluded
                </span>
                <MoneyCell sen={preview.totalSen} />
              </div>

              {preview.byBank.length > 0 ? (
                <ul className="rounded-md border text-sm">
                  {preview.byBank.map((b) => (
                    <li
                      className="flex items-center justify-between border-b px-3 py-1.5 last:border-b-0"
                      key={b.bank}
                    >
                      <span>
                        {b.bank} ({b.count})
                      </span>
                      <MoneyCell sen={b.totalSen} />
                    </li>
                  ))}
                </ul>
              ) : null}

              {preview.excluded.length > 0 ? (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs">
                  {preview.excluded.map((e) => (
                    <li key={e.lineId}>
                      <span className="font-mono text-muted-foreground">
                        {e.lineId.slice(0, 8)}
                      </span>{" "}
                      — {e.reason}
                    </li>
                  ))}
                </ul>
              ) : null}

              <Select onValueChange={handleMethodChange} value={method}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK">Bank transfer</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {error === null ? null : (
            <p className="text-destructive text-sm">{error}</p>
          )}

          <DialogFooter>
            <Button
              disabled={committing}
              onClick={handleCancelDialog}
              size="sm"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                committing ||
                loading ||
                preview === null ||
                preview.eligible.length === 0
              }
              onClick={handleCommit}
              size="sm"
            >
              {committing ? "Releasing…" : "Commit release"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type { ReleasePanelProps };
export { ReleasePanel };
```

- [ ] **Step 2: Create `src/web/payrun/batch-drawer.tsx`**

```typescript
/**
 * Batch drawer — one release batch's attempts. Settle records the bank
 * outcome per attempt; Reconcile (PAID attempts only) closes the loop with
 * optional evidence; Cancel (OPEN batches only) returns all lines to READY.
 * Mirrors `PAY_TRANSITIONS`/batch status logic in `src/service/release.ts` —
 * this component never computes a batch or attempt status itself, it only
 * refetches `getBatch` after every mutation.
 */

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { MoneyCell } from "@/components/payroll/money-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  ArtifactRow,
  GetBatchResponse,
  PaymentAttempt,
} from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";

interface BatchDrawerProps {
  readonly runId: string;
  readonly batchId: string | null;
  readonly open: boolean;
  readonly artifacts?: readonly ArtifactRow[];
  readonly onClose: () => void;
  readonly onChanged: () => void;
}

function BatchDrawer({
  runId,
  batchId,
  open,
  artifacts = [],
  onClose,
  onChanged,
}: BatchDrawerProps) {
  const [data, setData] = useState<GetBatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (batchId === null) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await payrollApi.getBatch(runId, batchId);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load batch");
    } finally {
      setLoading(false);
    }
  }, [batchId, runId]);

  useEffect(() => {
    if (open && batchId !== null) {
      load();
    }
  }, [open, batchId, load]);

  const handleChanged = useCallback(async () => {
    await load();
    onChanged();
  }, [load, onChanged]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl" side="right">
        <SheetHeader className="pb-3">
          <SheetTitle>Release batch {batchId ?? ""}</SheetTitle>
        </SheetHeader>

        {error === null ? null : (
          <p className="px-4 text-destructive text-sm">{error}</p>
        )}

        {loading && data === null ? (
          <p className="px-4 text-muted-foreground text-sm">
            Loading batch…
          </p>
        ) : null}

        {data !== null ? (
          <div className="flex flex-col gap-4 px-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{data.batch.method}</Badge>
              <Badge variant="outline">{data.batch.status}</Badge>
              <span className="text-muted-foreground">
                {data.batch.lineCount} line
                {data.batch.lineCount === 1 ? "" : "s"}
              </span>
              <MoneyCell className="ml-auto" sen={data.batch.totalSen} />
            </div>

            <ul className="divide-y rounded-md border">
              {data.attempts.map((attempt) => (
                <AttemptRow
                  artifacts={artifacts}
                  attempt={attempt}
                  key={attempt.id}
                  onChanged={handleChanged}
                  runId={runId}
                />
              ))}
            </ul>

            {data.batch.status === "OPEN" ? (
              <CancelBatchAction
                batchId={data.batch.id}
                onChanged={handleChanged}
                runId={runId}
              />
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

interface AttemptRowProps {
  readonly runId: string;
  readonly attempt: PaymentAttempt;
  readonly artifacts: readonly ArtifactRow[];
  readonly onChanged: () => void;
}

function filenameOf(artifact: ArtifactRow): string {
  return artifact.relativePath.split("/").pop() ?? artifact.relativePath;
}

function AttemptRow({ runId, attempt, artifacts, onChanged }: AttemptRowProps) {
  const [outcome, setOutcome] = useState<"PAID" | "FAILED">("PAID");
  const [ref, setRef] = useState("");
  const [evidenceArtifactId, setEvidenceArtifactId] = useState<string | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOutcomeChange = useCallback((value: string | null) => {
    if (value === "PAID" || value === "FAILED") {
      setOutcome(value);
    }
  }, []);
  const handleRefChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setRef(e.target.value),
    []
  );
  const handleEvidenceChange = useCallback((value: string | null) => {
    setEvidenceArtifactId(value);
  }, []);

  const handleSettle = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await payrollApi.settleAttempt(runId, attempt.id, {
        outcome,
        paymentRef: outcome === "PAID" && ref.trim() !== "" ? ref.trim() : undefined,
        failedReason: outcome === "FAILED" && ref.trim() !== "" ? ref.trim() : undefined,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settle failed");
    } finally {
      setSubmitting(false);
    }
  }, [attempt.id, onChanged, outcome, ref, runId]);

  const handleReconcile = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await payrollApi.reconcileAttempt(
        runId,
        attempt.id,
        evidenceArtifactId ?? undefined
      );
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconcile failed");
    } finally {
      setSubmitting(false);
    }
  }, [attempt.id, evidenceArtifactId, onChanged, runId]);

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-mono text-muted-foreground text-xs">
          {attempt.bankSnapshot.name}
        </span>
        <Badge variant="outline">{attempt.status}</Badge>
        <MoneyCell sen={attempt.amountSen} />
      </div>

      {attempt.status === "PENDING" ? (
        <div className="flex flex-wrap items-end gap-2">
          <Select onValueChange={handleOutcomeChange} value={outcome}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="max-w-40"
            disabled={submitting}
            onChange={handleRefChange}
            placeholder={outcome === "PAID" ? "Payment ref" : "Failure reason"}
            value={ref}
          />
          <Button disabled={submitting} onClick={handleSettle} size="sm">
            {submitting ? "Working…" : "Settle"}
          </Button>
        </div>
      ) : null}

      {attempt.status === "PAID" ? (
        <div className="flex flex-wrap items-end gap-2">
          <Select
            onValueChange={handleEvidenceChange}
            value={evidenceArtifactId ?? undefined}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Evidence (optional)" />
            </SelectTrigger>
            <SelectContent>
              {artifacts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {filenameOf(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={submitting} onClick={handleReconcile} size="sm">
            {submitting ? "Working…" : "Reconcile"}
          </Button>
        </div>
      ) : null}

      {error === null ? null : (
        <p className="text-destructive text-xs">{error}</p>
      )}
    </li>
  );
}

interface CancelBatchActionProps {
  readonly runId: string;
  readonly batchId: string;
  readonly onChanged: () => void;
}

function CancelBatchAction({
  runId,
  batchId,
  onChanged,
}: CancelBatchActionProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReasonChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setReason(e.target.value),
    []
  );

  const handleCancel = useCallback(async () => {
    if (reason.trim() === "") {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await payrollApi.cancelRelease(runId, batchId, reason.trim());
      setReason("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setSubmitting(false);
    }
  }, [batchId, onChanged, reason, runId]);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/30 p-3">
      <span className="text-sm">Cancel this batch</span>
      <div className="flex items-end gap-2">
        <Input
          disabled={submitting}
          onChange={handleReasonChange}
          placeholder="Reason (required)"
          value={reason}
        />
        <Button
          disabled={submitting || reason.trim() === ""}
          onClick={handleCancel}
          size="sm"
          variant="destructive"
        >
          {submitting ? "Working…" : "Cancel batch"}
        </Button>
      </div>
      {error === null ? null : (
        <p className="text-destructive text-xs">{error}</p>
      )}
    </div>
  );
}

export type { BatchDrawerProps };
export { BatchDrawer };
```

- [ ] **Step 3: Wire into `workspace.tsx`**

Add imports:

```typescript
import { BatchDrawer } from "./batch-drawer";
import { ReleasePanel } from "./release-panel";
```

Add state (next to `paymentsRefreshKey`):

```typescript
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchDrawerOpen, setBatchDrawerOpen] = useState(false);
```

Add handlers (near `handleRecompute`):

```typescript
  const handleReleased = useCallback((batchId: string) => {
    setActiveBatchId(batchId);
    setBatchDrawerOpen(true);
  }, []);

  const handleClearSelection = useCallback(() => {
    setPaymentsSelection([]);
  }, []);

  const handleBatchChanged = useCallback(() => {
    setPaymentsRefreshKey((k) => k + 1);
  }, []);

  const handleCloseBatchDrawer = useCallback(() => {
    setBatchDrawerOpen(false);
  }, []);
```

Render `ReleasePanel` right after the `PaymentsPanel` block added in Task 3:

```tsx
        {view.run.status === "APPROVED" ? (
          <ReleasePanel
            onCleared={handleClearSelection}
            onReleased={handleReleased}
            runId={runId}
            selectedLineIds={paymentsSelection}
          />
        ) : null}
```

(Release only makes sense for APPROVED, not CLOSED — a closed run's lines are already RECONCILED/WITHDRAWN and `PaymentsPanel` renders read-only for CLOSED anyway, so `selectedLineIds` will always be empty there.)

Render `BatchDrawer` next to the existing `<GateCheckDialog …/>` at the bottom of the returned JSX:

```tsx
      <BatchDrawer
        batchId={activeBatchId}
        onChanged={handleBatchChanged}
        onClose={handleCloseBatchDrawer}
        open={batchDrawerOpen}
        runId={runId}
      />
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx ultracite check src/web/payrun/release-panel.tsx src/web/payrun/batch-drawer.tsx src/web/payrun/workspace.tsx`
Expected: no errors.

- [ ] **Step 5: Manual smoke check**

On an APPROVED run with at least one READY line and complete bank details on the employment record:
- Check a line's checkbox → the release bar appears above/near the payments table.
- Preview release → dialog shows eligible count, byBank breakdown, totals.
- Commit release (BANK) → dialog closes, batch drawer opens automatically showing one PENDING attempt.
- Settle the attempt as PAID → attempt badge flips to `PAID`, a Reconcile control appears.
- Reconcile (no evidence) → attempt state persists as `PAID` (line moves to RECONCILED once reconciled — confirm the underlying payment row's state via the Payments panel, which should now show `RECONCILED` for that line after the drawer's `onChanged` bumps `paymentsRefreshKey`).

- [ ] **Step 6: Commit**

```bash
git add src/web/payrun/release-panel.tsx src/web/payrun/batch-drawer.tsx src/web/payrun/workspace.tsx
git commit -m "feat(workspace): add ReleasePanel and BatchDrawer for release/settle/reconcile"
```

---

### Task 5: `ClosureChecklistDialog` + `RunHeader` Close button

**Files:**
- Create: `src/web/payrun/closure-checklist-dialog.tsx`
- Modify: `src/web/payrun/run-header.tsx`
- Modify: `src/web/payrun/workspace.tsx`

**Interfaces:**
- Consumes: `payrollApi.getClosureChecklist/closeRun`, `ChecklistItem` from `@/web/api/payroll-api`. Mirrors `GateCheckDialog`'s prop shape exactly (`src/web/payrun/gate-check-dialog.tsx`) — workspace owns the fetch, the dialog is a pure renderer + confirm trigger, for consistency with the existing REVIEW/APPROVAL gate flow.
- Produces: `ClosureChecklistDialog` props `{ open, checklist, loading, submitting, error, onClose, onConfirm }`. `RunHeader` gains `onClose: () => void`, rendered when `avail.canClose`.

- [ ] **Step 1: Create `src/web/payrun/closure-checklist-dialog.tsx`**

```typescript
/**
 * Closure checklist dialog — pure renderer of the server's mechanical
 * `closureChecklist` (`src/service/close.ts`). Confirm is enabled only when
 * every item is `ok`; the dialog never computes its own close eligibility.
 */

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ChecklistItem } from "@/web/api/payroll-api";

interface ClosureChecklistDialogProps {
  readonly open: boolean;
  readonly checklist: readonly ChecklistItem[] | null;
  readonly loading: boolean;
  readonly submitting: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

function descriptionFor(
  loading: boolean,
  checklist: readonly ChecklistItem[] | null
): string {
  if (loading) {
    return "Evaluating closure checklist…";
  }
  if (checklist !== null && checklist.every((c) => c.ok)) {
    return "All checklist items pass. Confirm to close the run.";
  }
  return "One or more checklist items are not satisfied.";
}

function ClosureChecklistDialog({
  open,
  checklist,
  loading,
  submitting,
  error,
  onClose,
  onConfirm,
}: ClosureChecklistDialogProps) {
  const canConfirm = Boolean(
    checklist !== null && checklist.every((c) => c.ok) && !loading && !submitting
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Close run checklist</DialogTitle>
          <DialogDescription>
            {descriptionFor(loading, checklist)}
          </DialogDescription>
        </DialogHeader>

        {checklist !== null ? (
          <ul className="space-y-2 rounded-md border p-3">
            {checklist.map((item) => (
              <li className="flex items-start gap-2 text-sm" key={item.item}>
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-xs",
                    item.ok
                      ? "bg-[var(--status-ok-fill)] text-[var(--status-ok-ink)]"
                      : "bg-[var(--status-bad-fill)] text-[var(--status-bad-ink)]"
                  )}
                >
                  {item.ok ? "OK" : "BLOCKED"}
                </span>
                <div>
                  <p className="font-medium text-foreground">{item.item}</p>
                  <p className="text-muted-foreground text-xs">
                    {item.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {error === null ? null : (
          <p className="text-destructive text-sm">{error}</p>
        )}

        <DialogFooter>
          <Button
            disabled={submitting}
            onClick={onClose}
            size="sm"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={!canConfirm} onClick={onConfirm} size="sm">
            {submitting ? "Closing…" : "Confirm close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { ClosureChecklistDialogProps };
export { ClosureChecklistDialog };
```

- [ ] **Step 2: Add the Close button to `run-header.tsx`**

Change the props interface and render block:

```typescript
interface RunHeaderProps {
  readonly view: PayRunWorkspaceView;
  readonly onRecompute: () => void;
  readonly onReview: () => void;
  readonly onApprove: () => void;
  readonly onClose: () => void;
}

function RunHeader({
  view,
  onRecompute,
  onReview,
  onApprove,
  onClose,
}: RunHeaderProps) {
  const { run, actionAvailability: avail } = view;

  return (
    <div className="flex items-center gap-3 border-b bg-card px-6 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-foreground">
            {run.companyName}
          </span>
          <Badge className="font-mono text-xs" variant="outline">
            {run.reportingMonth}
          </Badge>
          <StatusBadge
            status={isRunStatus(run.status) ? run.status : "DRAFT"}
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {avail.canRecompute ? (
          <Button onClick={onRecompute} size="sm" variant="outline">
            Recompute
          </Button>
        ) : null}
        {avail.canReview ? (
          <Button onClick={onReview} size="sm" variant="outline">
            Review
          </Button>
        ) : null}
        {avail.canApprove ? (
          <Button onClick={onApprove} size="sm">
            Approve
          </Button>
        ) : null}
        {avail.canClose ? (
          <Button onClick={onClose} size="sm">
            Close run
          </Button>
        ) : null}
      </div>
    </div>
  );
}
```

(Only the `onClose` prop, its destructure, and the final `{avail.canClose ? … : null}` block are new.)

- [ ] **Step 3: Wire into `workspace.tsx`**

Add the import:

```typescript
import { ClosureChecklistDialog } from "./closure-checklist-dialog";
```

Add state (near the gate-check state):

```typescript
  const [closureDialogOpen, setClosureDialogOpen] = useState(false);
  const [closureChecklist, setClosureChecklist] = useState<
    readonly ChecklistItem[] | null
  >(null);
  const [closureLoading, setClosureLoading] = useState(false);
  const [closureSubmitting, setClosureSubmitting] = useState(false);
  const [closureError, setClosureError] = useState<string | null>(null);
```

Add `ChecklistItem` to the existing type-only import from `@/web/api/payroll-api`.

Add handlers (near `handleReview`/`handleApprove`):

```typescript
  const closeClosureDialog = useCallback(() => {
    if (closureSubmitting) {
      return;
    }
    setClosureDialogOpen(false);
    setClosureChecklist(null);
    setClosureError(null);
  }, [closureSubmitting]);

  const handleClose = useCallback(async () => {
    if (runId === undefined) {
      return;
    }
    setClosureDialogOpen(true);
    setClosureChecklist(null);
    setClosureError(null);
    setClosureLoading(true);
    try {
      const res = await payrollApi.getClosureChecklist(runId);
      setClosureChecklist(res.checklist);
    } catch (err) {
      setClosureError(
        err instanceof Error ? err.message : "Checklist evaluation failed"
      );
    } finally {
      setClosureLoading(false);
    }
  }, [runId]);

  const handleClosureConfirm = useCallback(async () => {
    if (runId === undefined || closureChecklist === null) {
      return;
    }
    setClosureSubmitting(true);
    setClosureError(null);
    try {
      await payrollApi.closeRun(runId);
      setClosureDialogOpen(false);
      setClosureChecklist(null);
      await reload();
    } catch (err) {
      setClosureError(err instanceof Error ? err.message : "Close failed");
    } finally {
      setClosureSubmitting(false);
    }
  }, [closureChecklist, reload, runId]);
```

Pass `onClose={handleClose}` to `<RunHeader …/>`:

```tsx
      <RunHeader
        onApprove={handleApprove}
        onClose={handleClose}
        onRecompute={handleRecompute}
        onReview={handleReview}
        view={view}
      />
```

Render the dialog next to `<GateCheckDialog …/>`:

```tsx
      <ClosureChecklistDialog
        checklist={closureChecklist}
        error={closureError}
        loading={closureLoading}
        onClose={closeClosureDialog}
        onConfirm={handleClosureConfirm}
        open={closureDialogOpen}
        submitting={closureSubmitting}
      />
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx ultracite check src/web/payrun/closure-checklist-dialog.tsx src/web/payrun/run-header.tsx src/web/payrun/workspace.tsx`
Expected: no errors.

- [ ] **Step 5: Manual smoke check**

On an APPROVED run where every line has already been withdrawn or fully released/settled/reconciled/distributed (use the flow from Task 4's smoke check, then record a distribution for the RECONCILED line via `PaymentsPanel`):
- Close run button appears (only when `canClose`, i.e., status APPROVED).
- Clicking it opens the checklist dialog; once all 5 items show `OK`, Confirm close is enabled.
- Confirm close → run status flips to CLOSED, workspace reloads, Close button and Payments panel action buttons disappear (read-only).
- On a run where the checklist is not fully satisfied (e.g., a PENDING attempt still open), confirm the dialog shows `BLOCKED` items with the server's own `detail` text and Confirm stays disabled.

- [ ] **Step 6: Commit**

```bash
git add src/web/payrun/closure-checklist-dialog.tsx src/web/payrun/run-header.tsx src/web/payrun/workspace.tsx
git commit -m "feat(workspace): add closure checklist dialog and Close run action"
```

---

### Task 6: `ArtifactsPanel` + workspace artifact state

**Files:**
- Create: `src/web/payrun/artifacts-panel.tsx`
- Modify: `src/web/payrun/workspace.tsx`

**Interfaces:**
- Consumes: `payrollApi.getArtifacts/uploadArtifact/getArtifactUrl`, `ArtifactRow`, `ArtifactType` from `@/web/api/payroll-api`; the existing `UploadDropZone` (`@/components/ui/upload-drop-zone`).
- Produces: `ArtifactsPanel` props `{ runId, artifacts, loading, error, onUploaded }`. Workspace lifts the artifacts list into its own state (`artifacts`, `loadArtifacts`) so `BatchDrawer` (Task 4) can receive the same list for its reconcile-evidence picker — this is why the list is not fetched inside `ArtifactsPanel` itself, unlike `PaymentsPanel`.

- [ ] **Step 1: Create `src/web/payrun/artifacts-panel.tsx`**

```typescript
/**
 * Artifacts panel — lists R2-backed run artifacts (register CSV, manifest,
 * manual evidence) and lets a user manually attach evidence. Type is
 * restricted to EVIDENCE/EXCEPTION_REPORT for manual uploads — the other
 * ArtifactType values (PAYMENT_REGISTER, MANIFEST, CASH_SHEET) are only ever
 * produced by the server (release/close), never hand-picked here.
 */

import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UploadDropZone } from "@/components/ui/upload-drop-zone";
import type { ArtifactRow, ArtifactType } from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";

interface ArtifactsPanelProps {
  readonly runId: string;
  readonly artifacts: readonly ArtifactRow[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onUploaded: () => void;
}

const MANUAL_TYPES: readonly {
  readonly value: ArtifactType;
  readonly label: string;
}[] = [
  { value: "EVIDENCE", label: "Evidence" },
  { value: "EXCEPTION_REPORT", label: "Exception report" },
];

function filenameOf(artifact: ArtifactRow): string {
  return artifact.relativePath.split("/").pop() ?? artifact.relativePath;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

function ArtifactsPanel({
  runId,
  artifacts,
  loading,
  error,
  onUploaded,
}: ArtifactsPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<ArtifactType>("EVIDENCE");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const handleTypeChange = useCallback((value: string | null) => {
    if (value === "EVIDENCE" || value === "EXCEPTION_REPORT") {
      setType(value);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (file === null) {
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const base64 = await readAsBase64(file);
      await payrollApi.uploadArtifact(runId, {
        filename: file.name,
        mimeType: file.type === "" ? "application/octet-stream" : file.type,
        base64,
        type,
      });
      setFile(null);
      onUploaded();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [file, onUploaded, runId, type]);

  const handleGetLink = useCallback(
    async (artifactId: string) => {
      setLinkError(null);
      try {
        const res = await payrollApi.getArtifactUrl(runId, artifactId);
        window.open(res.url, "_blank", "noopener,noreferrer");
      } catch (err) {
        setLinkError(err instanceof Error ? err.message : "Link failed");
      }
    },
    [runId]
  );

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2">
        <span className="font-medium text-sm">Artifacts</span>
      </div>

      {error === null ? null : (
        <p className="px-3 py-2 text-destructive text-sm">{error}</p>
      )}
      {linkError === null ? null : (
        <p className="px-3 py-2 text-destructive text-sm">{linkError}</p>
      )}

      {loading && artifacts.length === 0 ? (
        <p className="px-3 py-4 text-muted-foreground text-sm">
          Loading artifacts…
        </p>
      ) : null}

      {!loading && artifacts.length === 0 ? (
        <p className="px-3 py-4 text-muted-foreground text-sm">
          No artifacts yet.
        </p>
      ) : null}

      {artifacts.length > 0 ? (
        <ul className="divide-y">
          {artifacts.map((artifact) => (
            <ArtifactRowView
              artifact={artifact}
              key={artifact.id}
              onGetLink={handleGetLink}
            />
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2 border-t p-3">
        <span className="font-medium text-sm">Attach evidence</span>
        <Select onValueChange={handleTypeChange} value={type}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MANUAL_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <UploadDropZone file={file} onChange={setFile} />
        {uploadError === null ? null : (
          <p className="text-destructive text-xs">{uploadError}</p>
        )}
        <Button
          disabled={file === null || uploading}
          onClick={handleUpload}
          size="sm"
        >
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </div>
  );
}

interface ArtifactRowViewProps {
  readonly artifact: ArtifactRow;
  readonly onGetLink: (artifactId: string) => void;
}

function ArtifactRowView({ artifact, onGetLink }: ArtifactRowViewProps) {
  const handleClick = useCallback(
    () => onGetLink(artifact.id),
    [artifact.id, onGetLink]
  );

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="outline">{artifact.type}</Badge>
        <span className="truncate">{filenameOf(artifact)}</span>
        <span className="shrink-0 text-muted-foreground text-xs">
          {formatBytes(artifact.byteSize)}
        </span>
      </div>
      <Button onClick={handleClick} size="sm" variant="ghost">
        Get link
      </Button>
    </li>
  );
}

export type { ArtifactsPanelProps };
export { ArtifactsPanel };
```

- [ ] **Step 2: Lift artifacts state into `workspace.tsx`**

Add the import:

```typescript
import { ArtifactsPanel } from "./artifacts-panel";
```

Add `ArtifactRow` to the existing type-only import from `@/web/api/payroll-api`.

Add state (near `paymentsRefreshKey`):

```typescript
  const [artifacts, setArtifacts] = useState<readonly ArtifactRow[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);
```

Add a loader (near `reload`):

```typescript
  const loadArtifacts = useCallback(async () => {
    if (runId === undefined) {
      return;
    }
    setArtifactsLoading(true);
    setArtifactsError(null);
    try {
      const res = await payrollApi.getArtifacts(runId);
      setArtifacts(res.artifacts);
    } catch (err) {
      setArtifactsError(
        err instanceof Error ? err.message : "Failed to load artifacts"
      );
    } finally {
      setArtifactsLoading(false);
    }
  }, [runId]);
```

Trigger it once the run reaches APPROVED/CLOSED, alongside the existing `reload` effect:

```typescript
  useEffect(() => {
    if (view !== null && (view.run.status === "APPROVED" || view.run.status === "CLOSED")) {
      loadArtifacts();
    }
  }, [view, loadArtifacts]);
```

Render `ArtifactsPanel` after the `PaymentsPanel`/`ReleasePanel` block:

```tsx
        {view.run.status === "APPROVED" || view.run.status === "CLOSED" ? (
          <ArtifactsPanel
            artifacts={artifacts}
            error={artifactsError}
            loading={artifactsLoading}
            onUploaded={loadArtifacts}
            runId={runId}
          />
        ) : null}
```

Pass the same list into `BatchDrawer` (added in Task 4):

```tsx
      <BatchDrawer
        artifacts={artifacts}
        batchId={activeBatchId}
        onChanged={handleBatchChanged}
        onClose={handleCloseBatchDrawer}
        open={batchDrawerOpen}
        runId={runId}
      />
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx ultracite check src/web/payrun/artifacts-panel.tsx src/web/payrun/workspace.tsx`
Expected: no errors.

- [ ] **Step 4: Manual smoke check**

On an APPROVED run that has already committed a release (from Task 4's smoke check):
- Artifacts panel shows at least one `PAYMENT_REGISTER` row (the release register CSV) — "Get link" opens a signed URL in a new tab.
- Upload a small text file as `EVIDENCE` → it appears in the list after upload completes.
- Open the batch drawer, settle an attempt as PAID, and confirm the Reconcile evidence dropdown now lists the uploaded artifact by filename.

- [ ] **Step 5: Commit**

```bash
git add src/web/payrun/artifacts-panel.tsx src/web/payrun/workspace.tsx
git commit -m "feat(workspace): add ArtifactsPanel and wire artifact list into BatchDrawer"
```

---

### Task 7: EmployeeGrid `paymentState` column + Control page RELEASE gate

**Files:**
- Modify: `src/web/payrun/employee-grid.tsx`
- Modify: `src/web/payrun/workspace.tsx`
- Modify: `src/web/control/control-page.tsx`

**Interfaces:**
- Consumes: `LinePaymentState`, `payrollApi.getPayments` from `@/web/api/payroll-api`.
- Produces: `EmployeeGrid` gains an optional `paymentStateByEmployeeId?: ReadonlyMap<string, LinePaymentState>` prop; when provided, a "Payment" column renders. `ControlPage`'s `gateForStatus` now returns `"RELEASE"` for `APPROVED` runs.

- [ ] **Step 1: Add the optional column to `employee-grid.tsx`**

Add to the type-only import from `@/web/api/payroll-api`:

```typescript
import type { EmployeeLineDto, LinePaymentState } from "@/web/api/payroll-api";
```

Add the prop to `EmployeeGridProps` and thread it through to `EmployeeRow`:

```typescript
interface EmployeeGridProps {
  readonly lines: readonly EmployeeLineDto[];
  readonly onSelectEmployee: (employeeId: string) => void;
  readonly onEditLine?: (employeeId: string) => void;
  readonly onViewDerivation?: (employeeId: string) => void;
  readonly onViewFindings?: (employeeId: string) => void;
  readonly paymentStateByEmployeeId?: ReadonlyMap<string, LinePaymentState>;
}
```

In `EmployeeGrid`, destructure it and pass it to the header/body:

```typescript
function EmployeeGrid({
  lines,
  onSelectEmployee,
  onEditLine,
  onViewDerivation,
  onViewFindings,
  paymentStateByEmployeeId,
}: EmployeeGridProps) {
  const [page, setPage] = useState(0);
  const showPaymentColumn = paymentStateByEmployeeId !== undefined;

  const totalPages = Math.max(1, Math.ceil(lines.length / PAGE_SIZE));
  const pageLines = lines.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
```

Add the header cell — insert right before the existing `<TableHead className="w-10 bg-muted" rowSpan={2} />` (the actions-column placeholder):

```tsx
              {showPaymentColumn ? (
                <TableHead className="bg-muted text-center" rowSpan={2}>
                  Payment
                </TableHead>
              ) : null}
              <TableHead className="w-10 bg-muted" rowSpan={2} />
```

Pass `paymentStateByEmployeeId` down to each `EmployeeRow`:

```tsx
            {pageLines.map((line) => (
              <EmployeeRow
                key={line.employeeId}
                line={line}
                onEditLine={onEditLine}
                onSelectEmployee={onSelectEmployee}
                onViewDerivation={onViewDerivation}
                onViewFindings={onViewFindings}
                paymentState={paymentStateByEmployeeId?.get(line.employeeId)}
              />
            ))}
```

Add the prop to `EmployeeRowProps` and render the cell in `EmployeeRow` — insert right before the existing `<TableCell onClick={stopPropagation}>` (the row-actions cell):

```typescript
interface EmployeeRowProps {
  readonly line: EmployeeLineDto;
  readonly onSelectEmployee: (employeeId: string) => void;
  readonly onEditLine?: (employeeId: string) => void;
  readonly onViewDerivation?: (employeeId: string) => void;
  readonly onViewFindings?: (employeeId: string) => void;
  readonly paymentState?: LinePaymentState;
}
```

```typescript
function EmployeeRow({
  line,
  onSelectEmployee,
  onEditLine,
  onViewDerivation,
  onViewFindings,
  paymentState,
}: EmployeeRowProps) {
```

```tsx
      {paymentState === undefined ? null : (
        <TableCell className="text-center">
          <Badge className="border-border bg-muted text-muted-foreground text-xs">
            {paymentState}
          </Badge>
        </TableCell>
      )}
      <TableCell onClick={stopPropagation}>
```

- [ ] **Step 2: Fetch payments for the grid in `workspace.tsx`**

This is a second, small fetch dedicated to the grid badge (the grid only needs `{employmentId, state}`, not the full `PaymentsPanel` UI state) — it keeps `PaymentsPanel` self-contained (Task 3's design) rather than threading its internal list through the whole tree.

Add state (near `paymentsRefreshKey`):

```typescript
  const [paymentStateByEmployeeId, setPaymentStateByEmployeeId] = useState<
    ReadonlyMap<string, LinePaymentState> | undefined
  >(undefined);
```

Add `LinePaymentState` to the existing type-only import from `@/web/api/payroll-api`.

Add an effect (near the `loadArtifacts` effect from Task 6):

```typescript
  useEffect(() => {
    if (
      runId === undefined ||
      view === null ||
      !(view.run.status === "APPROVED" || view.run.status === "CLOSED")
    ) {
      return;
    }
    payrollApi.getPayments(runId).then((res) => {
      const map = new Map<string, LinePaymentState>();
      for (const row of res.payments) {
        map.set(row.employmentId, row.state);
      }
      setPaymentStateByEmployeeId(map);
    });
  }, [runId, view, paymentsRefreshKey]);
```

Pass it to `EmployeeGrid`:

```tsx
        <EmployeeGrid
          lines={view.lines}
          onEditLine={handleEditLine}
          onSelectEmployee={handleSelectEmployee}
          onViewDerivation={handleViewDerivation}
          onViewFindings={handleViewDerivation}
          paymentStateByEmployeeId={paymentStateByEmployeeId}
        />
```

- [ ] **Step 3: Extend `gateForStatus` in `control-page.tsx`**

```typescript
function gateForStatus(status: string): GateKind | null {
  if (status === "DRAFT") {
    return "REVIEW";
  }
  if (status === "REVIEWED") {
    return "APPROVAL";
  }
  if (status === "APPROVED") {
    return "RELEASE";
  }
  return null;
}
```

No other change is needed in `control-page.tsx` or `run-control-card.tsx`: `RunControlCard`'s `mutable` flag (`run.status === "DRAFT" || run.status === "REVIEWED"`) intentionally stays false for APPROVED, so the Scan button still only shows for pre-approval runs — the RELEASE gate on an APPROVED card is informational (surfacing whether release is currently blocked), not an action trigger. `actionLabel` already falls through to `"Open workspace"` for APPROVED, which remains correct since release/close actions live inside the workspace, not on the card.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx ultracite check src/web/payrun/employee-grid.tsx src/web/payrun/workspace.tsx src/web/control/control-page.tsx`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: all existing tests plus the ones added in Tasks 1–2 pass, no regressions.

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 6: Manual smoke check**

- On an APPROVED run with at least one HOLD or RECONCILED line (from earlier tasks' smoke checks), open the workspace and confirm the Employee grid shows a "Payment" column with the matching badge per row.
- Open the Control screen while that run is APPROVED and confirm its card shows a `Gate RELEASE` pill reflecting whether release is currently blocked (e.g., BLOCKED if a line still lacks bank details).

- [ ] **Step 7: Commit**

```bash
git add src/web/payrun/employee-grid.tsx src/web/payrun/workspace.tsx src/web/control/control-page.tsx
git commit -m "feat(workspace): add payment-state grid column and RELEASE gate on Control"
```

---

## Self-Review

**Spec coverage.** Every "In" bullet from [the design's §1 Scope](../specs/2026-08-08-phase7-control-spa-design.md#1-scope) maps to a task: Payments panel → Task 3; Release preview/commit → Task 4 (`ReleasePanel`); Batch drawer (settle/reconcile/cancel) → Task 4 (`BatchDrawer`); Distribution recording → Task 3 (`DistributeDialog`); Closure checklist dialog → Task 5; Artifacts panel → Task 6; Run header Close button → Task 5; Employee grid payment column → Task 7; Control page RELEASE pill → Task 7. The design's "Out" list (payslip PDF, bank-file formatter, new server routes/domain rules, client-side transition logic, optimistic UI) has no corresponding task, confirming nothing in scope was skipped and nothing out of scope crept in — except the one explicitly-justified exception (Task 2's `employmentId` column), which the design doc's own Global Constraints section anticipates was not accounted for at spec time and is called out by name in this plan's own Global Constraints.

**Placeholder scan.** No "TBD"/"implement later"/"add validation" instructions appear anywhere above — every step has literal, complete code, including the three dialog sub-components inside `payments-panel.tsx`, both sub-components inside `batch-drawer.tsx`, and both new HTTP test files. Every "Run:" step has an exact command and expected result.

**Type consistency.** `LinePaymentState`, `WithdrawalReason`, `DistributionChannel`, `ReleaseMethod`, `ChecklistItem`, `ArtifactRow`/`ArtifactType`, `GetBatchResponse`/`PaymentAttempt`/`ReleaseBatch` are all defined once in Task 1's `types.ts` addition and referenced by the exact same names in every later task — no task introduces a competing name (e.g., `PayLineStatus` vs `LinePaymentState`) or a differently-shaped DTO. `PaymentsPanelProps`, `ReleasePanelProps`, `BatchDrawerProps`, `ClosureChecklistDialogProps`, `ArtifactsPanelProps` are each defined once (in the task that creates the file) and consumed with matching field names in `workspace.tsx`'s wiring steps. `paymentsSelection`/`setPaymentsSelection` (Task 3) is consumed unchanged by `ReleasePanel` (Task 4); `paymentsRefreshKey`/`setPaymentsRefreshKey` (Task 3, comment added noting it is bumped later) is bumped by `BatchDrawer.onChanged` (Task 4) and read by `PaymentsPanel` (Task 3) and the grid's payment-state effect (Task 7) — the same state, never duplicated.

---

## Execution Choice

Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Given Tasks 3–7 each touch `workspace.tsx` incrementally (additive, non-overlapping regions), sequential dispatch (not parallel) is required — each task's wiring step assumes the previous task's state/imports already exist in the file.

**2. Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints for review.
