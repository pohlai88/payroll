# Phase 8B — Run-Diff UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a run-level "Compare" panel in the workspace header and an employee-level graph diff tab in the slide-over, both powered by the existing `diffGraphs()` domain function and a new `GET /v1/pay-runs/:runId/lines/:lineId/diff` server route.

**Architecture:** The run-level compare panel uses `previousRoots`/`variance` already in the workspace DTO (no new fetch). The employee-level diff tab calls a new Hono read-facade that loads `payLines.trace` JSONB for the current and prior employee lines, runs `diffGraphs()`, and returns `NodeDiffRow[]`. Prior lines are matched by `employmentId` — never by name or code.

**Tech Stack:** Hono (server route), Drizzle ORM, `diffGraphs` + `renderLabel` from `src/domain/derive/`, React + TypeScript (SPA components), `DeltaBadge` from `src/components/payroll/delta-badge.tsx`

## Codebase state entering Phase 8B (Phase 8A already delivered)

- `employee-slide-over.tsx` already has `runId: string` prop and `lineId` on `EmployeeLineDto` — **do not re-add these**.
- `src/web/api/payroll-api.ts` uses `getPayrollApi().method()` pattern — **not** a standalone `apiGet()`. Follow the same pattern as `fetchPayslip` / `fetchPayslipIndex` (lines 158–169): add a method to `PayrollApi`, register it in `createApiClient`, and export a standalone `fetchXxx` wrapper.
- Phase 8A delivered: `pay-run-payslip.ts` server route, `payslip-document/` component tree (14 files), `payslip-page.tsx`, `PayslipDocumentDto`, `PayslipIndexRow`, `doc.payslip.*` i18n keys.
- Tests must pass: `npm test` should stay green throughout. Current baseline: 905/905.

## Global Constraints

- Prior employee lines matched exclusively by `employmentId` (immutable FK on `payLines`).
- Derivation graph stored in `payLines.trace` JSONB — not `derivation` (verify with schema).
- `priorRunId` comes from `payRuns.linkedRunId` — null if no linked run.
- Run-diff panel only rendered when `view.lines.some(l => l.previousRoots !== null)`.
- Employee diff tab only rendered when `line.previousRoots !== null`.
- Server renders labels in EN only — `renderLabel(node.label, "en")` — bilingual diff is future.
- No client-side payroll calculation; diff is pure graph comparison of stored facts.
- Spec: `docs/superpowers/specs/2026-08-09-phase8-reports-payslip-diff-design.md` §4

---

### Task 1: Diff server route

**Files:**
- Create: `src/server/routes/pay-run-diff.ts`
- Modify: `src/server/app.ts`
- Test: `tests/db/pay-run-diff.test.ts`

**Interfaces:**
- Consumes: `requirePayRunAccess`, `Database`, `payLines`/`payRuns` from schema, `diffGraphs` from `@/domain/derive/diff`, `renderLabel` from `@/domain/derive/i18n/render`, `DerivationGraph` from `@/domain/derive/graph`
- Produces:
  ```typescript
  // GET /v1/pay-runs/:runId/lines/:lineId/diff → RunLineDiffDto
  interface RunLineDiffDto {
    runId: string;
    lineId: string;
    employmentId: string;
    priorRunId: string | null;
    diffs: NodeDiffRow[];
  }
  interface NodeDiffRow {
    d: "ADDED" | "REMOVED" | "VALUE" | "STRUCTURE" | "CITATION";
    id: string;
    label: string;
    fromValue: string | null;
    toValue: string | null;
    deltaSen: number | null;
    addedRefs: string[];
    removedRefs: string[];
  }
  ```

- [ ] **Step 1: Write failing tests**

```typescript
// tests/db/pay-run-diff.test.ts
import { sql } from "drizzle-orm";
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

const COMPANY_ID = "bbbbbbbb-0002-4000-8000-000000000001";
const PERSON_ID  = "bbbbbbbb-0002-4000-8000-000000000002";
const EMP_ID     = "bbbbbbbb-0002-4000-8000-000000000003";
const RUN_A      = "DIFF-TEST-2026-06";
const RUN_B      = "DIFF-TEST-2026-07";
const ADMIN_EMAIL = "diff-admin@example.com";
let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);
  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'DIFFCORP', 'Diff Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'DIFF WORKER', '900101-10-6666', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES (${EMP_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'D001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false)`);
});

