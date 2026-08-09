# Phase 8C — Reports Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `/reports` page with a full reporting portal: payment register, statutory summary, exception report, and an annual remuneration summary (explicitly NOT Form EA/C.P.8A). Each report is a server read-facade. The SPA uses URL-driven state (`/reports?type=...&runId=...`) and includes a deep-link from the workspace.

**Architecture:** Two new Hono route files (`pay-run-reports.ts`, `employee-remuneration.ts`) assemble each report DTO from existing tables. No new schema. The SPA portal replaces `reports-page.tsx` in-place; individual report views are separate components. All report DTOs carry a `reportMeta` provenance envelope.

**Tech Stack:** Hono, Drizzle ORM, React + wouter (URL search params), TypeScript, existing `findings-panel` severity chip pattern

## Codebase state entering Phase 8C (Phase 8A + 8B already delivered)

- `src/web/api/payroll-api.ts` uses `getPayrollApi().method()` pattern — follow the same pattern as `fetchPayslip` / `fetchPayslipIndex`. Each new endpoint needs a method on `PayrollApi`, registered in `createApiClient`, and a standalone `fetchXxx` wrapper.
- `run-header.tsx` will have a `Compare` button after Phase 8B — **read the file before adding Reports link** to avoid duplicate modifications.
- Phase 8A delivered: `pay-run-payslip.ts`, bilingual payslip document tree, `payslip-page.tsx`.
- Phase 8B delivered: `pay-run-diff.ts`, `run-diff-panel.tsx`, `employee-diff.tsx`, Compare button on `run-header.tsx`, Diff tab on `employee-slide-over.tsx`.
- Tests must pass: `npm test` should stay green throughout. Current baseline: 905/905 (grows with each phase).

## Global Constraints

- All report DTOs carry `reportMeta: { companyId, companyName, runId?, runStatus?, calcRevision?, generatedAt, reportSchemaVersion }`.
- Annual remuneration summary is **not** labelled "Form EA" or "C.P.8A" anywhere in the code, UI copy, or type names.
- Annual remuneration summary includes only `APPROVED` and `CLOSED` runs; `DRAFT`/`REVIEWED` excluded.
- Annual remuneration summary DTO includes a `limitationNotice` field — rendered visibly, not hidden.
- Aggregation key for annual summary: `companyId + employmentId + calendar year`.
- Money is integer sen. Nil renders as `—`.
- No client-side payroll recalculation.
- Spec: `docs/superpowers/specs/2026-08-09-phase8-reports-payslip-diff-design.md` §5

---

### Task 1: Run-scoped report server routes

**Files:**
- Create: `src/server/routes/pay-run-reports.ts`
- Modify: `src/server/app.ts`
- Test: `tests/db/pay-run-reports.test.ts`

**Interfaces:**
- Consumes: `requirePayRunAccess`, `Database`, `payLines`/`payRuns`/`companies` from schema, `linePayments` from `@/db/schema/control`, `anomalyFindings` from `@/db/schema/findings`
- Produces:
  ```typescript
  interface ReportMeta {
    companyId: string; companyName: string; runId: string;
    runStatus: string; calcRevision: string | null;
    generatedAt: string; reportSchemaVersion: string;
  }
  // GET /v1/pay-runs/:runId/reports/payment-register   → PaymentRegisterDto
  // GET /v1/pay-runs/:runId/reports/statutory-summary  → StatutorySummaryDto
  // GET /v1/pay-runs/:runId/reports/exception-report   → ExceptionReportDto
  ```

- [ ] **Step 1: Write failing tests**

```typescript
// tests/db/pay-run-reports.test.ts
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

const COMPANY_ID  = "cccccccc-0003-4000-8000-000000000001";
const PERSON_ID   = "cccccccc-0003-4000-8000-000000000002";
const EMP_ID      = "cccccccc-0003-4000-8000-000000000003";
const RUN_ID      = "RPT-TEST-2026-07";
const ADMIN_EMAIL = "reports-admin@example.com";
let rulePackId = "";
let lineId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);
  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'RPTCORP', 'Reports Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'REPORTS WORKER', '900101-10-5555', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES (${EMP_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'R001', '2020-01-01',
            'MONTHLY', 500000, false, false, false, false)`);
  await db.execute(sql`
    INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end, working_days, rule_pack_id, status)
    VALUES (${RUN_ID}, ${COMPANY_ID}, 2026, 7, '2026-07-01', '2026-07-31', 26, ${rulePackId}, 'APPROVED')`);
  const snap = JSON.stringify({ id: "R001", name: "REPORTS WORKER" });
  const result = await db.execute(sql`
    INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days, period_end,
      gross_sen, net_sen, deductions_total_sen,
      epf_wages_sen, socso_wages_sen, eis_wages_sen,
      epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
      eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen,
      hrdf_sen, employer_cost_sen)
    VALUES (gen_random_uuid(), ${RUN_ID}, ${EMP_ID}, ${snap}::jsonb, 26, '2026-07-31',
            500000, 433500, 66500, 500000, 500000, 500000,
            55000, 65000, 4750, 0, 9375, 1750, 1750, 5000, 0, 0, 0, 0, 65000)
    RETURNING id`);
  lineId = (result.rows[0] as { id: string }).id;
});