beforeEach(async () => {
  await db.delete(userRoleAssignments);
  await db.delete(users);
  await db.delete(roles).where(sql`is_system = false`);
  await database.truncate("audit_events", "pay_runs");
});

afterAll(async () => { await database.close(); });

function claims(partial: { sub: string; email: string }): NeonAuthClaims {
  return { sub: partial.sub, email: partial.email, emailVerified: undefined, name: undefined, banned: false };
}
function verifier(map: Record<string, NeonAuthClaims>): VerifyJwt {
  return (token) => {
    const c = map[token];
    if (!c) return Promise.reject(new AuthError("UNAUTHORIZED", "unknown test token"));
    return Promise.resolve(c);
  };
}
async function makeAdmin(email: string) {
  const user = await createUser(db, { email, name: "Diff Admin" });
  const role = await getRoleByCode(db, SYSTEM_ADMIN_ROLE_CODE);
  if (!role) throw new Error("SYSTEM_ADMIN missing");
  await assignUserToRole(db, { userId: user.id, roleId: role.id, companyId: null });
}
function adminApp() {
  return createApp({ db, verifyJwt: verifier({ admin: claims({ sub: "neon-diff-admin", email: ADMIN_EMAIL }) }) });
}

async function insertRuns() {
  await makeAdmin(ADMIN_EMAIL);
  const snap = JSON.stringify({ id: "D001", name: "DIFF WORKER" });
  // Run A (prior)
  await db.execute(sql`
    INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end, working_days, rule_pack_id, status)
    VALUES (${RUN_A}, ${COMPANY_ID}, 2026, 6, '2026-06-01', '2026-06-30', 26, ${rulePackId}, 'APPROVED')`);
  await db.execute(sql`
    INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days, period_end, gross_sen, net_sen,
      deductions_total_sen, epf_wages_sen, socso_wages_sen, eis_wages_sen,
      epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
      eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen, hrdf_sen, employer_cost_sen,
      trace)
    VALUES (gen_random_uuid(), ${RUN_A}, ${EMP_ID}, ${snap}::jsonb, 26, '2026-06-30',
            400000, 344000, 56000, 400000, 400000, 400000,
            44000, 52000, 3800, 0, 7500, 1400, 1400, 4000, 0, 0, 0, 0, 52000,
            '{"nodes":{},"order":[]}'::jsonb)
    RETURNING id`);

  // Run B (current, linked to A)
  await db.execute(sql`
    INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end, working_days, rule_pack_id, status, linked_run_id)
    VALUES (${RUN_B}, ${COMPANY_ID}, 2026, 7, '2026-07-01', '2026-07-31', 26, ${rulePackId}, 'APPROVED', ${RUN_A})`);
  const lineResult = await db.execute(sql`
    INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days, period_end, gross_sen, net_sen,
      deductions_total_sen, epf_wages_sen, socso_wages_sen, eis_wages_sen,
      epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
      eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen, hrdf_sen, employer_cost_sen,
      trace)
    VALUES (gen_random_uuid(), ${RUN_B}, ${EMP_ID}, ${snap}::jsonb, 26, '2026-07-31',
            500000, 433500, 66500, 500000, 500000, 500000,
            55000, 65000, 4750, 0, 9375, 1750, 1750, 5000, 0, 0, 0, 0, 65000,
            '{"nodes":{},"order":[]}'::jsonb)
    RETURNING id`);
  return (lineResult.rows[0] as { id: string }).id;
}

describe("GET /v1/pay-runs/:runId/lines/:lineId/diff", () => {
  it("returns 401 without token", async () => {
    const lineId = await insertRuns();
    const app = adminApp();
    const res = await app.request(`/v1/pay-runs/${RUN_B}/lines/${lineId}/diff`);
    expect(res.status).toBe(401);
  });

  it("returns RunLineDiffDto with priorRunId when linkedRunId exists", async () => {
    const lineId = await insertRuns();
    const app = adminApp();
    const res = await app.request(`/v1/pay-runs/${RUN_B}/lines/${lineId}/diff`, {
      headers: { "Authorization": "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.runId).toBe(RUN_B);
    expect(body.lineId).toBe(lineId);
    expect(body.priorRunId).toBe(RUN_A);
    expect(body.employmentId).toBe(EMP_ID);
    expect(Array.isArray(body.diffs)).toBe(true);
  });

  it("returns priorRunId null when no linkedRunId", async () => {
    await makeAdmin(ADMIN_EMAIL);
    const snap = JSON.stringify({ id: "D001", name: "DIFF WORKER" });
    const STANDALONE = "DIFF-STANDALONE-2026-08";
    await db.execute(sql`
      INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end, working_days, rule_pack_id, status)
      VALUES (${STANDALONE}, ${COMPANY_ID}, 2026, 8, '2026-08-01', '2026-08-31', 26, ${rulePackId}, 'APPROVED')`);
    const r = await db.execute(sql`
      INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days, period_end,
        gross_sen, net_sen, deductions_total_sen, epf_wages_sen, socso_wages_sen, eis_wages_sen,
        epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
        eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen, hrdf_sen, employer_cost_sen)
      VALUES (gen_random_uuid(), ${STANDALONE}, ${EMP_ID}, ${snap}::jsonb, 26, '2026-08-31',
              500000, 433500, 66500, 500000, 500000, 500000,
              55000, 65000, 4750, 0, 9375, 1750, 1750, 5000, 0, 0, 0, 0, 65000)
      RETURNING id`);
    const app = adminApp();
    const lId = (r.rows[0] as { id: string }).id;
    const res = await app.request(`/v1/pay-runs/${STANDALONE}/lines/${lId}/diff`, {
      headers: { "Authorization": "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.priorRunId).toBeNull();
    expect(body.diffs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/db/pay-run-diff.test.ts
```
Expected: All fail — `pay-run-diff.ts` does not exist.

- [ ] **Step 3: Create `src/server/routes/pay-run-diff.ts`**

```typescript
/**
 * Phase 8 — graph-level run diff read facade.
 * GET /v1/pay-runs/:runId/lines/:lineId/diff
 */
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "@/db/client";
import { payLines, payRuns } from "@/db/schema/run";
import type { DerivationGraph } from "@/domain/derive/graph";
import type { NodeDiff } from "@/domain/derive/diff";
import { diffGraphs } from "@/domain/derive/diff";
import { renderLabel } from "@/domain/derive/i18n/render";
import type { NodeValue } from "@/domain/derive/value";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";
import { requirePayRunAccess } from "./pay-run-access";

function formatValue(v: NodeValue): string {
  switch (v.t) {
    case "SEN":   return v.sen === null ? "\u2014" : `RM ${(v.sen / 100).toFixed(2)}`;
    case "INT":   return String(v.n);
    case "NUM":   return v.n.toFixed(2);
    case "TEXT":  return v.text;
    case "ROW":   return `row(${v.row?.fromSen ?? "?"}–${v.row?.toSen ?? "?"})`;
    case "BOOL":  return String(v.b);
    case "NULL":  return "\u2014";
    default:      return JSON.stringify(v);
  }
}

function mapDiff(diff: NodeDiff, graph: DerivationGraph): {
  d: string; id: string; label: string;
  fromValue: string | null; toValue: string | null; deltaSen: number | null;
  addedRefs: string[]; removedRefs: string[];
} {
  const node = graph.nodes[diff.id];
  const labelStr = node?.label ? renderLabel(node.label, "en") : diff.id;

  switch (diff.d) {
    case "VALUE":
      return {
        d: "VALUE", id: diff.id, label: labelStr,
        fromValue: formatValue(diff.from), toValue: formatValue(diff.to),
        deltaSen: diff.deltaSen ?? null,
        addedRefs: [], removedRefs: [],
      };
    case "ADDED":
      return {
        d: "ADDED", id: diff.id, label: labelStr,
        fromValue: null, toValue: formatValue(diff.to.value),
        deltaSen: null, addedRefs: [], removedRefs: [],
      };
    case "REMOVED":
      return {
        d: "REMOVED", id: diff.id, label: labelStr,
        fromValue: formatValue(diff.from.value), toValue: null,
        deltaSen: null, addedRefs: [], removedRefs: [],
      };
    case "STRUCTURE":
      return {
        d: "STRUCTURE", id: diff.id, label: labelStr,
        fromValue: null, toValue: null, deltaSen: null,
        addedRefs:   diff.added.map((r)   => `${r.nodeId}:${r.role}`),
        removedRefs: diff.removed.map((r) => `${r.nodeId}:${r.role}`),
      };
    case "CITATION":
      return {
        d: "CITATION", id: diff.id, label: labelStr,
        fromValue: JSON.stringify(diff.from),
        toValue:   JSON.stringify(diff.to),
        deltaSen: null, addedRefs: [], removedRefs: [],
      };
  }
}

const EMPTY_GRAPH: DerivationGraph = { nodes: {}, order: [] };

function parseTrace(raw: unknown): DerivationGraph {
  if (!raw || typeof raw !== "object") return EMPTY_GRAPH;
  const g = raw as Partial<DerivationGraph>;
  return { nodes: g.nodes ?? {}, order: g.order ?? [] };
}

export function payRunDiffRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/pay-runs/:runId/lines/:lineId/diff", async (c) => {
    try {
      const runId  = c.req.param("runId");
      const lineId = c.req.param("lineId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);

      // Load current run + line
      const [run] = await db.select({ id: payRuns.id, linkedRunId: payRuns.linkedRunId })
        .from(payRuns).where(eq(payRuns.id, runId)).limit(1);
      if (!run) return c.json({ code: "NOT_FOUND", message: `no such run: ${runId}` }, 404);

      const [line] = await db.select({ id: payLines.id, employmentId: payLines.employmentId, trace: payLines.trace })
        .from(payLines)
        .where(and(eq(payLines.id, lineId), eq(payLines.runId, runId)))
        .limit(1);
      if (!line) return c.json({ code: "NOT_FOUND", message: `no such line: ${lineId}` }, 404);

      const currentGraph = parseTrace(line.trace);
      const priorRunId   = run.linkedRunId ?? null;

      if (!priorRunId) {
        return c.json({ runId, lineId, employmentId: line.employmentId, priorRunId: null, diffs: [] });
      }

      // Find same employee's line on prior run by employmentId
      const [priorLine] = await db
        .select({ trace: payLines.trace })
        .from(payLines)
        .where(and(eq(payLines.runId, priorRunId), eq(payLines.employmentId, line.employmentId)))
        .limit(1);

      if (!priorLine) {
        return c.json({ runId, lineId, employmentId: line.employmentId, priorRunId, diffs: [] });
      }

      const priorGraph = parseTrace(priorLine.trace);
      const rawDiffs   = diffGraphs(priorGraph, currentGraph);
      const diffs      = rawDiffs.map((d) => mapDiff(d, currentGraph));

      return c.json({ runId, lineId, employmentId: line.employmentId, priorRunId, diffs });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
```

- [ ] **Step 4: Mount route in `src/server/app.ts`**

Add import:
```typescript
import { payRunDiffRoutes } from "./routes/pay-run-diff";
```
Add inside the `v1.route(...)` block:
```typescript
v1.route("/", payRunDiffRoutes(deps.db));
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/db/pay-run-diff.test.ts
```
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/pay-run-diff.ts src/server/app.ts tests/db/pay-run-diff.test.ts
git commit -m "feat(phase8): run-diff server route"
```

---

### Task 2: Run-level diff panel (workspace)

**Files:**
- Create: `src/web/payrun/run-diff-panel.tsx`
- Modify: `src/web/payrun/run-header.tsx`

**Interfaces:**
- Consumes: `PayRunWorkspaceView` from `@/web/api/payroll-api`, `DeltaBadge` from `@/components/payroll/delta-badge`, `EmployeeLineDto` from existing types
- Produces: `<RunDiffPanel lines={...} />` collapsible panel; `onCompare`/`showCompare` props on `RunHeader`

- [ ] **Step 1: Create `src/web/payrun/run-diff-panel.tsx`**

Read `src/web/payrun/workspace.tsx` and `src/web/api/types.ts` first to confirm the exact type names used in the workspace, then write:

```tsx
/**
 * Run-level diff panel — summarises which employees changed vs the prior run.
 * Uses workspace-loaded data only; no additional fetch.
 */
import { DeltaBadge } from "@/components/payroll/delta-badge";
import type { EmployeeLineDto } from "@/web/api/types";

interface RunDiffPanelProps {
  readonly lines: readonly EmployeeLineDto[];
}

function RunDiffPanel({ lines }: RunDiffPanelProps) {
  const changed = lines.filter((l) => l.variance?.hasChanges === true);

  if (changed.length === 0) {
    return (
      <div className="border-b bg-muted/30 px-6 py-3 text-muted-foreground text-sm">
        No changes from prior run.
      </div>
    );
  }

  return (
    <div className="border-b bg-muted/30">
      <div className="px-6 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Changes from prior run — {changed.length} employee{changed.length !== 1 ? "s" : ""}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {changed.map((line) => (
            <tr key={line.employeeId} className="border-t border-border/50">
              <td className="px-6 py-1.5 text-foreground">
                {line.employeeName}
              </td>
              <td className="px-2 py-1.5">
                {line.variance && (
                  <DeltaBadge variance={line.variance} />
                )}
              </td>
              <td className="px-4 py-1.5">
                <div className="flex flex-wrap gap-1">
                  {line.variance?.changedRootKeys.slice(0, 6).map((key) => (
                    <span
                      key={key}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                    >
                      {key}
                    </span>
                  ))}
                  {(line.variance?.changedRootKeys.length ?? 0) > 6 && (
                    <span className="text-xs text-muted-foreground">
                      +{(line.variance?.changedRootKeys.length ?? 0) - 6} more
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { RunDiffPanel };
```

- [ ] **Step 2: Modify `src/web/payrun/run-header.tsx`**

Read the current file, then add `showCompare`/`onCompare` props and the Compare button:

```tsx
// Add to imports:
import { useState } from "react";
import { RunDiffPanel } from "./run-diff-panel";

// Update RunHeaderProps:
interface RunHeaderProps {
  readonly view: PayRunWorkspaceView;
  readonly onRecompute: () => void;
  readonly onReview: () => void;
  readonly onApprove: () => void;
}

// Inside RunHeader, before the return:
const hasPrior = view.lines.some((l) => l.previousRoots !== null);
const [showCompare, setShowCompare] = useState(false);

// In the button group (after existing buttons):
{hasPrior && (
  <Button
    onClick={() => setShowCompare((v) => !v)}
    size="sm"
    variant="ghost"
  >
    {showCompare ? "Hide compare" : "Compare"}
  </Button>
)}

// After the header div, before closing fragment:
{hasPrior && showCompare && <RunDiffPanel lines={view.lines} />}
```

The full updated component:

```tsx
import { useState } from "react";
import type { RunStatus } from "@/components/payroll/status-badge";
import { StatusBadge } from "@/components/payroll/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PayRunWorkspaceView } from "@/web/api/payroll-api";
import { RunDiffPanel } from "./run-diff-panel";

function isRunStatus(status: string): status is RunStatus {
  return status === "DRAFT" || status === "REVIEWED" || status === "APPROVED" || status === "CLOSED";
}

interface RunHeaderProps {
  readonly view: PayRunWorkspaceView;
  readonly onRecompute: () => void;
  readonly onReview: () => void;
  readonly onApprove: () => void;
}

function RunHeader({ view, onRecompute, onReview, onApprove }: RunHeaderProps) {
  const { run, actionAvailability: avail } = view;
  const hasPrior = view.lines.some((l) => l.previousRoots !== null);
  const [showCompare, setShowCompare] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3 border-b bg-card px-6 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-foreground">{run.companyName}</span>
            <Badge className="font-mono text-xs" variant="outline">{run.reportingMonth}</Badge>
            <StatusBadge status={isRunStatus(run.status) ? run.status : "DRAFT"} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasPrior && (
            <Button onClick={() => setShowCompare((v) => !v)} size="sm" variant="ghost">
              {showCompare ? "Hide compare" : "Compare"}
            </Button>
          )}
          {avail.canRecompute && <Button onClick={onRecompute} size="sm" variant="outline">Recompute</Button>}
          {avail.canReview   && <Button onClick={onReview}    size="sm" variant="outline">Review</Button>}
          {avail.canApprove  && <Button onClick={onApprove}   size="sm">Approve</Button>}
        </div>
      </div>
      {hasPrior && showCompare && <RunDiffPanel lines={view.lines} />}
    </>
  );
}

export type { RunHeaderProps };
export { RunHeader };
```

- [ ] **Step 3: Run Biome lint**

```bash
npx biome check src/web/payrun/run-diff-panel.tsx src/web/payrun/run-header.tsx
```
Fix any reported issues.

- [ ] **Step 4: Commit**

```bash
git add src/web/payrun/run-diff-panel.tsx src/web/payrun/run-header.tsx
git commit -m "feat(phase8): run-level compare panel in workspace header"
```

---

### Task 3: Employee-level graph diff tab (slide-over)

**Files:**
- Create: `src/web/payrun/employee-diff.tsx`
- Modify: `src/web/payrun/employee-slide-over.tsx`
- Modify: `src/web/api/payroll-api.ts`

**Interfaces:**
- Consumes: `RunLineDiffDto` / `NodeDiffRow` (Task 1 server shape), `DeltaBadge`, `createApiClient` / `apiGet` from `@/web/api/client`
- Produces: `<EmployeeDiff runId lineId />` tab component; `fetchLineDiff(runId, lineId)` API function

- [ ] **Step 1: Add `fetchLineDiff` to `src/web/api/payroll-api.ts`**

Read the file to understand the existing `apiGet` pattern, then append:

```typescript
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

export interface RunLineDiffDto {
  readonly runId: string;
  readonly lineId: string;
  readonly employmentId: string;
  readonly priorRunId: string | null;
  readonly diffs: readonly NodeDiffRow[];
}

export async function fetchLineDiff(runId: string, lineId: string): Promise<RunLineDiffDto> {
  return apiGet(`/pay-runs/${runId}/lines/${lineId}/diff`);
}
```

- [ ] **Step 2: Create `src/web/payrun/employee-diff.tsx`**

```tsx
/**
 * Employee-level graph diff tab — lazy-fetched on activation.
 * Shows NodeDiff[] grouped by kind (VALUE / ADDED / REMOVED / STRUCTURE / CITATION).
 */
import { useEffect, useState } from "react";
import { DeltaBadge } from "@/components/payroll/delta-badge";
import { fetchLineDiff, type NodeDiffRow, type RunLineDiffDto } from "@/web/api/payroll-api";

interface EmployeeDiffProps {
  readonly runId: string;
  readonly lineId: string;
}

type DiffKind = NodeDiffRow["d"];

const KIND_ORDER: DiffKind[] = ["VALUE", "ADDED", "REMOVED", "STRUCTURE", "CITATION"];
const KIND_LABEL: Record<DiffKind, string> = {
  VALUE:     "Changed values",
  ADDED:     "Added nodes",
  REMOVED:   "Removed nodes",
  STRUCTURE: "Structural changes",
  CITATION:  "Source changes",
};

function ValueRow({ row }: { row: NodeDiffRow }) {
  return (
    <div className="flex items-start gap-3 border-b border-border/50 px-4 py-2 text-sm">
      <span className="min-w-0 flex-1 font-mono text-xs text-muted-foreground">{row.id}</span>
      <span className="shrink-0 text-xs">{row.label}</span>
      <div className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">{row.fromValue ?? "\u2014"}</span>
        <span className="text-muted-foreground">\u2192</span>
        <span>{row.toValue ?? "\u2014"}</span>
        {row.deltaSen !== null && (
          <DeltaBadge
            variance={{
              previousSen: null,
              deltaSen: row.deltaSen,
              deltaBps: null,
              direction: row.deltaSen > 0 ? "UP" : row.deltaSen < 0 ? "DOWN" : "SAME",
            }}
          />
        )}
      </div>
    </div>
  );
}

function SimpleRow({ row, annotation }: { row: NodeDiffRow; annotation: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 px-4 py-2 text-sm">
      <span className="min-w-0 flex-1 font-mono text-xs text-muted-foreground">{row.id}</span>
      <span className="shrink-0 text-xs">{row.label}</span>
      <span className="text-xs text-muted-foreground">{annotation}</span>
    </div>
  );
}

function StructureRow({ row }: { row: NodeDiffRow }) {
  return (
    <div className="border-b border-border/50 px-4 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 font-mono text-xs text-muted-foreground">{row.id}</span>
        <span className="shrink-0 text-xs">{row.label}</span>
      </div>
      {row.addedRefs.length > 0 && (
        <div className="mt-1 text-xs text-muted-foreground">
          + {row.addedRefs.join(", ")}
        </div>
      )}
      {row.removedRefs.length > 0 && (
        <div className="mt-0.5 text-xs text-muted-foreground line-through">
          {row.removedRefs.join(", ")}
        </div>
      )}
    </div>
  );
}

function EmployeeDiff({ runId, lineId }: EmployeeDiffProps) {
  const [data, setData] = useState<RunLineDiffDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLineDiff(runId, lineId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [runId, lineId]);

  if (error) return <div className="p-4 text-sm text-destructive">{error}</div>;
  if (!data)  return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

  if (!data.priorRunId || data.diffs.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {data.priorRunId ? "No graph changes from prior run." : "No prior run linked — diff unavailable."}
      </div>
    );
  }

  const byKind = new Map<DiffKind, NodeDiffRow[]>();
  for (const d of data.diffs) {
    const arr = byKind.get(d.d) ?? [];
    arr.push(d);
    byKind.set(d.d, arr);
  }

  return (
    <div>
      <div className="border-b px-4 py-2 text-xs text-muted-foreground">
        Comparing <span className="font-mono">{data.runId}</span> vs{" "}
        <span className="font-mono">{data.priorRunId}</span>
      </div>
      {KIND_ORDER.filter((k) => byKind.has(k)).map((kind) => {
        const rows = byKind.get(kind)!;
        return (
          <div key={kind}>
            <div className="flex items-center gap-2 bg-muted/30 px-4 py-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {KIND_LABEL[kind]}
              </span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {rows.length}
              </span>
            </div>
            {rows.map((row) => {
              switch (row.d) {
                case "VALUE":     return <ValueRow key={row.id} row={row} />;
                case "ADDED":     return <SimpleRow key={row.id} row={row} annotation="(added)" />;
                case "REMOVED":   return <SimpleRow key={row.id} row={row} annotation="(removed)" />;
                case "STRUCTURE": return <StructureRow key={row.id} row={row} />;
                case "CITATION":  return <SimpleRow key={row.id} row={row} annotation="(source changed)" />;
              }
            })}
          </div>
        );
      })}
    </div>
  );
}

export { EmployeeDiff };
```

- [ ] **Step 3: Add Diff tab to `src/web/payrun/employee-slide-over.tsx`**

Read the current file to find the tab list and tab panels structure. Add "Diff" as a 4th tab — only when `line.previousRoots !== null`:

In the tab bar (the `<div>` or `<nav>` with tab buttons), add after the Payslip tab:
```tsx
{line.previousRoots !== null && (
  <button
    className={tabClass("diff")}
    onClick={() => setActiveTab("diff")}
    type="button"
  >
    Diff
  </button>
)}
```

In the tab content section, add after the Payslip panel:
```tsx
{activeTab === "diff" && line.previousRoots !== null && (
  <EmployeeDiff lineId={line.employeeId} runId={runId} />
)}
```

Add import at the top of the file:
```typescript
import { EmployeeDiff } from "./employee-diff";
```

Update the `activeTab` type to include `"diff"`:
```typescript
type ActiveTab = "line" | "derivation" | "payslip" | "diff";
```

- [ ] **Step 4: Run Biome lint + TypeScript check**

```bash
npx biome check src/web/payrun/employee-diff.tsx src/web/payrun/employee-slide-over.tsx src/web/api/payroll-api.ts
npx tsc --noEmit
```
Fix any issues.

- [ ] **Step 5: Commit**

```bash
git add src/web/payrun/employee-diff.tsx src/web/payrun/employee-slide-over.tsx src/web/api/payroll-api.ts
git commit -m "feat(phase8): employee-level graph diff tab in slide-over"
```

---

## Self-Review

**Spec coverage check:**
- §4.2 `payLines.trace` — server route uses `payLines.trace` ✓; test inserts `trace` column ✓
- §4.2 `employmentId` matching — server route: `eq(payLines.employmentId, line.employmentId)` ✓
- §4.3 run-level panel from workspace data (no extra fetch) — `run-diff-panel.tsx` uses `lines` prop ✓
- §4.4 employee diff lazy fetch on tab activation — `useEffect` in `employee-diff.tsx` ✓
- §4.4 diff tab hidden when `previousRoots === null` — `{line.previousRoots !== null && ...}` ✓
- `priorRunId: null` when no `linkedRunId` — test covers ✓; route returns `diffs: []` ✓
- Tests §9.2 items 1–7 — all covered across Task 1 (server) tests ✓

**Type consistency:**
- `RunLineDiffDto.diffs` is `NodeDiffRow[]` in server and client — same shape ✓
- `DeltaBadge` receives `variance` with `deltaSen`/`direction` — matches existing `VarianceDto` prop signature ✓