beforeEach(async () => {
  await db.delete(userRoleAssignments);
  await db.delete(users);
  await db.delete(roles).where(sql`is_system = false`);
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
  const user = await createUser(db, { email, name: "Reports Admin" });
  const role = await getRoleByCode(db, SYSTEM_ADMIN_ROLE_CODE);
  if (!role) throw new Error("SYSTEM_ADMIN missing");
  await assignUserToRole(db, { userId: user.id, roleId: role.id, companyId: null });
}
function adminApp() {
  return createApp({ db, verifyJwt: verifier({ admin: claims({ sub: "neon-rpt-admin", email: ADMIN_EMAIL }) }) });
}

describe("GET /v1/pay-runs/:runId/reports/payment-register", () => {
  it("returns 401 without token", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(`/v1/pay-runs/${RUN_ID}/reports/payment-register`);
    expect(res.status).toBe(401);
  });

  it("returns payment register with reportMeta and rows", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(`/v1/pay-runs/${RUN_ID}/reports/payment-register`, {
      headers: { "Authorization": "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.reportMeta).toBeDefined();
    expect((body.reportMeta as Record<string, unknown>).reportSchemaVersion).toBeDefined();
    expect((body.reportMeta as Record<string, unknown>).runId).toBe(RUN_ID);
    expect(Array.isArray(body.rows)).toBe(true);
    expect((body.rows as unknown[]).length).toBeGreaterThan(0);
    const row = (body.rows as Array<Record<string, unknown>>)[0];
    expect(row.employeeCode).toBe("R001");
    expect(row.netSen).toBe(433500);
  });

  it("includes totalNetSen", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(`/v1/pay-runs/${RUN_ID}/reports/payment-register`, {
      headers: { "Authorization": "Bearer admin" },
    });
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.totalNetSen).toBe("number");
    expect(body.totalNetSen).toBe(433500);
  });
});

describe("GET /v1/pay-runs/:runId/reports/statutory-summary", () => {
  it("returns statutory totals matching payLine roots", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(`/v1/pay-runs/${RUN_ID}/reports/statutory-summary`, {
      headers: { "Authorization": "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.reportMeta).toBeDefined();
    expect(body.employeeCount).toBe(1);
    expect(body.grossTotalSen).toBe(500000);
    expect(body.epfEeTotalSen).toBe(55000);
    expect(body.epfErTotalSen).toBe(65000);
    expect(body.pcbNetTotalSen).toBe(5000);
  });
});

describe("GET /v1/pay-runs/:runId/reports/exception-report", () => {
  it("returns exception report DTO with reportMeta", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(`/v1/pay-runs/${RUN_ID}/reports/exception-report`, {
      headers: { "Authorization": "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.reportMeta).toBeDefined();
    expect(Array.isArray(body.findings)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/db/pay-run-reports.test.ts
```
Expected: All fail — route does not exist.

- [ ] **Step 3: Create `src/server/routes/pay-run-reports.ts`**

First, read `src/db/schema/control.ts` to confirm the `linePayments` column names, and `src/db/schema/findings.ts` to confirm `anomalyFindings` columns.

```typescript
/**
 * Phase 8 — run-scoped report read facades.
 * GET /v1/pay-runs/:runId/reports/payment-register
 * GET /v1/pay-runs/:runId/reports/statutory-summary
 * GET /v1/pay-runs/:runId/reports/exception-report
 */
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "@/db/client";
import { anomalyFindings } from "@/db/schema/findings";
import { companies } from "@/db/schema/parties";
import { payLines, payRuns } from "@/db/schema/run";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";
import { requirePayRunAccess } from "./pay-run-access";

// linePayments lives in control schema — import carefully to avoid cycle
import { linePayments } from "@/db/schema/control";

const REPORT_SCHEMA_VERSION = "1.0";

async function getRunMeta(db: Database, runId: string) {
  const [run] = await db.select({
    id: payRuns.id, companyId: payRuns.companyId, status: payRuns.status,
    calcRevision: payRuns.calcRevision, companyName: companies.name,
  }).from(payRuns).innerJoin(companies, eq(payRuns.companyId, companies.id))
    .where(eq(payRuns.id, runId)).limit(1);
  return run ?? null;
}

function buildMeta(run: NonNullable<Awaited<ReturnType<typeof getRunMeta>>>) {
  return {
    companyId: run.companyId,
    companyName: run.companyName,
    runId: run.id,
    runStatus: run.status,
    calcRevision: run.calcRevision ?? null,
    generatedAt: new Date().toISOString(),
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
  };
}

export function payRunReportRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  // ── Payment Register ──────────────────────────────────────────────────────
  app.get("/pay-runs/:runId/reports/payment-register", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      const run = await getRunMeta(db, runId);
      if (!run) return c.json({ code: "NOT_FOUND", message: `no such run: ${runId}` }, 404);

      const rows = await db.select({
        lineId:       payLines.id,
        employmentId: payLines.employmentId,
        employeeSnapshot: payLines.employeeSnapshot,
        netSen:       payLines.netSen,
        paymentState: linePayments.state,
        paymentRef:   linePayments.paymentRef,
      }).from(payLines)
        .leftJoin(linePayments, eq(linePayments.lineId, payLines.id))
        .where(eq(payLines.runId, runId));

      const mapped = rows.map((r) => {
        const snap = r.employeeSnapshot as { id?: string; name?: string; bankAccount?: string };
        const acct = snap.bankAccount;
        return {
          lineId:       r.lineId,
          employeeCode: snap.id   ?? r.employmentId,
          employeeName: snap.name ?? "Unknown",
          netSen:       r.netSen,
          paymentState: r.paymentState ?? null,
          paymentRef:   r.paymentRef   ?? null,
          maskedBankAccount: acct ? (acct.length > 4 ? `****${acct.slice(-4)}` : "****") : null,
        };
      });

      const totalNetSen = mapped.reduce((acc, r) => acc + (r.netSen ?? 0), 0);

      return c.json({ reportMeta: buildMeta(run), rows: mapped, totalNetSen });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  // ── Statutory Summary ─────────────────────────────────────────────────────
  app.get("/pay-runs/:runId/reports/statutory-summary", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      const run = await getRunMeta(db, runId);
      if (!run) return c.json({ code: "NOT_FOUND", message: `no such run: ${runId}` }, 404);

      const lines = await db.select().from(payLines).where(eq(payLines.runId, runId));
      const sum = (key: keyof typeof payLines.$inferSelect) =>
        lines.reduce((acc, l) => acc + ((l[key] as number | null) ?? 0), 0);

      return c.json({
        reportMeta: buildMeta(run),
        employeeCount:       lines.length,
        grossTotalSen:       sum("grossSen"),
        netTotalSen:         sum("netSen"),
        epfEeTotalSen:       sum("epfEeSen"),
        epfErTotalSen:       sum("epfErSen"),
        socsoEeCoreTotalSen: sum("socsoEeCoreSen"),
        socsoErTotalSen:     sum("socsoErSen"),
        eisEeTotalSen:       sum("eisEeSen"),
        eisErTotalSen:       sum("eisErSen"),
        pcbNetTotalSen:      sum("pcbNetSen"),
        cp38TotalSen:        sum("cp38Sen"),
      });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  // ── Exception Report ──────────────────────────────────────────────────────
  app.get("/pay-runs/:runId/reports/exception-report", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      const run = await getRunMeta(db, runId);
      if (!run) return c.json({ code: "NOT_FOUND", message: `no such run: ${runId}` }, 404);

      const findings = await db.select({
        id:       anomalyFindings.id,
        severity: anomalyFindings.severity,
        status:   anomalyFindings.status,
        title:    anomalyFindings.title,
        detail:   anomalyFindings.detail,
        lineId:   anomalyFindings.lineId,
      }).from(anomalyFindings).where(eq(anomalyFindings.runId, runId));

      // Build a lineId → employeeName lookup from payLines
      const lineIds = [...new Set(findings.map((f) => f.lineId).filter(Boolean))] as string[];
      const nameMap = new Map<string, string>();
      if (lineIds.length > 0) {
        const lines = await db.select({ id: payLines.id, employeeSnapshot: payLines.employeeSnapshot })
          .from(payLines).where(eq(payLines.runId, runId));
        for (const l of lines) {
          const snap = l.employeeSnapshot as { name?: string };
          nameMap.set(l.id, snap.name ?? "Unknown");
        }
      }

      return c.json({
        reportMeta: buildMeta(run),
        findings: findings.map((f) => ({
          id:           f.id,
          severity:     f.severity,
          status:       f.status,
          title:        f.title,
          detail:       f.detail,
          lineId:       f.lineId ?? null,
          employeeName: f.lineId ? (nameMap.get(f.lineId) ?? null) : null,
        })),
      });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
```

- [ ] **Step 4: Mount in `src/server/app.ts`**

Add import:
```typescript
import { payRunReportRoutes } from "./routes/pay-run-reports";
```
Add in `v1.route(...)` block:
```typescript
v1.route("/", payRunReportRoutes(deps.db));
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/db/pay-run-reports.test.ts
```
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/pay-run-reports.ts src/server/app.ts tests/db/pay-run-reports.test.ts
git commit -m "feat(phase8): run-scoped report server routes (payment register, statutory summary, exception)"
```

---

### Task 2: Annual Remuneration Summary server route

**Files:**
- Create: `src/server/routes/employee-remuneration.ts`
- Modify: `src/server/app.ts`
- Test: `tests/db/employee-remuneration.test.ts`

**Interfaces:**
- Consumes: `Database`, `payLines`/`payRuns`/`companies` from schema, `requirePayRunAccess` (or a direct company READ check)
- Produces:
  ```typescript
  // GET /v1/employees/:employeeId/remuneration-summary/:year → AnnualRemunerationSummaryDto
  interface AnnualRemunerationSummaryDto {
    reportMeta: { companyId: string; companyName: string; generatedAt: string; reportSchemaVersion: string; };
    year: number;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    runsIncluded: string[];
    months: string[];
    grossSen: number; netSen: number; epfEeSen: number; epfErSen: number;
    socsoEeCoreSen: number; eisEeSen: number; pcbNetSen: number; cp38Sen: number;
    limitationNotice: string;
    disclaimer: string;
  }
  ```

- [ ] **Step 1: Write failing tests**

```typescript
// tests/db/employee-remuneration.test.ts
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

const COMPANY_ID  = "dddddddd-0003-4000-8000-000000000001";
const PERSON_ID   = "dddddddd-0003-4000-8000-000000000002";
const EMP_ID      = "dddddddd-0003-4000-8000-000000000003";
const ADMIN_EMAIL = "remun-admin@example.com";
let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);
  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'REMCORP', 'Remun Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'REMUN WORKER', '900101-10-4444', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES (${EMP_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'RM001', '2020-01-01',
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
  const user = await createUser(db, { email, name: "Remun Admin" });
  const role = await getRoleByCode(db, SYSTEM_ADMIN_ROLE_CODE);
  if (!role) throw new Error("SYSTEM_ADMIN missing");
  await assignUserToRole(db, { userId: user.id, roleId: role.id, companyId: null });
}
function adminApp() {
  return createApp({ db, verifyJwt: verifier({ admin: claims({ sub: "neon-rem-admin", email: ADMIN_EMAIL }) }) });
}

async function insertApprovedRuns() {
  const snap = JSON.stringify({ id: "RM001", name: "REMUN WORKER" });
  for (const [month, runId] of [["06", "REM-2026-06"], ["07", "REM-2026-07"]] as const) {
    await db.execute(sql`
      INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end, working_days, rule_pack_id, status)
      VALUES (${runId}, ${COMPANY_ID}, 2026, ${Number(month)},
              ${"2026-" + month + "-01"}, ${"2026-" + month + "-30"}, 26, ${rulePackId}, 'APPROVED')`);
    await db.execute(sql`
      INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days, period_end,
        gross_sen, net_sen, deductions_total_sen, epf_wages_sen, socso_wages_sen, eis_wages_sen,
        epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
        eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen, hrdf_sen, employer_cost_sen)
      VALUES (gen_random_uuid(), ${runId}, ${EMP_ID}, ${snap}::jsonb, 26, ${"2026-" + month + "-30"},
              500000, 433500, 66500, 500000, 500000, 500000,
              55000, 65000, 4750, 0, 9375, 1750, 1750, 5000, 0, 0, 0, 0, 65000)`);
  }
  // Also insert a DRAFT run that should NOT be included
  await db.execute(sql`
    INSERT INTO pay_runs (id, company_id, year, month, period_start, period_end, working_days, rule_pack_id, status)
    VALUES ('REM-2026-08', ${COMPANY_ID}, 2026, 8, '2026-08-01', '2026-08-31', 26, ${rulePackId}, 'DRAFT')`);
  await db.execute(sql`
    INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days, period_end,
      gross_sen, net_sen, deductions_total_sen, epf_wages_sen, socso_wages_sen, eis_wages_sen,
      epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
      eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen, hrdf_sen, employer_cost_sen)
    VALUES (gen_random_uuid(), 'REM-2026-08', ${EMP_ID}, ${snap}::jsonb, 26, '2026-08-31',
            999999, 888888, 111111, 999999, 999999, 999999,
            99999, 99999, 9999, 0, 9999, 9999, 9999, 9999, 0, 0, 0, 0, 99999)`);
}

describe("GET /v1/employees/:employeeId/remuneration-summary/:year", () => {
  it("returns 401 without token", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(`/v1/employees/${EMP_ID}/remuneration-summary/2026`);
    expect(res.status).toBe(401);
  });

  it("aggregates only APPROVED/CLOSED runs and excludes DRAFT", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    await insertApprovedRuns();
    const res = await app.request(`/v1/employees/${EMP_ID}/remuneration-summary/2026`, {
      headers: { "Authorization": "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    // Two approved runs × 500000 = 1000000
    expect(body.grossSen).toBe(1000000);
    expect(body.epfEeSen).toBe(110000); // 55000 × 2
    // DRAFT run (999999 gross) must NOT be included
    expect(body.grossSen).not.toBe(1999999);
    expect(body.runsIncluded).toHaveLength(2);
  });

  it("returns zero totals when no approved runs (not error)", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    const res = await app.request(`/v1/employees/${EMP_ID}/remuneration-summary/2025`, {
      headers: { "Authorization": "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.grossSen).toBe(0);
    expect(body.runsIncluded).toHaveLength(0);
  });

  it("includes limitationNotice and disclaimer in DTO", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    await insertApprovedRuns();
    const res = await app.request(`/v1/employees/${EMP_ID}/remuneration-summary/2026`, {
      headers: { "Authorization": "Bearer admin" },
    });
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.limitationNotice).toBe("string");
    expect((body.limitationNotice as string).length).toBeGreaterThan(0);
    expect(typeof body.disclaimer).toBe("string");
    expect(body.disclaimer).not.toContain("Form EA");
    expect(body.disclaimer).not.toContain("C.P.8A");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/db/employee-remuneration.test.ts
```
Expected: All fail.

- [ ] **Step 3: Create `src/server/routes/employee-remuneration.ts`**

```typescript
/**
 * Phase 8 — annual remuneration summary read facade.
 * NOT Form EA / C.P.8A. See spec §5.3 and frozen Rule 4.
 *
 * GET /v1/employees/:employeeId/remuneration-summary/:year
 */
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "@/db/client";
import { companies } from "@/db/schema/parties";
import { payLines, payRuns } from "@/db/schema/run";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";
import { employments } from "@/db/schema/parties";

const REPORT_SCHEMA_VERSION = "1.0";

const LIMITATION_NOTICE =
  "This summary aggregates payroll figures by reporting month, not by income receipt date. " +
  "Arrears, advance salary, late December payroll, and bonuses relating to prior periods may " +
  "require manual adjustment for annual income tax reporting purposes. " +
  "This is not a substitute for the official annual employer remuneration statement.";

const DISCLAIMER =
  "Annual remuneration summary prepared from payroll records in this system. " +
  "The employer must prepare and issue the annual remuneration statement to each employee " +
  "in accordance with the applicable statutory requirements and prescribed format.";

export function employeeRemunerationRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/employees/:employeeId/remuneration-summary/:year", async (c) => {
    try {
      const employeeId = c.req.param("employeeId");
      const year       = Number(c.req.param("year"));
      if (!Number.isInteger(year) || year < 2000 || year > 2999) {
        return c.json({ code: "VALIDATION_ERROR", message: "invalid year" }, 400);
      }

      // Resolve company via employment record
      const [employment] = await db.select({
        id: employments.id, companyId: employments.companyId,
        employeeCode: employments.employeeCode,
      }).from(employments).where(eq(employments.id, employeeId)).limit(1);

      if (!employment) {
        return c.json({ code: "NOT_FOUND", message: `no such employee: ${employeeId}` }, 404);
      }

      const [company] = await db.select({ id: companies.id, name: companies.name })
        .from(companies).where(eq(companies.id, employment.companyId)).limit(1);

      // All APPROVED + CLOSED runs for this company in this year
      const eligibleRuns = await db.select({ id: payRuns.id, month: payRuns.month, status: payRuns.status })
        .from(payRuns)
        .where(and(
          eq(payRuns.companyId, employment.companyId),
          eq(payRuns.year, year),
          inArray(payRuns.status, ["APPROVED", "CLOSED"]),
        ));

      const eligibleRunIds = eligibleRuns.map((r) => r.id);

      let grossSen = 0, netSen = 0, epfEeSen = 0, epfErSen = 0;
      let socsoEeCoreSen = 0, eisEeSen = 0, pcbNetSen = 0, cp38Sen = 0;
      let employeeName = "Unknown";
      let employeeCode = employment.employeeCode;
      const months: string[] = [];

      if (eligibleRunIds.length > 0) {
        const lines = await db.select().from(payLines).where(
          and(eq(payLines.employmentId, employeeId), inArray(payLines.runId, eligibleRunIds))
        );

        for (const line of lines) {
          const snap = line.employeeSnapshot as { name?: string; id?: string };
          if (snap.name) employeeName = snap.name;
          if (snap.id)   employeeCode  = snap.id;

          grossSen       += line.grossSen       ?? 0;
          netSen         += line.netSen         ?? 0;
          epfEeSen       += line.epfEeSen       ?? 0;
          epfErSen       += line.epfErSen       ?? 0;
          socsoEeCoreSen += line.socsoEeCoreSen ?? 0;
          eisEeSen       += line.eisEeSen       ?? 0;
          pcbNetSen      += line.pcbNetSen      ?? 0;
          cp38Sen        += line.cp38Sen        ?? 0;
        }

        for (const r of eligibleRuns) {
          months.push(`${year}-${String(r.month).padStart(2, "0")}`);
        }
        months.sort();
      }

      return c.json({
        reportMeta: {
          companyId:           employment.companyId,
          companyName:         company?.name ?? "Unknown",
          generatedAt:         new Date().toISOString(),
          reportSchemaVersion: REPORT_SCHEMA_VERSION,
        },
        year,
        employeeId,
        employeeName,
        employeeCode,
        runsIncluded: eligibleRunIds,
        months,
        grossSen, netSen, epfEeSen, epfErSen,
        socsoEeCoreSen, eisEeSen, pcbNetSen, cp38Sen,
        limitationNotice: LIMITATION_NOTICE,
        disclaimer:       DISCLAIMER,
      });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
```

- [ ] **Step 4: Mount in `src/server/app.ts`**

Add import:
```typescript
import { employeeRemunerationRoutes } from "./routes/employee-remuneration";
```
Add in `v1.route(...)` block:
```typescript
v1.route("/", employeeRemunerationRoutes(deps.db));
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/db/employee-remuneration.test.ts
```
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/employee-remuneration.ts src/server/app.ts tests/db/employee-remuneration.test.ts
git commit -m "feat(phase8): annual remuneration summary server route (not Form EA)"
```

---

### Task 3: Reports SPA portal

**Files:**
- Modify: `src/web/reports/reports-page.tsx`
- Create: `src/web/reports/payment-register.tsx`
- Create: `src/web/reports/statutory-summary.tsx`
- Create: `src/web/reports/exception-report.tsx`
- Create: `src/web/reports/annual-remuneration-summary.tsx`
- Modify: `src/web/api/payroll-api.ts`
- Modify: `src/web/payrun/run-header.tsx`

**Interfaces:**
- Consumes: `PayRunSummary` from existing types, `EmployeeSummary` from existing types, new fetch functions
- Produces: rebuilt `ReportsPage`; deep-link button in `RunHeader`

- [ ] **Step 1: Add API fetch functions to `src/web/api/payroll-api.ts`**

Read the file to confirm `apiGet` pattern and existing type imports, then append:

```typescript
// ── Report DTOs ───────────────────────────────────────────────────────────

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

export interface PaymentRegisterDto {
  readonly reportMeta: ReportMeta;
  readonly rows: readonly PaymentRegisterRow[];
  readonly totalNetSen: number;
}

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

export interface ExceptionReportDto {
  readonly reportMeta: ReportMeta;
  readonly findings: readonly ExceptionFindingRow[];
}

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
  readonly limitationNotice: string;
  readonly disclaimer: string;
}

export async function fetchPaymentRegister(runId: string): Promise<PaymentRegisterDto> {
  return apiGet(`/pay-runs/${runId}/reports/payment-register`);
}

export async function fetchStatutorySummary(runId: string): Promise<StatutorySummaryDto> {
  return apiGet(`/pay-runs/${runId}/reports/statutory-summary`);
}

export async function fetchExceptionReport(runId: string): Promise<ExceptionReportDto> {
  return apiGet(`/pay-runs/${runId}/reports/exception-report`);
}

export async function fetchAnnualRemunerationSummary(
  employeeId: string,
  year: number
): Promise<AnnualRemunerationSummaryDto> {
  return apiGet(`/employees/${employeeId}/remuneration-summary/${year}`);
}
```

- [ ] **Step 2: Create `src/web/reports/payment-register.tsx`**

```tsx
import { MoneyCell } from "@/components/payroll/money-cell";
import type { PaymentRegisterDto } from "@/web/api/payroll-api";

interface PaymentRegisterProps {
  readonly data: PaymentRegisterDto;
}

function PaymentRegister({ data }: PaymentRegisterProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-foreground">Payment Register</h2>
          <p className="text-muted-foreground text-xs">{data.reportMeta.runId} · {data.reportMeta.runStatus}</p>
        </div>
        <button
          className="rounded border px-3 py-1.5 text-xs font-medium"
          onClick={() => window.print()}
          type="button"
        >
          Print
        </button>
      </div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="py-2 text-left font-medium text-muted-foreground">Employee</th>
            <th className="py-2 text-left font-medium text-muted-foreground">Code</th>
            <th className="py-2 text-right font-medium text-muted-foreground">Net Pay</th>
            <th className="py-2 text-left font-medium text-muted-foreground">Payment Status</th>
            <th className="py-2 text-left font-medium text-muted-foreground">Bank Account</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.lineId} className="border-b border-border/50">
              <td className="py-2">{row.employeeName}</td>
              <td className="py-2 font-mono text-xs text-muted-foreground">{row.employeeCode}</td>
              <td className="py-2 text-right"><MoneyCell sen={row.netSen} /></td>
              <td className="py-2 text-xs">{row.paymentState ?? "—"}</td>
              <td className="py-2 text-xs font-mono">{row.maskedBankAccount ?? "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <td className="py-2" colSpan={2}>Total</td>
            <td className="py-2 text-right"><MoneyCell sen={data.totalNetSen} /></td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      <p className="text-xs text-muted-foreground">
        Generated: {data.reportMeta.generatedAt} · Schema v{data.reportMeta.reportSchemaVersion}
      </p>
    </div>
  );
}

export { PaymentRegister };
```

- [ ] **Step 3: Create `src/web/reports/statutory-summary.tsx`**

```tsx
import { MoneyCell } from "@/components/payroll/money-cell";
import type { StatutorySummaryDto } from "@/web/api/payroll-api";

interface StatutorySummaryProps {
  readonly data: StatutorySummaryDto;
}

const ROWS: Array<{ label: string; field: keyof StatutorySummaryDto }> = [
  { label: "Gross Pay",          field: "grossTotalSen" },
  { label: "Net Pay",            field: "netTotalSen" },
  { label: "EPF Employee",       field: "epfEeTotalSen" },
  { label: "EPF Employer",       field: "epfErTotalSen" },
  { label: "SOCSO Employee",     field: "socsoEeCoreTotalSen" },
  { label: "SOCSO Employer",     field: "socsoErTotalSen" },
  { label: "EIS Employee",       field: "eisEeTotalSen" },
  { label: "EIS Employer",       field: "eisErTotalSen" },
  { label: "PCB / MTD",          field: "pcbNetTotalSen" },
  { label: "CP38",               field: "cp38TotalSen" },
];

function StatutorySummary({ data }: StatutorySummaryProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Statutory Remittance Summary</h2>
        <p className="text-muted-foreground text-xs">
          {data.reportMeta.runId} · {data.reportMeta.runStatus} · {data.employeeCount} employee{data.employeeCount !== 1 ? "s" : ""}
        </p>
      </div>
      <table className="w-full text-sm border-collapse">
        <tbody>
          {ROWS.map(({ label, field }) => (
            <tr key={field} className="border-b border-border/50">
              <td className="py-2 text-muted-foreground">{label}</td>
              <td className="py-2 text-right"><MoneyCell sen={data[field] as number} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        Generated: {data.reportMeta.generatedAt} · Schema v{data.reportMeta.reportSchemaVersion}
      </p>
    </div>
  );
}

export { StatutorySummary };
```

- [ ] **Step 4: Create `src/web/reports/exception-report.tsx`**

```tsx
import type { ExceptionReportDto } from "@/web/api/payroll-api";

// Reuse the severity colour pattern from findings-panel.tsx
const SEVERITY_CLASS: Record<string, string> = {
  BLOCKING: "bg-destructive/10 text-destructive border-destructive/20",
  WARNING:  "bg-yellow-50 text-yellow-800 border-yellow-200",
  REVIEW:   "bg-blue-50 text-blue-800 border-blue-200",
  INFO:     "bg-muted text-muted-foreground border-border",
};

interface ExceptionReportProps {
  readonly data: ExceptionReportDto;
}

function ExceptionReport({ data }: ExceptionReportProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Exception Report</h2>
        <p className="text-muted-foreground text-xs">
          {data.reportMeta.runId} · {data.findings.length} finding{data.findings.length !== 1 ? "s" : ""}
        </p>
      </div>
      {data.findings.length === 0 && (
        <p className="text-sm text-muted-foreground">No findings for this run.</p>
      )}
      <div className="space-y-2">
        {data.findings.map((f) => (
          <div key={f.id} className={`rounded border p-3 text-sm ${SEVERITY_CLASS[f.severity] ?? SEVERITY_CLASS.INFO}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{f.title}</span>
              <div className="flex items-center gap-2 text-xs">
                <span className="opacity-70">{f.severity}</span>
                <span className="opacity-70">{f.status}</span>
              </div>
            </div>
            <p className="mt-1 text-xs opacity-80">{f.detail}</p>
            {f.employeeName && (
              <p className="mt-0.5 text-xs opacity-60">{f.employeeName}</p>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Generated: {data.reportMeta.generatedAt} · Schema v{data.reportMeta.reportSchemaVersion}
      </p>
    </div>
  );
}

export { ExceptionReport };
```

- [ ] **Step 5: Create `src/web/reports/annual-remuneration-summary.tsx`**

Note: "Form EA" must not appear anywhere in this component.

```tsx
import { MoneyCell } from "@/components/payroll/money-cell";
import type { AnnualRemunerationSummaryDto } from "@/web/api/payroll-api";

interface AnnualRemunerationSummaryProps {
  readonly data: AnnualRemunerationSummaryDto;
}

const ROWS: Array<{ label: string; field: keyof AnnualRemunerationSummaryDto }> = [
  { label: "Gross Pay",      field: "grossSen" },
  { label: "Net Pay",        field: "netSen" },
  { label: "EPF Employee",   field: "epfEeSen" },
  { label: "EPF Employer",   field: "epfErSen" },
  { label: "SOCSO Employee", field: "socsoEeCoreSen" },
  { label: "EIS Employee",   field: "eisEeSen" },
  { label: "PCB / MTD",      field: "pcbNetSen" },
  { label: "CP38",           field: "cp38Sen" },
];

function AnnualRemunerationSummary({ data }: AnnualRemunerationSummaryProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Annual Remuneration Summary</h2>
        <p className="text-muted-foreground text-sm">
          {data.employeeName} · {data.employeeCode} · Tax Year {data.year}
        </p>
        <p className="text-muted-foreground text-xs">{data.reportMeta.companyName}</p>
      </div>

      {/* Limitation notice — must be shown, per spec Rule 4 */}
      <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
        <p className="font-semibold mb-1">Important: Payroll-system summary only</p>
        <p>{data.limitationNotice}</p>
      </div>

      <table className="w-full text-sm border-collapse">
        <tbody>
          {ROWS.map(({ label, field }) => (
            <tr key={field} className="border-b border-border/50">
              <td className="py-2 text-muted-foreground">{label}</td>
              <td className="py-2 text-right"><MoneyCell sen={data[field] as number} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>Months included: {data.months.join(", ") || "—"}</p>
        <p>Runs included: {data.runsIncluded.length}</p>
      </div>

      {/* Disclaimer — must be shown */}
      <div className="rounded border bg-muted/40 p-3 text-xs text-muted-foreground">
        {data.disclaimer}
      </div>

      <p className="text-xs text-muted-foreground">
        Generated: {data.reportMeta.generatedAt} · Schema v{data.reportMeta.reportSchemaVersion}
      </p>
    </div>
  );
}

export { AnnualRemunerationSummary };
```

- [ ] **Step 6: Rebuild `src/web/reports/reports-page.tsx`**

```tsx
/**
 * Reports portal — URL-driven state: /reports?type=<type>&runId=<id>
 * Report types: payment-register | statutory-summary | exception-report | annual-remuneration
 */
import { useCallback, useEffect, useState } from "react";
import { BarChart2Icon, FileTextIcon, AlertTriangleIcon, CalendarIcon } from "lucide-react";
import {
  fetchPaymentRegister, fetchStatutorySummary, fetchExceptionReport,
  fetchAnnualRemunerationSummary, fetchPayRuns, fetchEmployees,
  type PaymentRegisterDto, type StatutorySummaryDto,
  type ExceptionReportDto, type AnnualRemunerationSummaryDto,
  type PayRunSummary, type EmployeeSummary,
} from "@/web/api/payroll-api";
import { useScopeContext } from "@/web/context/scope-context";
import { PaymentRegister } from "./payment-register";
import { StatutorySummary } from "./statutory-summary";
import { ExceptionReport } from "./exception-report";
import { AnnualRemunerationSummary } from "./annual-remuneration-summary";

type ReportType = "payment-register" | "statutory-summary" | "exception-report" | "annual-remuneration";

const REPORT_TYPES: Array<{ id: ReportType; label: string; icon: React.ReactNode }> = [
  { id: "payment-register",  label: "Payment Register",        icon: <BarChart2Icon className="h-4 w-4" /> },
  { id: "statutory-summary", label: "Statutory Summary",       icon: <FileTextIcon className="h-4 w-4" /> },
  { id: "exception-report",  label: "Exception Report",        icon: <AlertTriangleIcon className="h-4 w-4" /> },
  { id: "annual-remuneration", label: "Annual Remuneration Summary", icon: <CalendarIcon className="h-4 w-4" /> },
];

function getParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key);
}

function ReportsPage() {
  const { companyId } = useScopeContext();
  const [activeType, setActiveType] = useState<ReportType>(
    (getParam("type") as ReportType | null) ?? "payment-register"
  );
  const [selectedRunId, setSelectedRunId] = useState<string>(getParam("runId") ?? "");
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [selectedYear,  setSelectedYear]  = useState<number>(new Date().getFullYear());
  const [runs,  setRuns]  = useState<PayRunSummary[]>([]);
  const [emps,  setEmps]  = useState<EmployeeSummary[]>([]);
  const [data,  setData]  = useState<
    PaymentRegisterDto | StatutorySummaryDto | ExceptionReportDto | AnnualRemunerationSummaryDto | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    fetchPayRuns(companyId).then((r) => setRuns(r.runs ?? r)).catch(() => undefined);
    fetchEmployees(companyId).then((r) => setEmps(r.employees ?? r)).catch(() => undefined);
  }, [companyId]);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    setLoading(true);
    try {
      if (activeType === "annual-remuneration") {
        if (!selectedEmpId) { setLoading(false); return; }
        setData(await fetchAnnualRemunerationSummary(selectedEmpId, selectedYear));
      } else {
        if (!selectedRunId) { setLoading(false); return; }
        if (activeType === "payment-register")  setData(await fetchPaymentRegister(selectedRunId));
        if (activeType === "statutory-summary") setData(await fetchStatutorySummary(selectedRunId));
        if (activeType === "exception-report")  setData(await fetchExceptionReport(selectedRunId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [activeType, selectedRunId, selectedEmpId, selectedYear]);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <nav className="w-56 shrink-0 border-r bg-card p-4 space-y-1">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reports</p>
        {REPORT_TYPES.map((rt) => (
          <button
            key={rt.id}
            className={`flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-left transition-colors ${
              activeType === rt.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-foreground hover:bg-muted"
            }`}
            onClick={() => { setActiveType(rt.id); setData(null); }}
            type="button"
          >
            {rt.icon}
            {rt.label}
          </button>
        ))}
      </nav>

      {/* Main panel */}
      <main className="flex-1 overflow-auto p-6 space-y-4">
        {/* Controls */}
        <div className="flex items-end gap-3">
          {activeType !== "annual-remuneration" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="run-picker">Pay Run</label>
              <select
                className="rounded border px-2 py-1.5 text-sm"
                id="run-picker"
                onChange={(e) => setSelectedRunId(e.target.value)}
                value={selectedRunId}
              >
                <option value="">— select run —</option>
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>{r.label} ({r.status})</option>
                ))}
              </select>
            </div>
          )}
          {activeType === "annual-remuneration" && (
            <>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="emp-picker">Employee</label>
                <select
                  className="rounded border px-2 py-1.5 text-sm"
                  id="emp-picker"
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  value={selectedEmpId}
                >
                  <option value="">— select employee —</option>
                  {emps.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="year-picker">Year</label>
                <input
                  className="rounded border px-2 py-1.5 text-sm w-24"
                  id="year-picker"
                  max={new Date().getFullYear() + 1}
                  min={2020}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  type="number"
                  value={selectedYear}
                />
              </div>
            </>
          )}
          <button
            className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
            onClick={load}
            type="button"
          >
            Load
          </button>
        </div>

        {/* Report view */}
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error   && <p className="text-sm text-destructive">{error}</p>}
        {data    && activeType === "payment-register"   && <PaymentRegister         data={data as PaymentRegisterDto} />}
        {data    && activeType === "statutory-summary"  && <StatutorySummary        data={data as StatutorySummaryDto} />}
        {data    && activeType === "exception-report"   && <ExceptionReport         data={data as ExceptionReportDto} />}
        {data    && activeType === "annual-remuneration" && <AnnualRemunerationSummary data={data as AnnualRemunerationSummaryDto} />}
        {!data && !loading && !error && (
          <p className="text-sm text-muted-foreground">Select a run and click Load to generate a report.</p>
        )}
      </main>
    </div>
  );
}

export { ReportsPage };
```

- [ ] **Step 7: Add Reports deep-link to `run-header.tsx`**

Read the current `run-header.tsx` (modified in Phase 8B) and add a Reports link button in the action area:

```tsx
// Add import at top:
import { Link } from "wouter";

// In the button group, after Compare and before Recompute:
<Link
  className="inline-flex items-center rounded border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
  href={`/reports?type=payment-register&runId=${run.id}`}
>
  Reports ↗
</Link>
```

- [ ] **Step 8: Run Biome lint + TypeScript check**

```bash
npx biome check src/web/reports/ src/web/api/payroll-api.ts src/web/payrun/run-header.tsx
npx tsc --noEmit
```
Fix any issues. In particular verify: `fetchPayRuns` and `fetchEmployees` already exist in `payroll-api.ts`; if not, read the file and add minimal versions.

- [ ] **Step 9: Commit**

```bash
git add src/web/reports/ src/web/api/payroll-api.ts src/web/payrun/run-header.tsx
git commit -m "feat(phase8): reports portal SPA (payment register, statutory summary, exception, annual remuneration)"
```

---

## Self-Review

**Spec coverage check:**
- §5.1 `ReportMeta` on all DTOs — every DTO has `reportMeta` with `reportSchemaVersion` ✓
- §5.2 three run-scoped routes — Task 1 ✓
- §5.3 "Annual Remuneration Summary" naming (not Form EA) — server route, SPA component, test all use `remuneration` ✓
- §5.3 `limitationNotice` and `disclaimer` in DTO — implemented + test asserts non-empty and no "Form EA" ✓
- §5.3 only APPROVED + CLOSED — `inArray(payRuns.status, ["APPROVED", "CLOSED"])` ✓
- §5.4 SPA portal with type sidebar + run/employee pickers + URL-driven — `reports-page.tsx` ✓
- §5.5 workspace deep-link — `run-header.tsx` Reports link ✓
- §9.3 tests 1–8 — covered across Task 1 and Task 2 tests ✓

**Type consistency:**
- `AnnualRemunerationSummaryDto` same shape in server route response and SPA client type ✓
- `ReportMeta` field `reportSchemaVersion: string` — present in both server and client types ✓
- `fetchPayRuns` / `fetchEmployees` — note in Step 8 to verify existence before commit ✓
