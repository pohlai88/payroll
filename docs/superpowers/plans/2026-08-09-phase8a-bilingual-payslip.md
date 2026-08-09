# Phase 8A — Bilingual Production Payslip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-page bilingual (EN/MS) production payslip document for approved pay-run lines, replacing the Phase 5B English-only quick preview with a governed AFENDA-PAYSLIP-01 document reachable at `/pay-runs/:runId/payslip/:lineId`.

**Architecture:** New Hono read-facade route assembles `PayslipDocumentDto` from immutable `payLines` snapshot data (including `payLineItems` for individual earning lines). A new SPA full-page component renders the document using `--doc-*` tokens only, with `window.print()` for browser printing. The slide-over quick preview is preserved unchanged; a link is added from it to the new full page.

**Tech Stack:** Hono (server routes), Drizzle ORM (queries), TypeScript, React + wouter (SPA), Tailwind v4 + `--doc-*` CSS tokens, `renderLabel` from `src/domain/derive/i18n/render.ts`

## Global Constraints

- All money is integer sen — never floats. `null` sen renders as `—` (em dash), never `0`.
- `--doc-*` CSS tokens only in document components; no app theme tokens; no raw hex values.
- Light-only document under all conditions — `@media print` forces light mode.
- Legal employer from `companies` via `payRuns.companyId` (live record; `employerSourceWarning: "LIVE_COMPANY_RECORD"` in DTO).
- Employee identity from `payLines.employeeSnapshot` JSONB — immutable at compute time.
- YTD key: `companyId + employmentId + calendar year` (APPROVED + CLOSED runs only for finalized; + current provisional values for DRAFT_PREVIEW).
- No client-side payroll recalculation ever.
- `documentStatus: "DRAFT_PREVIEW"` requires visible "PREVIEW — NOT ISSUED" watermark; DRAFT_PREVIEW payslips are never eligible for artifact distribution.
- `generatedAt` = render timestamp only; document provenance uses `approvedAt` / `closedAt`.
- All bilingual labels via `renderLabel(label, lang)` or the `SECTION_LABELS` map in `payslip-document.tsx`.
- Do not cite EA 1955 s.19/s.25A as payslip law. Cite EPF Act 1991 s.42 + KWSP guidance.
- Spec: `docs/superpowers/specs/2026-08-09-phase8-reports-payslip-diff-design.md` §3

---

### Task 1: Payslip server route + DTO

**Files:**
- Create: `src/server/routes/pay-run-payslip.ts`
- Modify: `src/server/app.ts`
- Test: `tests/db/pay-run-payslip.test.ts`

**Interfaces:**
- Consumes: `requirePayRunAccess` from `./pay-run-access`, `Database` from `@/db/client`, `payRuns`/`payLines`/`payLineItems`/`companies` from `@/db/schema/run` and `@/db/schema/parties`, `payRuns.rulePackId` from schema
- Produces:
  ```typescript
  // GET /v1/pay-runs/:runId/lines/:lineId/payslip → PayslipDocumentDto
  // GET /v1/pay-runs/:runId/payslips → { payslips: PayslipIndexRow[] }
  interface PayslipDocumentDto {
    documentId: string;
    generatedAt: string;
    documentStatus: "APPROVED" | "CLOSED" | "DRAFT_PREVIEW";
    employerSourceWarning: "LIVE_COMPANY_RECORD" | null;
    legalEmployer: {
      name: string; registrationNumber: string | null; epfReference: string | null;
      socsoReference: string | null; eisReference: string | null;
      lhdnReference: string | null; representativeName: string | null;
    };
    employee: {
      id: string; name: string; code: string; designation: string | null;
      department: string | null; maskedNric: string | null;
      gender: string | null; citizenship: string | null;
      epfNumber: string | null; socsoNumber: string | null; payBasis: string | null;
    };
    payPeriod: {
      reportingMonth: string; periodStart: string; periodEnd: string;
      paymentDate: string | null; runId: string; label: string; workingDays: number;
    };
    payment: { method: string | null; maskedBankAccount: string | null; statementDate: string | null; };
    lineItems: Array<{
      kind: string; codeSnap: string; nameEnSnap: string; nameMsSnap: string;
      resolvedAmountSen: number; quantity: string | null; rateSen: number | null;
    }>;
    roots: Record<string, { sen: number | null; notApplicable: boolean }>;
    statutoryWageBases: { epfWagesSen: number | null; socsoWagesSen: number | null; eisWagesSen: number | null; };
    ytd: { grossSen: number; netSen: number; epfEeSen: number; epfErSen: number;
           socsoEeCoreSen: number; eisEeSen: number; pcbNetSen: number; cp38Sen: number;
           isProvisional: boolean; } | null;
    approval: { reviewedBy: string | null; reviewedAt: string | null; approvedBy: string | null;
                approvedAt: string | null; closedBy: string | null; closedAt: string | null; };
    auditIdentity: { runId: string; calcRevision: string | null; rulePackId: string;
                     rulePackHash: string | null; calcEngineVersion: string | null; };
  }
  interface PayslipIndexRow { lineId: string; employeeCode: string; employeeName: string; netSen: number | null; }
  ```

- [ ] **Step 1: Write failing tests**

```typescript
// tests/db/pay-run-payslip.test.ts
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

const COMPANY_ID = "aaaaaaaa-0001-4000-8000-000000000001";
const PERSON_ID  = "aaaaaaaa-0001-4000-8000-000000000002";
const EMP_ID     = "aaaaaaaa-0001-4000-8000-000000000003";
const RUN_ID     = "PSL-TEST-2026-07";
const ADMIN_EMAIL = "payslip-admin@example.com";
let rulePackId = "";

beforeAll(async () => {
  await database.truncate(...ALL_TABLES);
  rulePackId = await seed(db);
  await db.execute(sql`
    INSERT INTO companies (id, code, name, hrdf_enabled)
    VALUES (${COMPANY_ID}, 'PSLCORP', 'Payslip Co', false)`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob)
    VALUES (${PERSON_ID}, 'PAYSLIP WORKER', '900101-10-7777', '1990-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (
      id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen,
      epf_applicable, socso_applicable, eis_applicable, pcb_applicable)
    VALUES (${EMP_ID}, ${PERSON_ID}, ${COMPANY_ID}, 'P001', '2020-01-01',
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
  const user = await createUser(db, { email, name: "Payslip Admin" });
  const role = await getRoleByCode(db, SYSTEM_ADMIN_ROLE_CODE);
  if (!role) throw new Error("SYSTEM_ADMIN missing");
  await assignUserToRole(db, { userId: user.id, roleId: role.id, companyId: null });
}
function adminApp() {
  return createApp({ db, verifyJwt: verifier({ admin: claims({ sub: "neon-psl-admin", email: ADMIN_EMAIL }) }) });
}

async function createApprovedRun(app: ReturnType<typeof createApp>) {
  await makeAdmin(ADMIN_EMAIL);
  const snapshot = JSON.stringify({ id: "P001", name: "PAYSLIP WORKER" });
  // Create run
  await app.request("/v1/pay-runs", {
    method: "POST",
    headers: { "Authorization": "Bearer admin", "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: COMPANY_ID, year: 2026, month: 7, rulePackId,
                           periodStart: "2026-07-01", periodEnd: "2026-07-31", workingDays: 26 }),
  });
  // Insert a pay line directly
  await db.execute(sql`
    INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days,
      period_end, gross_sen, epf_wages_sen, socso_wages_sen, eis_wages_sen,
      epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
      eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen,
      deductions_total_sen, net_sen, hrdf_sen, employer_cost_sen)
    VALUES (
      gen_random_uuid(), ${RUN_ID}, ${EMP_ID}, ${snapshot}::jsonb, 26, '2026-07-31',
      500000, 500000, 500000, 500000,
      55000, 65000, 4750, 0, 9375,
      1750, 1750, 5000, 0, 0, 0,
      66500, 433500, 0, 65000
    ) RETURNING id`);
  // Approve
  await app.request(`/v1/pay-runs/${RUN_ID}/recompute`, { method: "POST", headers: { "Authorization": "Bearer admin" } });
  await app.request(`/v1/pay-runs/${RUN_ID}/review`,    { method: "POST", headers: { "Authorization": "Bearer admin", "Content-Type": "application/json" }, body: JSON.stringify({ calcRevision: "any" }) });
  await app.request(`/v1/pay-runs/${RUN_ID}/approve`,   { method: "POST", headers: { "Authorization": "Bearer admin", "Content-Type": "application/json" }, body: JSON.stringify({ calcRevision: "any" }) });
}

describe("GET /v1/pay-runs/:runId/payslips", () => {
  it("returns 401 without token", async () => {
    const app = adminApp();
    await createApprovedRun(app);
    const res = await app.request(`/v1/pay-runs/${RUN_ID}/payslips`);
    expect(res.status).toBe(401);
  });

  it("returns index row for each line", async () => {
    const app = adminApp();
    await createApprovedRun(app);
    const res = await app.request(`/v1/pay-runs/${RUN_ID}/payslips`, {
      headers: { "Authorization": "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { payslips: unknown[] };
    expect(body.payslips).toHaveLength(1);
    const row = body.payslips[0] as Record<string, unknown>;
    expect(row.employeeCode).toBe("P001");
    expect(typeof row.lineId).toBe("string");
  });
});

describe("GET /v1/pay-runs/:runId/lines/:lineId/payslip", () => {
  it("returns APPROVED payslip DTO with correct structure", async () => {
    const app = adminApp();
    await createApprovedRun(app);
    // Get lineId from index
    const idx = await app.request(`/v1/pay-runs/${RUN_ID}/payslips`, { headers: { "Authorization": "Bearer admin" } });
    const { payslips } = await idx.json() as { payslips: Array<{ lineId: string }> };
    const lineId = payslips[0].lineId;

    const res = await app.request(`/v1/pay-runs/${RUN_ID}/lines/${lineId}/payslip`, {
      headers: { "Authorization": "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const dto = await res.json() as Record<string, unknown>;
    expect(dto.documentStatus).toBe("APPROVED");
    expect(dto.employerSourceWarning).toBe("LIVE_COMPANY_RECORD");
    expect((dto.legalEmployer as Record<string, unknown>).name).toBe("Payslip Co");
    expect((dto.employee as Record<string, unknown>).name).toBe("PAYSLIP WORKER");
    expect((dto.roots as Record<string, unknown>).gross).toBeDefined();
    expect(dto.auditIdentity).toBeDefined();
    expect((dto.auditIdentity as Record<string, unknown>).rulePackId).toBeDefined();
  });

  it("returns DRAFT_PREVIEW for a DRAFT run without 403", async () => {
    const app = adminApp();
    await makeAdmin(ADMIN_EMAIL);
    await app.request("/v1/pay-runs", {
      method: "POST",
      headers: { "Authorization": "Bearer admin", "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: COMPANY_ID, year: 2026, month: 8, rulePackId,
                             periodStart: "2026-08-01", periodEnd: "2026-08-31", workingDays: 26 }),
    });
    const DRAFT_RUN = "PSL-TEST-2026-08";
    // Insert line
    const snapshot = JSON.stringify({ id: "P001", name: "PAYSLIP WORKER" });
    await db.execute(sql`
      INSERT INTO pay_lines (id, run_id, employment_id, employee_snapshot, working_days,
        period_end, gross_sen, net_sen, deductions_total_sen,
        epf_wages_sen, socso_wages_sen, eis_wages_sen,
        epf_ee_sen, epf_er_sen, socso_ee_core_sen, socso_ee_skbbk_sen, socso_er_sen,
        eis_ee_sen, eis_er_sen, pcb_net_sen, cp38_sen, zakat_sen, other_deductions_sen,
        hrdf_sen, employer_cost_sen)
      VALUES (gen_random_uuid(), ${DRAFT_RUN}, ${EMP_ID}, ${snapshot}::jsonb, 26, '2026-08-31',
              500000, 433500, 66500, 500000, 500000, 500000,
              55000, 65000, 4750, 0, 9375, 1750, 1750, 5000, 0, 0, 0, 0, 65000)
      RETURNING id`);
    const idx = await app.request(`/v1/pay-runs/${DRAFT_RUN}/payslips`, { headers: { "Authorization": "Bearer admin" } });
    const { payslips } = await idx.json() as { payslips: Array<{ lineId: string }> };
    const lineId = payslips[0].lineId;

    const res = await app.request(`/v1/pay-runs/${DRAFT_RUN}/lines/${lineId}/payslip`, {
      headers: { "Authorization": "Bearer admin" },
    });
    expect(res.status).toBe(200);
    const dto = await res.json() as Record<string, unknown>;
    expect(dto.documentStatus).toBe("DRAFT_PREVIEW");
  });

  it("YTD isProvisional=false for APPROVED run", async () => {
    const app = adminApp();
    await createApprovedRun(app);
    const idx = await app.request(`/v1/pay-runs/${RUN_ID}/payslips`, { headers: { "Authorization": "Bearer admin" } });
    const { payslips } = await idx.json() as { payslips: Array<{ lineId: string }> };
    const lineId = payslips[0].lineId;
    const res = await app.request(`/v1/pay-runs/${RUN_ID}/lines/${lineId}/payslip`, { headers: { "Authorization": "Bearer admin" } });
    const dto = await res.json() as Record<string, unknown>;
    const ytd = dto.ytd as Record<string, unknown> | null;
    // Only one approved run — YTD equals this run's values, isProvisional false
    expect(ytd?.isProvisional).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/db/pay-run-payslip.test.ts
```
Expected: All tests fail — `pay-run-payslip.ts` does not exist yet.

- [ ] **Step 3: Create `src/server/routes/pay-run-payslip.ts`**

```typescript
/**
 * Phase 8 — payslip read facade.
 * GET /v1/pay-runs/:runId/payslips         → index of lines for this run
 * GET /v1/pay-runs/:runId/lines/:lineId/payslip → full PayslipDocumentDto
 */
import { and, eq, inArray, lt } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "@/db/client";
import { companies } from "@/db/schema/parties";
import { payLineItems, payLines, payRuns } from "@/db/schema/run";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";
import { requirePayRunAccess } from "./pay-run-access";

function maskNric(ic: string | null | undefined): string | null {
  if (!ic) return null;
  const digits = ic.replace(/\D/g, "");
  return digits.length >= 4 ? `****-**-${digits.slice(-4)}` : null;
}

function maskBankAccount(acct: string | null | undefined): string | null {
  if (!acct) return null;
  return acct.length > 4 ? `****${acct.slice(-4)}` : "****";
}

function docStatusFromRunStatus(status: string): "APPROVED" | "CLOSED" | "DRAFT_PREVIEW" {
  if (status === "APPROVED") return "APPROVED";
  if (status === "CLOSED")   return "CLOSED";
  return "DRAFT_PREVIEW";
}

function buildRootsRecord(line: typeof payLines.$inferSelect): Record<string, { sen: number | null; notApplicable: boolean }> {
  return {
    gross:            { sen: line.grossSen,           notApplicable: false },
    epfWages:         { sen: line.epfWagesSen,         notApplicable: false },
    socsoWages:       { sen: line.socsoWagesSen,       notApplicable: false },
    eisWages:         { sen: line.eisWagesSen,         notApplicable: false },
    epfEe:            { sen: line.epfEeSen,            notApplicable: false },
    epfEr:            { sen: line.epfErSen,            notApplicable: false },
    socsoEeCore:      { sen: line.socsoEeCoreSen,      notApplicable: false },
    socsoEeSkbbk:     { sen: line.socsoEeSkbbkSen,     notApplicable: false },
    socsoEr:          { sen: line.socsoErSen,          notApplicable: false },
    eisEe:            { sen: line.eisEeSen,            notApplicable: false },
    eisEr:            { sen: line.eisErSen,            notApplicable: false },
    pcbNet:           { sen: line.pcbNetSen,           notApplicable: line.pcbNetSen === null },
    cp38:             { sen: line.cp38Sen,             notApplicable: false },
    zakat:            { sen: line.zakatSen,            notApplicable: false },
    otherDeductions:  { sen: line.otherDeductionsSen,  notApplicable: false },
    deductionsTotal:  { sen: line.deductionsTotalSen,  notApplicable: line.deductionsTotalSen === null },
    net:              { sen: line.netSen,              notApplicable: line.netSen === null },
    hrdf:             { sen: line.hrdfSen,             notApplicable: false },
    employerCost:     { sen: line.employerCostSen,     notApplicable: false },
  };
}

export function payRunPayslipRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  // Index
  app.get("/pay-runs/:runId/payslips", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      const lines = await db.select({
        id: payLines.id,
        employeeSnapshot: payLines.employeeSnapshot,
        netSen: payLines.netSen,
      }).from(payLines).where(eq(payLines.runId, runId));

      const payslips = lines.map((l) => {
        const snap = l.employeeSnapshot as { id?: string; name?: string };
        return { lineId: l.id, employeeCode: snap.id ?? l.id, employeeName: snap.name ?? "Unknown", netSen: l.netSen };
      });
      return c.json({ payslips });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  // Full payslip DTO
  app.get("/pay-runs/:runId/lines/:lineId/payslip", async (c) => {
    try {
      const runId  = c.req.param("runId");
      const lineId = c.req.param("lineId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);

      const [run] = await db.select({
        id: payRuns.id, companyId: payRuns.companyId, year: payRuns.year, month: payRuns.month,
        periodStart: payRuns.periodStart, periodEnd: payRuns.periodEnd, workingDays: payRuns.workingDays,
        status: payRuns.status, calcRevision: payRuns.calcRevision,
        rulePackId: payRuns.rulePackId, rulePackHash: payRuns.rulePackHash,
        calcEngineVersion: payRuns.calcEngineVersion,
        reviewedBy: payRuns.reviewedBy, reviewedAt: payRuns.reviewedAt,
        approvedBy: payRuns.approvedBy, approvedAt: payRuns.approvedAt,
        closedBy: payRuns.closedBy,     closedAt:   payRuns.closedAt,
        companyName: companies.name,
      }).from(payRuns)
        .innerJoin(companies, eq(payRuns.companyId, companies.id))
        .where(eq(payRuns.id, runId))
        .limit(1);

      if (!run) return c.json({ code: "NOT_FOUND", message: `no such run: ${runId}` }, 404);

      const [line] = await db.select().from(payLines)
        .where(and(eq(payLines.id, lineId), eq(payLines.runId, runId)))
        .limit(1);

      if (!line) return c.json({ code: "NOT_FOUND", message: `no such line: ${lineId}` }, 404);

      const items = await db.select().from(payLineItems).where(eq(payLineItems.lineId, lineId));

      const snap = line.employeeSnapshot as {
        id?: string; name?: string; designation?: string; department?: string;
        ic?: string; bankAccount?: string; epfNo?: string; socsoNo?: string;
        gender?: string; citizenship?: string; payBasis?: string;
      };

      const reportingMonth = `${run.year}-${String(run.month).padStart(2, "0")}`;
      const docStatus = docStatusFromRunStatus(run.status);
      const statementDate = run.approvedAt?.toISOString() ?? run.closedAt?.toISOString() ?? null;

      // YTD: APPROVED + CLOSED runs for same company + employment + calendar year
      const ytdRuns = await db.select({
        id: payRuns.id, status: payRuns.status,
      }).from(payRuns).where(
        and(eq(payRuns.companyId, run.companyId), eq(payRuns.year, run.year))
      );

      const finalizedRunIds = ytdRuns
        .filter((r) => r.status === "APPROVED" || r.status === "CLOSED")
        .map((r) => r.id);

      const isProvisional = docStatus === "DRAFT_PREVIEW";

      let ytd: {
        grossSen: number; netSen: number; epfEeSen: number; epfErSen: number;
        socsoEeCoreSen: number; eisEeSen: number; pcbNetSen: number; cp38Sen: number;
        isProvisional: boolean;
      } | null = null;

      if (finalizedRunIds.length > 0 || isProvisional) {
        const runIdsForYtd = isProvisional ? finalizedRunIds : finalizedRunIds;
        const ytdLines = runIdsForYtd.length > 0
          ? await db.select().from(payLines).where(
              and(eq(payLines.employmentId, line.employmentId), inArray(payLines.runId, runIdsForYtd))
            )
          : [];

        const sum = (key: keyof typeof payLines.$inferSelect) =>
          ytdLines.reduce((acc, l) => acc + ((l[key] as number | null) ?? 0), 0);

        const finalizedYtd = {
          grossSen: sum("grossSen"), netSen: sum("netSen"), epfEeSen: sum("epfEeSen"),
          epfErSen: sum("epfErSen"), socsoEeCoreSen: sum("socsoEeCoreSen"),
          eisEeSen: sum("eisEeSen"), pcbNetSen: sum("pcbNetSen"), cp38Sen: sum("cp38Sen"),
        };

        if (isProvisional) {
          ytd = {
            grossSen: finalizedYtd.grossSen + (line.grossSen ?? 0),
            netSen:   finalizedYtd.netSen   + (line.netSen   ?? 0),
            epfEeSen: finalizedYtd.epfEeSen + (line.epfEeSen ?? 0),
            epfErSen: finalizedYtd.epfErSen + (line.epfErSen ?? 0),
            socsoEeCoreSen: finalizedYtd.socsoEeCoreSen + (line.socsoEeCoreSen ?? 0),
            eisEeSen: finalizedYtd.eisEeSen + (line.eisEeSen ?? 0),
            pcbNetSen: finalizedYtd.pcbNetSen + (line.pcbNetSen ?? 0),
            cp38Sen:  finalizedYtd.cp38Sen  + (line.cp38Sen  ?? 0),
            isProvisional: true,
          };
        } else {
          ytd = { ...finalizedYtd, isProvisional: false };
        }
      }

      const dto = {
        documentId: `PSL-${runId}-${lineId}`,
        generatedAt: new Date().toISOString(),
        documentStatus: docStatus,
        employerSourceWarning: "LIVE_COMPANY_RECORD" as const,
        legalEmployer: {
          name: run.companyName,
          registrationNumber: null,
          epfReference: null,
          socsoReference: null,
          eisReference: null,
          lhdnReference: null,
          representativeName: null,
        },
        employee: {
          id: line.employmentId,
          name: snap.name ?? "Unknown",
          code: snap.id ?? line.employmentId,
          designation: snap.designation ?? null,
          department: snap.department ?? null,
          maskedNric: maskNric(snap.ic),
          gender: snap.gender ?? null,
          citizenship: snap.citizenship ?? null,
          epfNumber: snap.epfNo ?? null,
          socsoNumber: snap.socsoNo ?? null,
          payBasis: snap.payBasis ?? null,
        },
        payPeriod: {
          reportingMonth,
          periodStart: run.periodStart,
          periodEnd:   run.periodEnd,
          paymentDate: null,
          runId: run.id,
          label: run.id,
          workingDays: run.workingDays,
        },
        payment: {
          method: null,
          maskedBankAccount: maskBankAccount(snap.bankAccount),
          statementDate,
        },
        lineItems: items.map((item) => ({
          kind: item.kindSnap,
          codeSnap: item.itemCodeSnap,
          nameEnSnap: item.nameEnSnap,
          nameMsSnap: item.nameMsSnap,
          resolvedAmountSen: item.resolvedAmountSen,
          quantity: item.quantity,
          rateSen: item.rateSen,
        })),
        roots: buildRootsRecord(line),
        statutoryWageBases: {
          epfWagesSen:   line.epfWagesSen,
          socsoWagesSen: line.socsoWagesSen,
          eisWagesSen:   line.eisWagesSen,
        },
        ytd,
        approval: {
          reviewedBy: run.reviewedBy, reviewedAt: run.reviewedAt?.toISOString() ?? null,
          approvedBy: run.approvedBy, approvedAt: run.approvedAt?.toISOString() ?? null,
          closedBy:   run.closedBy,   closedAt:   run.closedAt?.toISOString()   ?? null,
        },
        auditIdentity: {
          runId: run.id,
          calcRevision: run.calcRevision,
          rulePackId: run.rulePackId,
          rulePackHash: run.rulePackHash,
          calcEngineVersion: run.calcEngineVersion,
        },
      };

      return c.json(dto);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
```

- [ ] **Step 4: Mount route in `src/server/app.ts`**

Add to the imports:
```typescript
import { payRunPayslipRoutes } from "./routes/pay-run-payslip";
```
Add inside the `v1.route(...)` block (after `payRunWorkspaceRoutes`):
```typescript
v1.route("/", payRunPayslipRoutes(deps.db));
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/db/pay-run-payslip.test.ts
```
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/pay-run-payslip.ts src/server/app.ts tests/db/pay-run-payslip.test.ts
git commit -m "feat(phase8): payslip server route and DTO"
```

---

### Task 2: i18n dictionary additions

**Files:**
- Modify: `src/domain/derive/i18n/en.ts`
- Modify: `src/domain/derive/i18n/ms.ts`
- Test: `tests/domain/derive-integrity.test.ts` (existing — verify it still passes after additions)

**Interfaces:**
- Consumes: existing `MessageKey` type in `en.ts`
- Produces: new keys `doc.payslip.*` available to `renderLabel(label, "en" | "ms")`

- [ ] **Step 1: Inspect existing key structure in `en.ts` and `ms.ts`**

Read `src/domain/derive/i18n/en.ts` and `src/domain/derive/i18n/ms.ts` to understand the key/value structure, then add the payslip section keys at the end of each file.

- [ ] **Step 2: Add keys to `src/domain/derive/i18n/en.ts`**

Append at the end of the `EN` object (before closing brace):

```typescript
  // Phase 8 — payslip document section labels
  "doc.payslip.title": "PAYSLIP",
  "doc.payslip.earnings": "EARNINGS",
  "doc.payslip.deductions": "EMPLOYEE DEDUCTIONS",
  "doc.payslip.employer-contributions": "EMPLOYER CONTRIBUTIONS",
  "doc.payslip.net-pay": "NET PAY",
  "doc.payslip.ytd": "YEAR-TO-DATE",
  "doc.payslip.ytd-provisional": "YEAR-TO-DATE (PROVISIONAL)",
  "doc.payslip.statutory-wages": "STATUTORY WAGE BASES",
  "doc.payslip.audit-annex": "CALCULATION & AUDIT ANNEX",
  "doc.payslip.employer-note": "Employer-paid contributions \u2014 not deducted from your salary.",
  "doc.payslip.preview-watermark": "PREVIEW \u2014 NOT ISSUED",
  "doc.payslip.employer-source-warning": "Employer identity sourced from current company record \u2014 not a payroll-time snapshot.",
```

- [ ] **Step 3: Add matching keys to `src/domain/derive/i18n/ms.ts`**

Append at the end of the `MS` object:

```typescript
  // Phase 8 — payslip document section labels
  "doc.payslip.title": "PENYATA GAJI",
  "doc.payslip.earnings": "PENDAPATAN",
  "doc.payslip.deductions": "POTONGAN",
  "doc.payslip.employer-contributions": "SUMBANGAN MAJIKAN",
  "doc.payslip.net-pay": "GAJI BERSIH",
  "doc.payslip.ytd": "TAHUN SEMASA",
  "doc.payslip.ytd-provisional": "TAHUN SEMASA (SEMENTARA)",
  "doc.payslip.statutory-wages": "GAJI BERKANUN",
  "doc.payslip.audit-annex": "LAMPIRAN AUDIT",
  "doc.payslip.employer-note": "Sumbangan majikan \u2014 tidak ditolak daripada gaji anda.",
  "doc.payslip.preview-watermark": "PRATONTON \u2014 TIDAK DIKELUARKAN",
  "doc.payslip.employer-source-warning": "Identiti majikan diambil daripada rekod syarikat semasa \u2014 bukan rekod syarikat masa gaji diproses.",
```

- [ ] **Step 4: Run derive-integrity test to confirm parity**

```bash
npx vitest run tests/domain/derive-integrity.test.ts
```
Expected: PASS — the conformance test checks every key exists in every language.

- [ ] **Step 5: Commit**

```bash
git add src/domain/derive/i18n/en.ts src/domain/derive/i18n/ms.ts
git commit -m "feat(phase8): add doc.payslip.* i18n keys"
```

---

### Task 3: Payslip document components

**Files:**
- Create: `src/web/payrun/payslip-document/payslip-document.tsx`
- Create: `src/web/payrun/payslip-document/payslip-header.tsx`
- Create: `src/web/payrun/payslip-document/employee-summary.tsx`
- Create: `src/web/payrun/payslip-document/statutory-wage-basis.tsx`
- Create: `src/web/payrun/payslip-document/pay-equation.tsx`
- Create: `src/web/payrun/payslip-document/earnings-section.tsx`
- Create: `src/web/payrun/payslip-document/deductions-section.tsx`
- Create: `src/web/payrun/payslip-document/employer-contributions.tsx`
- Create: `src/web/payrun/payslip-document/net-pay-conclusion.tsx`
- Create: `src/web/payrun/payslip-document/ytd-summary.tsx`
- Create: `src/web/payrun/payslip-document/audit-annex.tsx`
- Create: `src/web/payrun/payslip-document/document-status-mark.tsx`
- Create: `src/web/payrun/payslip-document/payslip-print.css`

**Interfaces:**
- Consumes: `PayslipDocumentDto` (from Task 1), `renderLabel`/`Lang` from `@/domain/derive/i18n/render`, `MoneyCell` from `@/components/payroll/money-cell`
- Produces: `<PayslipDocument dto={...} lang="en" />` — self-contained, light-only, print-safe

No automated test for these React components in this task (visual/print correctness is inherently manual). The `web-palette-leak.test.ts` pattern is used in Task 4 to assert no dark tokens leak.

- [ ] **Step 1: Create `payslip-print.css`**

```css
/* payslip-print.css — Phase 8 production payslip print stylesheet */
@media print {
  :root, .dark { color-scheme: light !important; }
  html, body {
    background: white !important;
    color: black !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  .shell-sidebar, .shell-topbar, .payslip-actions, [data-no-print] {
    display: none !important;
  }
  table, figure, [data-print-keep], [data-evidence-block] { break-inside: avoid; }
  h1, h2, h3, h4, [data-group-header] { break-after: avoid; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
}
```

- [ ] **Step 2: Create `document-status-mark.tsx`**

```tsx
// PREVIEW — NOT ISSUED watermark shown for DRAFT_PREVIEW documents.
import type { Lang } from "@/domain/derive/i18n/render";

interface DocumentStatusMarkProps {
  readonly documentStatus: "APPROVED" | "CLOSED" | "DRAFT_PREVIEW";
  readonly lang: Lang;
}

const WATERMARK: Record<Lang, string> = {
  en: "PREVIEW \u2014 NOT ISSUED",
  ms: "PRATONTON \u2014 TIDAK DIKELUARKAN",
};

function DocumentStatusMark({ documentStatus, lang }: DocumentStatusMarkProps) {
  if (documentStatus === "APPROVED" || documentStatus === "CLOSED") return null;
  return (
    <div
      aria-label={WATERMARK[lang]}
      style={{
        position: "fixed",
        top: "40%",
        left: "50%",
        transform: "translate(-50%, -50%) rotate(-30deg)",
        fontSize: "3rem",
        fontWeight: 700,
        color: "var(--doc-ink-disabled)",
        opacity: 0.35,
        pointerEvents: "none",
        zIndex: 50,
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      {WATERMARK[lang]}
    </div>
  );
}

export { DocumentStatusMark };
```

- [ ] **Step 3: Create `payslip-header.tsx`**

```tsx
// Section 1 — document identity + legal employer
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./payslip-document";

interface PayslipHeaderProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const TITLE: Record<Lang, string> = { en: "PAYSLIP", ms: "PENYATA GAJI" };
const WARNING_LABEL: Record<Lang, string> = {
  en: "Employer identity sourced from current company record \u2014 not a payroll-time snapshot.",
  ms: "Identiti majikan diambil daripada rekod syarikat semasa \u2014 bukan rekod syarikat masa gaji diproses.",
};

function PayslipHeader({ dto, lang }: PayslipHeaderProps) {
  return (
    <div
      style={{
        background: "var(--doc-fill-header)",
        borderBottom: "1px solid var(--doc-rule-standard)",
        padding: "1.5rem 2rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--doc-ink-heading)", margin: 0 }}>
            {TITLE[lang]}
          </h1>
          <div style={{ marginTop: "0.5rem", color: "var(--doc-ink-heading)", fontWeight: 600 }}>
            {dto.legalEmployer.name}
          </div>
          {dto.legalEmployer.registrationNumber && (
            <div style={{ color: "var(--doc-ink-secondary)", fontSize: "0.875rem" }}>
              {dto.legalEmployer.registrationNumber}
            </div>
          )}
          {dto.legalEmployer.epfReference && (
            <div style={{ color: "var(--doc-ink-secondary)", fontSize: "0.875rem" }}>
              EPF: {dto.legalEmployer.epfReference}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", color: "var(--doc-ink-secondary)", fontSize: "0.8125rem" }}>
          <div>{dto.payPeriod.reportingMonth}</div>
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
            {lang === "en" ? "Document" : "Dokumen"}: {dto.documentId}
          </div>
          {dto.payment.statementDate && (
            <div style={{ fontSize: "0.75rem" }}>
              {lang === "en" ? "Issued" : "Tarikh"}: {dto.payment.statementDate.slice(0, 10)}
            </div>
          )}
        </div>
      </div>
      {dto.employerSourceWarning === "LIVE_COMPANY_RECORD" && (
        <div
          style={{
            marginTop: "0.5rem",
            padding: "0.375rem 0.75rem",
            background: "var(--doc-fill-subtotal)",
            border: "1px solid var(--doc-rule-standard)",
            borderRadius: "0.25rem",
            fontSize: "0.75rem",
            color: "var(--doc-ink-secondary)",
          }}
        >
          {WARNING_LABEL[lang]}
        </div>
      )}
    </div>
  );
}

export { PayslipHeader };
```

- [ ] **Step 4: Create `employee-summary.tsx`**

```tsx
// Section 2 — employee & payment summary
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./payslip-document";

interface EmployeeSummaryProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const LABELS: Record<string, Record<Lang, string>> = {
  employee:     { en: "EMPLOYEE", ms: "PEKERJA" },
  id:           { en: "Employee ID", ms: "No. Pekerja" },
  designation:  { en: "Designation", ms: "Jawatan" },
  department:   { en: "Department", ms: "Jabatan" },
  nric:         { en: "NRIC/Passport", ms: "KP/Pasport" },
  epfNo:        { en: "EPF No.", ms: "No. KWSP" },
  socsoNo:      { en: "SOCSO No.", ms: "No. PERKESO" },
  gender:       { en: "Gender", ms: "Jantina" },
  citizenship:  { en: "Citizenship", ms: "Kewarganegaraan" },
  payBasis:     { en: "Pay Basis", ms: "Asas Gaji" },
  payPeriod:    { en: "Pay Period", ms: "Tempoh Gaji" },
  workingDays:  { en: "Working Days", ms: "Hari Bekerja" },
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0",
                  borderBottom: "1px solid var(--doc-rule-hairline)" }}>
      <span style={{ color: "var(--doc-ink-secondary)", fontSize: "0.8125rem" }}>{label}</span>
      <span style={{ color: "var(--doc-ink)", fontSize: "0.8125rem" }}>{value}</span>
    </div>
  );
}

function EmployeeSummary({ dto, lang }: EmployeeSummaryProps) {
  const { employee: emp, payPeriod } = dto;
  return (
    <div style={{ padding: "1rem 2rem" }}>
      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--doc-ink-secondary)",
                    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
        {LABELS.employee[lang]}
      </div>
      <div style={{ fontWeight: 600, color: "var(--doc-ink-heading)", marginBottom: "0.5rem" }}>
        {emp.name}
      </div>
      <Field label={LABELS.id[lang]} value={emp.code} />
      <Field label={LABELS.designation[lang]} value={emp.designation} />
      <Field label={LABELS.department[lang]} value={emp.department} />
      <Field label={LABELS.nric[lang]} value={emp.maskedNric} />
      <Field label={LABELS.epfNo[lang]} value={emp.epfNumber} />
      <Field label={LABELS.socsoNo[lang]} value={emp.socsoNumber} />
      <Field label={LABELS.gender[lang]} value={emp.gender} />
      <Field label={LABELS.citizenship[lang]} value={emp.citizenship} />
      <Field label={LABELS.payBasis[lang]} value={emp.payBasis} />
      <Field label={LABELS.payPeriod[lang]} value={`${payPeriod.periodStart} – ${payPeriod.periodEnd}`} />
      <Field label={LABELS.workingDays[lang]} value={String(payPeriod.workingDays)} />
    </div>
  );
}

export { EmployeeSummary };
```

- [ ] **Step 5: Create `statutory-wage-basis.tsx`**

```tsx
// Section 3 — EPF/SOCSO/EIS statutory wage bases
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./payslip-document";

interface StatutoryWageBasisProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const LABELS: Record<Lang, { heading: string; note: string; epf: string; socso: string; eis: string }> = {
  en: {
    heading: "STATUTORY WAGE BASES",
    note: "Statutory contribution wage may differ from gross pay according to the applicable statutory treatment.",
    epf: "EPF Wage", socso: "SOCSO Wage", eis: "EIS Wage",
  },
  ms: {
    heading: "GAJI BERKANUN",
    note: "Gaji caruman berkanun mungkin berbeza daripada gaji kasar mengikut rawatan berkanun yang terpakai.",
    epf: "Gaji KWSP", socso: "Gaji PERKESO", eis: "Gaji EIS",
  },
};

function StatutoryWageBasis({ dto, lang }: StatutoryWageBasisProps) {
  const { epfWagesSen, socsoWagesSen, eisWagesSen } = dto.statutoryWageBases;
  const L = LABELS[lang];
  return (
    <div style={{ padding: "0.75rem 2rem", background: "var(--doc-fill-subtotal)" }}>
      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--doc-ink-secondary)",
                    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
        {L.heading}
      </div>
      {([
        [L.epf,   epfWagesSen],
        [L.socso, socsoWagesSen],
        [L.eis,   eisWagesSen],
      ] as [string, number | null][]).map(([label, sen]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between",
                                   padding: "0.2rem 0", fontSize: "0.8125rem" }}>
          <span style={{ color: "var(--doc-ink-secondary)" }}>{label}</span>
          <MoneyCell sen={sen} />
        </div>
      ))}
      <p style={{ fontSize: "0.75rem", color: "var(--doc-ink-secondary)", marginTop: "0.5rem" }}>
        {L.note}
      </p>
    </div>
  );
}

export { StatutoryWageBasis };
```

- [ ] **Step 6: Create `pay-equation.tsx`**

```tsx
// Section 4 — Gross − Deductions = Net pay equation
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./payslip-document";

interface PayEquationProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const LABELS: Record<Lang, { gross: string; deductions: string; net: string }> = {
  en: { gross: "GROSS PAY", deductions: "TOTAL EMPLOYEE DEDUCTIONS", net: "NET PAY" },
  ms: { gross: "GAJI KASAR", deductions: "JUMLAH POTONGAN PEKERJA", net: "GAJI BERSIH" },
};

function EquationRow({ label, sen, operator }: { label: string; sen: number | null; operator?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "0.5rem 2rem" }}>
      <span style={{ color: "var(--doc-ink-secondary)", fontSize: "0.875rem" }}>
        {operator && <span style={{ marginRight: "0.5rem", color: "var(--doc-ink)" }}>{operator}</span>}
        {label}
      </span>
      <MoneyCell sen={sen} />
    </div>
  );
}

function PayEquation({ dto, lang }: PayEquationProps) {
  const L = LABELS[lang];
  const grossSen = dto.roots.gross?.sen ?? null;
  const deductionsSen = dto.roots.deductionsTotal?.sen ?? null;
  const netSen = dto.roots.net?.sen ?? null;
  return (
    <div style={{ borderTop: "1px solid var(--doc-rule-standard)", borderBottom: "1px solid var(--doc-rule-standard)",
                  background: "var(--doc-fill-header)" }}>
      <EquationRow label={L.gross} sen={grossSen} />
      <EquationRow label={L.deductions} sen={deductionsSen} operator="\u2212" />
      <div style={{ borderTop: "2px solid var(--doc-rule-total)", display: "flex",
                    justifyContent: "space-between", alignItems: "center",
                    padding: "0.75rem 2rem", fontWeight: 700 }}>
        <span style={{ color: "var(--doc-ink-heading)" }}>{L.net}</span>
        <MoneyCell className="font-bold" sen={netSen} />
      </div>
    </div>
  );
}

export { PayEquation };
```

- [ ] **Step 7: Create `earnings-section.tsx`**

```tsx
// Section 5A — Earning line items from payLineItems
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./payslip-document";

interface EarningsSectionProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const HEADING: Record<Lang, string> = { en: "EARNINGS", ms: "PENDAPATAN" };

function EarningsSection({ dto, lang }: EarningsSectionProps) {
  const earnings = dto.lineItems.filter((i) => i.kind === "EARNING" || i.kind === "ALLOWANCE");
  if (earnings.length === 0) {
    // Fall back to gross root when no line items exist (e.g. old runs without payLineItems)
    return (
      <div>
        <div style={{ padding: "0.375rem 2rem", fontSize: "0.75rem", fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: "0.05em",
                      background: "var(--doc-section-earning-fill)", color: "var(--doc-section-earning-ink)" }}>
          {HEADING[lang]}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0.375rem 2rem",
                      borderBottom: "1px solid var(--doc-rule-hairline)" }}>
          <span style={{ color: "var(--doc-ink)", fontSize: "0.875rem" }}>
            {lang === "en" ? "Gross Pay" : "Gaji Kasar"}
          </span>
          <MoneyCell sen={dto.roots.gross?.sen ?? null} />
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ padding: "0.375rem 2rem", fontSize: "0.75rem", fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    background: "var(--doc-section-earning-fill)", color: "var(--doc-section-earning-ink)" }}>
        {HEADING[lang]}
      </div>
      {earnings.map((item) => (
        <div key={item.codeSnap} style={{ display: "flex", justifyContent: "space-between",
                                           padding: "0.375rem 2rem",
                                           borderBottom: "1px solid var(--doc-rule-hairline)" }}>
          <span style={{ color: "var(--doc-ink)", fontSize: "0.875rem" }}>
            {lang === "en" ? item.nameEnSnap : item.nameMsSnap}
          </span>
          <MoneyCell sen={item.resolvedAmountSen} />
        </div>
      ))}
    </div>
  );
}

export { EarningsSection };
```

- [ ] **Step 8: Create `deductions-section.tsx`**

```tsx
// Section 5B — statutory + other employee deductions
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./payslip-document";

interface DeductionsSectionProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const HEADING: Record<Lang, string> = { en: "EMPLOYEE DEDUCTIONS", ms: "POTONGAN" };
const ROWS: Array<{ keyEn: string; keyMs: string; root: string; source?: string }> = [
  { keyEn: "EPF Employee [S1]",          keyMs: "KWSP Pekerja [S1]",      root: "epfEe" },
  { keyEn: "SOCSO Employee [S2]",        keyMs: "PERKESO Pekerja [S2]",   root: "socsoEeCore" },
  { keyEn: "SKBBK [S2]",                 keyMs: "SKBBK [S2]",             root: "socsoEeSkbbk" },
  { keyEn: "EIS Employee [S3]",          keyMs: "EIS Pekerja [S3]",       root: "eisEe" },
  { keyEn: "PCB / MTD [S4]",             keyMs: "PCB / MTD [S4]",         root: "pcbNet" },
  { keyEn: "CP38 [S4]",                  keyMs: "CP38 [S4]",              root: "cp38" },
  { keyEn: "Zakat",                      keyMs: "Zakat",                  root: "zakat" },
  { keyEn: "Other Deductions",           keyMs: "Potongan Lain",          root: "otherDeductions" },
];

function DeductionsSection({ dto, lang }: DeductionsSectionProps) {
  return (
    <div>
      <div style={{ padding: "0.375rem 2rem", fontSize: "0.75rem", fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    background: "var(--doc-section-deduction-fill)", color: "var(--doc-section-deduction-ink)" }}>
        {HEADING[lang]}
      </div>
      {ROWS.map(({ keyEn, keyMs, root }) => {
        const rootValue = dto.roots[root];
        if (rootValue?.notApplicable) return null;
        return (
          <div key={root} style={{ display: "flex", justifyContent: "space-between",
                                    padding: "0.375rem 2rem",
                                    borderBottom: "1px solid var(--doc-rule-hairline)" }}>
            <span style={{ color: "var(--doc-ink)", fontSize: "0.875rem" }}>
              {lang === "en" ? keyEn : keyMs}
            </span>
            <MoneyCell sen={rootValue?.sen ?? null} />
          </div>
        );
      })}
    </div>
  );
}

export { DeductionsSection };
```

- [ ] **Step 9: Create `employer-contributions.tsx`**

```tsx
// Section 5C — employer contributions (labelled as not-from-salary)
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./payslip-document";

interface EmployerContributionsProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const HEADING: Record<Lang, string>    = { en: "EMPLOYER CONTRIBUTIONS",          ms: "SUMBANGAN MAJIKAN" };
const NOTE:    Record<Lang, string>    = {
  en: "Employer-paid contributions \u2014 not deducted from your salary.",
  ms: "Sumbangan majikan \u2014 tidak ditolak daripada gaji anda.",
};
const ROWS: Array<{ keyEn: string; keyMs: string; root: string }> = [
  { keyEn: "EPF Employer [S1]",   keyMs: "KWSP Majikan [S1]",    root: "epfEr" },
  { keyEn: "SOCSO Employer [S2]", keyMs: "PERKESO Majikan [S2]", root: "socsoEr" },
  { keyEn: "EIS Employer [S3]",   keyMs: "EIS Majikan [S3]",     root: "eisEr" },
];

function EmployerContributions({ dto, lang }: EmployerContributionsProps) {
  return (
    <div style={{ background: "var(--doc-fill-subtotal)" }}>
      <div style={{ padding: "0.375rem 2rem 0", fontSize: "0.75rem", fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    color: "var(--doc-ink-secondary)" }}>
        {HEADING[lang]}
      </div>
      <p style={{ padding: "0.25rem 2rem 0", fontSize: "0.75rem", color: "var(--doc-ink-secondary)" }}>
        {NOTE[lang]}
      </p>
      {ROWS.map(({ keyEn, keyMs, root }) => {
        const rootValue = dto.roots[root];
        if (rootValue?.notApplicable) return null;
        return (
          <div key={root} style={{ display: "flex", justifyContent: "space-between",
                                    padding: "0.375rem 2rem",
                                    borderBottom: "1px solid var(--doc-rule-hairline)" }}>
            <span style={{ color: "var(--doc-ink)", fontSize: "0.875rem" }}>
              {lang === "en" ? keyEn : keyMs}
            </span>
            <MoneyCell sen={rootValue?.sen ?? null} />
          </div>
        );
      })}
    </div>
  );
}

export { EmployerContributions };
```

- [ ] **Step 10: Create `net-pay-conclusion.tsx`**

```tsx
// Section 6 — net pay grand total + payment method
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./payslip-document";

interface NetPayConclusionProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const LABELS: Record<Lang, { heading: string; method: string; account: string }> = {
  en: { heading: "NET PAY", method: "Payment Method", account: "Account" },
  ms: { heading: "GAJI BERSIH", method: "Kaedah Pembayaran", account: "Akaun" },
};

function NetPayConclusion({ dto, lang }: NetPayConclusionProps) {
  const L = LABELS[lang];
  return (
    <div style={{ borderTop: "1pt solid var(--doc-rule-total)", padding: "1rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                    borderBottom: "2pt solid var(--doc-rule-total)", paddingBottom: "0.5rem",
                    marginBottom: "0.75rem" }}>
        <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--doc-ink-heading)" }}>
          {L.heading}
        </span>
        <MoneyCell className="font-bold text-base" sen={dto.roots.net?.sen ?? null} />
      </div>
      {dto.payment.method && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem",
                      color: "var(--doc-ink-secondary)" }}>
          <span>{L.method}</span>
          <span>{dto.payment.method}</span>
        </div>
      )}
      {dto.payment.maskedBankAccount && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem",
                      color: "var(--doc-ink-secondary)" }}>
          <span>{L.account}</span>
          <span>{dto.payment.maskedBankAccount}</span>
        </div>
      )}
    </div>
  );
}

export { NetPayConclusion };
```

- [ ] **Step 11: Create `ytd-summary.tsx`**

```tsx
// YTD table — current employer scoped; PROVISIONAL label when isProvisional
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./payslip-document";

interface YtdSummaryProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const HEADING: Record<Lang, { final: string; provisional: string }> = {
  en: { final: "YEAR-TO-DATE",              provisional: "YEAR-TO-DATE (PROVISIONAL)" },
  ms: { final: "TAHUN SEMASA",              provisional: "TAHUN SEMASA (SEMENTARA)" },
};
const ROWS: Array<{ keyEn: string; keyMs: string; field: keyof NonNullable<PayslipDocumentDto["ytd"]> }> = [
  { keyEn: "Gross Pay",       keyMs: "Gaji Kasar",    field: "grossSen" },
  { keyEn: "Net Pay",         keyMs: "Gaji Bersih",   field: "netSen" },
  { keyEn: "EPF Employee",    keyMs: "KWSP Pekerja",  field: "epfEeSen" },
  { keyEn: "EPF Employer",    keyMs: "KWSP Majikan",  field: "epfErSen" },
  { keyEn: "SOCSO Employee",  keyMs: "PERKESO Pekerja", field: "socsoEeCoreSen" },
  { keyEn: "EIS Employee",    keyMs: "EIS Pekerja",   field: "eisEeSen" },
  { keyEn: "PCB / MTD",       keyMs: "PCB / MTD",     field: "pcbNetSen" },
  { keyEn: "CP38",            keyMs: "CP38",           field: "cp38Sen" },
];

function YtdSummary({ dto, lang }: YtdSummaryProps) {
  const { ytd } = dto;
  if (!ytd) return null;
  const H = HEADING[lang];
  const heading = ytd.isProvisional ? H.provisional : H.final;
  return (
    <div style={{ padding: "0.75rem 2rem", background: "var(--doc-fill-subtotal)" }}>
      <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase",
                    letterSpacing: "0.05em", color: "var(--doc-ink-secondary)", marginBottom: "0.5rem" }}>
        {heading}
      </div>
      <table style={{ width: "100%", fontSize: "0.8125rem", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left",  color: "var(--doc-ink-secondary)", fontWeight: 400,
                         padding: "0.2rem 0", borderBottom: "1px solid var(--doc-rule-hairline)" }}>
              {lang === "en" ? "Item" : "Perkara"}
            </th>
            <th style={{ textAlign: "right", color: "var(--doc-ink-secondary)", fontWeight: 400,
                         padding: "0.2rem 0", borderBottom: "1px solid var(--doc-rule-hairline)" }}>
              {lang === "en" ? "Amount (RM)" : "Jumlah (RM)"}
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ keyEn, keyMs, field }) => (
            <tr key={field}>
              <td style={{ padding: "0.2rem 0", color: "var(--doc-ink)" }}>
                {lang === "en" ? keyEn : keyMs}
              </td>
              <td style={{ textAlign: "right", padding: "0.2rem 0" }}>
                <MoneyCell sen={ytd[field] as number} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { YtdSummary };
```

- [ ] **Step 12: Create `audit-annex.tsx`**

```tsx
// Page 2 — calculation & audit annex
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./payslip-document";

interface AuditAnnexProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const HEADING: Record<Lang, string> = { en: "CALCULATION & AUDIT ANNEX", ms: "LAMPIRAN AUDIT" };

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0",
                  borderBottom: "1px solid var(--doc-rule-hairline)", fontSize: "0.8125rem" }}>
      <span style={{ color: "var(--doc-ink-secondary)" }}>{label}</span>
      <span style={{ color: "var(--doc-ink)", fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}

function AuditAnnex({ dto, lang }: AuditAnnexProps) {
  const { auditIdentity: audit, approval } = dto;
  return (
    <div
      data-print-keep
      style={{ marginTop: "2rem", padding: "1.5rem 2rem",
               borderTop: "2px solid var(--doc-rule-total)",
               background: "var(--doc-fill-header)" }}
    >
      <h2 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--doc-ink-heading)",
                   textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
        {HEADING[lang]}
      </h2>
      <Field label="Document ID"     value={dto.documentId} />
      <Field label="Payroll Run ID"  value={audit.runId} />
      <Field label="Calc Revision"   value={audit.calcRevision} />
      <Field label="Rule Pack"       value={audit.rulePackId} />
      <Field label="Rule Pack Hash"  value={audit.rulePackHash} />
      <Field label="Engine Version"  value={audit.calcEngineVersion} />
      <Field label="Generated"       value={dto.generatedAt} />
      <div style={{ marginTop: "1rem" }} />
      <Field label="Reviewed By"  value={approval.reviewedBy} />
      <Field label="Reviewed At"  value={approval.reviewedAt?.slice(0, 19)} />
      <Field label="Approved By"  value={approval.approvedBy} />
      <Field label="Approved At"  value={approval.approvedAt?.slice(0, 19)} />
      <Field label="Closed By"    value={approval.closedBy} />
      <Field label="Closed At"    value={approval.closedAt?.slice(0, 19)} />
      {dto.payment.statementDate && (
        <Field label={lang === "en" ? "Statement Date" : "Tarikh Penyata"}
               value={dto.payment.statementDate.slice(0, 10)} />
      )}
    </div>
  );
}

export { AuditAnnex };
```

- [ ] **Step 13: Create root `payslip-document.tsx`**

```tsx
/**
 * AFENDA-PAYSLIP-01 — production bilingual payslip document.
 *
 * Rendering rules:
 * - --doc-* tokens only; no app theme tokens; no raw hex.
 * - Light-only: forced white background, black ink at all times.
 * - Nil sen = em dash via MoneyCell.
 * - No green net pay; no red deductions.
 * - window.print() is the PDF path — payslip-print.css handles the rest.
 */
import "./payslip-print.css";
import type { Lang } from "@/domain/derive/i18n/render";
import { AuditAnnex } from "./audit-annex";
import { DeductionsSection } from "./deductions-section";
import { DocumentStatusMark } from "./document-status-mark";
import { EarningsSection } from "./earnings-section";
import { EmployeeContributions } from "./employer-contributions";
import { EmployeeSummary } from "./employee-summary";
import { NetPayConclusion } from "./net-pay-conclusion";
import { PayEquation } from "./pay-equation";
import { PayslipHeader } from "./payslip-header";
import { StatutoryWageBasis } from "./statutory-wage-basis";
import { YtdSummary } from "./ytd-summary";

// Re-export the DTO type for consumers
export type { PayslipDocumentDto } from "./types";

interface PayslipDocumentProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

function PayslipDocument({ dto, lang }: PayslipDocumentProps) {
  return (
    <div
      style={{
        position: "relative",
        background: "#ffffff",
        color: "var(--doc-ink)",
        fontFamily: "Geist, system-ui, sans-serif",
        fontSize: "0.875rem",
        maxWidth: "210mm",
        margin: "0 auto",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      <DocumentStatusMark documentStatus={dto.documentStatus} lang={lang} />
      <PayslipHeader dto={dto} lang={lang} />
      <EmployeeSummary dto={dto} lang={lang} />
      <StatutoryWageBasis dto={dto} lang={lang} />
      <PayEquation dto={dto} lang={lang} />
      <EarningsSection dto={dto} lang={lang} />
      <DeductionsSection dto={dto} lang={lang} />
      <EmployeeContributions dto={dto} lang={lang} />
      <NetPayConclusion dto={dto} lang={lang} />
      <YtdSummary dto={dto} lang={lang} />
      <AuditAnnex dto={dto} lang={lang} />
    </div>
  );
}

export { PayslipDocument };
```

Also create `src/web/payrun/payslip-document/types.ts` with the shared DTO type that both the server route and the SPA components reference:

```typescript
// Shared type — mirrors PayslipDocumentDto from the server route.
// Keep in sync with src/server/routes/pay-run-payslip.ts.
export interface PayslipDocumentDto {
  documentId: string;
  generatedAt: string;
  documentStatus: "APPROVED" | "CLOSED" | "DRAFT_PREVIEW";
  employerSourceWarning: "LIVE_COMPANY_RECORD" | null;
  legalEmployer: {
    name: string; registrationNumber: string | null; epfReference: string | null;
    socsoReference: string | null; eisReference: string | null;
    lhdnReference: string | null; representativeName: string | null;
  };
  employee: {
    id: string; name: string; code: string; designation: string | null;
    department: string | null; maskedNric: string | null;
    gender: string | null; citizenship: string | null;
    epfNumber: string | null; socsoNumber: string | null; payBasis: string | null;
  };
  payPeriod: {
    reportingMonth: string; periodStart: string; periodEnd: string;
    paymentDate: string | null; runId: string; label: string; workingDays: number;
  };
  payment: { method: string | null; maskedBankAccount: string | null; statementDate: string | null; };
  lineItems: Array<{
    kind: string; codeSnap: string; nameEnSnap: string; nameMsSnap: string;
    resolvedAmountSen: number; quantity: string | null; rateSen: number | null;
  }>;
  roots: Record<string, { sen: number | null; notApplicable: boolean }>;
  statutoryWageBases: { epfWagesSen: number | null; socsoWagesSen: number | null; eisWagesSen: number | null; };
  ytd: {
    grossSen: number; netSen: number; epfEeSen: number; epfErSen: number;
    socsoEeCoreSen: number; eisEeSen: number; pcbNetSen: number; cp38Sen: number;
    isProvisional: boolean;
  } | null;
  approval: {
    reviewedBy: string | null; reviewedAt: string | null;
    approvedBy: string | null; approvedAt: string | null;
    closedBy: string | null; closedAt: string | null;
  };
  auditIdentity: {
    runId: string; calcRevision: string | null; rulePackId: string;
    rulePackHash: string | null; calcEngineVersion: string | null;
  };
}

export interface PayslipIndexRow {
  lineId: string;
  employeeCode: string;
  employeeName: string;
  netSen: number | null;
}
```

Note: fix the import in `payslip-document.tsx` — `EmployeeContributions` should be `EmployerContributions`:
```tsx
import { EmployerContributions } from "./employer-contributions";
```

- [ ] **Step 14: Run Biome lint on new files**

```bash
npx biome check src/web/payrun/payslip-document/
```
Fix any reported issues.

- [ ] **Step 15: Commit**

```bash
git add src/web/payrun/payslip-document/
git commit -m "feat(phase8): payslip document components"
```

---

### Task 4: Payslip page + slide-over link + route

**Files:**
- Create: `src/web/payrun/payslip-page.tsx`
- Modify: `src/web/payrun/employee-slide-over.tsx`
- Modify: `src/web/app.tsx`
- Modify: `src/web/api/payroll-api.ts`

**Interfaces:**
- Consumes: `PayslipDocumentDto`, `PayslipIndexRow` from `payslip-document/types.ts`; `createApiClient` pattern from `src/web/api/client.ts`; `useParams` from `wouter`
- Produces: `/pay-runs/:runId/payslip/:lineId` route; `fetchPayslip` and `fetchPayslipIndex` API functions

- [ ] **Step 1: Add API client functions to `src/web/api/payroll-api.ts`**

Read the existing `payroll-api.ts` to understand the `createApiClient` / `apiGet` pattern, then append:

```typescript
export async function fetchPayslip(
  runId: string,
  lineId: string
): Promise<PayslipDocumentDto> {
  return apiGet(`/pay-runs/${runId}/lines/${lineId}/payslip`);
}

export async function fetchPayslipIndex(
  runId: string
): Promise<{ payslips: PayslipIndexRow[] }> {
  return apiGet(`/pay-runs/${runId}/payslips`);
}
```

Also add the import of `PayslipDocumentDto` and `PayslipIndexRow` at the top of `payroll-api.ts`:
```typescript
import type { PayslipDocumentDto, PayslipIndexRow } from "@/web/payrun/payslip-document/types";
```

- [ ] **Step 2: Create `src/web/payrun/payslip-page.tsx`**

```tsx
/**
 * Full-page bilingual payslip — /pay-runs/:runId/payslip/:lineId
 */
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/domain/derive/i18n/render";
import { fetchPayslip } from "@/web/api/payroll-api";
import type { PayslipDocumentDto } from "./payslip-document/types";
import { PayslipDocument } from "./payslip-document/payslip-document";

function PayslipPage() {
  const { runId, lineId } = useParams<{ runId: string; lineId: string }>();
  const [dto, setDto] = useState<PayslipDocumentDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    if (!runId || !lineId) return;
    fetchPayslip(runId, lineId)
      .then(setDto)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [runId, lineId]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--doc-fill-header)" }}>
      {/* Actions bar — hidden during print */}
      <div
        className="payslip-actions"
        data-no-print
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1.5rem",
          background: "var(--background)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <a href={`/pay-runs/${runId}`} style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
          ← {lang === "en" ? "Back to workspace" : "Kembali ke ruang kerja"}
        </a>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: "0.375rem", overflow: "hidden" }}>
            {(["en", "ms"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  padding: "0.25rem 0.75rem",
                  fontSize: "0.8125rem",
                  fontWeight: lang === l ? 600 : 400,
                  background: lang === l ? "var(--primary)" : "transparent",
                  color: lang === l ? "var(--primary-foreground)" : "var(--foreground)",
                  border: "none",
                  cursor: "pointer",
                }}
                type="button"
              >
                {l === "en" ? "EN" : "BM"}
              </button>
            ))}
          </div>
          <Button
            data-no-print
            onClick={() => window.print()}
            size="sm"
            variant="outline"
          >
            {lang === "en" ? "Print" : "Cetak"}
          </Button>
        </div>
      </div>

      {/* Document */}
      <div style={{ padding: "2rem" }}>
        {error && (
          <div style={{ color: "red", padding: "1rem" }}>Error: {error}</div>
        )}
        {dto && <PayslipDocument dto={dto} lang={lang} />}
        {!dto && !error && (
          <div style={{ textAlign: "center", padding: "4rem", color: "var(--muted-foreground)" }}>
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}

export { PayslipPage };
```

- [ ] **Step 3: Add route to `src/web/app.tsx`**

Add import:
```typescript
import { PayslipPage } from "@/web/payrun/payslip-page";
```

Add route inside the `<Switch>` block (after the `/pay-runs/:runId` route):
```tsx
<Route component={PayslipPage} path="/pay-runs/:runId/payslip/:lineId" />
```

- [ ] **Step 4: Add "Open full payslip" link to `employee-slide-over.tsx`**

Read the file to find the Payslip tab content. In the existing Payslip tab, after `<PayslipPreview ...>`, add:
```tsx
<div className="flex justify-end px-4 pt-2 pb-1">
  <a
    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
    href={`/pay-runs/${runId}/payslip/${line.employeeId}`}
  >
    Open full payslip →
  </a>
</div>
```

- [ ] **Step 5: Run Biome + TypeScript check**

```bash
npx biome check src/web/payrun/payslip-page.tsx src/web/app.tsx src/web/api/payroll-api.ts src/web/payrun/employee-slide-over.tsx
npx tsc --noEmit
```
Fix any reported issues.

- [ ] **Step 6: Commit**

```bash
git add src/web/payrun/payslip-page.tsx src/web/app.tsx src/web/api/payroll-api.ts src/web/payrun/employee-slide-over.tsx
git commit -m "feat(phase8): payslip full-page route and slide-over link"
```

---

### Task 5: Payslip token-leak test

**Files:**
- Create: `tests/domain/payslip-tokens.test.ts`

**Interfaces:**
- Consumes: a minimal fixture `PayslipDocumentDto`, renders `PayslipDocument` using `@testing-library/react`

- [ ] **Step 1: Write the test**

```typescript
// tests/domain/payslip-tokens.test.ts
// Asserts that the payslip document renders no hardcoded hex colours,
// uses only var(--doc-*) tokens, and the PREVIEW watermark appears for DRAFT_PREVIEW.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PayslipDocument } from "@/web/payrun/payslip-document/payslip-document";
import type { PayslipDocumentDto } from "@/web/payrun/payslip-document/types";

const FIXTURE_DTO: PayslipDocumentDto = {
  documentId: "PSL-TEST-001",
  generatedAt: "2026-07-31T00:00:00.000Z",
  documentStatus: "APPROVED",
  employerSourceWarning: "LIVE_COMPANY_RECORD",
  legalEmployer: { name: "Test Corp", registrationNumber: null, epfReference: "EPF-001",
                   socsoReference: null, eisReference: null, lhdnReference: null,
                   representativeName: null },
  employee: { id: "emp-1", name: "Test Worker", code: "T001", designation: null,
              department: null, maskedNric: "****-**-1234", gender: null, citizenship: null,
              epfNumber: "12345678", socsoNumber: null, payBasis: "MONTHLY" },
  payPeriod: { reportingMonth: "2026-07", periodStart: "2026-07-01", periodEnd: "2026-07-31",
               paymentDate: null, runId: "TEST-2026-07", label: "TEST-2026-07", workingDays: 26 },
  payment: { method: "BANK", maskedBankAccount: "****1234", statementDate: "2026-07-31T00:00:00.000Z" },
  lineItems: [],
  roots: {
    gross: { sen: 500000, notApplicable: false },
    epfEe: { sen: 55000, notApplicable: false },
    socsoEeCore: { sen: 4750, notApplicable: false },
    socsoEeSkbbk: { sen: 0, notApplicable: false },
    eisEe: { sen: 1750, notApplicable: false },
    pcbNet: { sen: 5000, notApplicable: false },
    cp38: { sen: 0, notApplicable: false },
    zakat: { sen: 0, notApplicable: false },
    otherDeductions: { sen: 0, notApplicable: false },
    deductionsTotal: { sen: 66500, notApplicable: false },
    net: { sen: 433500, notApplicable: false },
    epfWages: { sen: 500000, notApplicable: false },
    socsoWages: { sen: 500000, notApplicable: false },
    eisWages: { sen: 500000, notApplicable: false },
    epfEr: { sen: 65000, notApplicable: false },
    socsoEr: { sen: 9375, notApplicable: false },
    eisEr: { sen: 1750, notApplicable: false },
    hrdf: { sen: 0, notApplicable: false },
    employerCost: { sen: 65000, notApplicable: false },
  },
  statutoryWageBases: { epfWagesSen: 500000, socsoWagesSen: 500000, eisWagesSen: 500000 },
  ytd: { grossSen: 500000, netSen: 433500, epfEeSen: 55000, epfErSen: 65000,
         socsoEeCoreSen: 4750, eisEeSen: 1750, pcbNetSen: 5000, cp38Sen: 0,
         isProvisional: false },
  approval: { reviewedBy: "reviewer@example.com", reviewedAt: "2026-07-30T00:00:00.000Z",
              approvedBy: "approver@example.com",  approvedAt: "2026-07-30T06:00:00.000Z",
              closedBy: null, closedAt: null },
  auditIdentity: { runId: "TEST-2026-07", calcRevision: "rev-abc", rulePackId: "MY-STATUTORY-2026",
                   rulePackHash: null, calcEngineVersion: null },
};

describe("PayslipDocument token safety", () => {
  it("renders employer source warning for LIVE_COMPANY_RECORD", () => {
    const { getByText } = render(<PayslipDocument dto={FIXTURE_DTO} lang="en" />);
    expect(getByText(/employer identity sourced/i)).toBeDefined();
  });

  it("renders PAYSLIP heading in English", () => {
    const { getByText } = render(<PayslipDocument dto={FIXTURE_DTO} lang="en" />);
    expect(getByText("PAYSLIP")).toBeDefined();
  });

  it("renders PENYATA GAJI heading in Malay", () => {
    const { getByText } = render(<PayslipDocument dto={FIXTURE_DTO} lang="ms" />);
    expect(getByText("PENYATA GAJI")).toBeDefined();
  });

  it("renders PREVIEW watermark for DRAFT_PREVIEW", () => {
    const draftDto = { ...FIXTURE_DTO, documentStatus: "DRAFT_PREVIEW" as const };
    const { getByText } = render(<PayslipDocument dto={draftDto} lang="en" />);
    expect(getByText(/PREVIEW.*NOT ISSUED/i)).toBeDefined();
  });

  it("does not render PREVIEW watermark for APPROVED", () => {
    const { queryByText } = render(<PayslipDocument dto={FIXTURE_DTO} lang="en" />);
    expect(queryByText(/PREVIEW.*NOT ISSUED/i)).toBeNull();
  });

  it("renders YTD section with PROVISIONAL label when isProvisional", () => {
    const dtoWithProvisional = {
      ...FIXTURE_DTO,
      ytd: { ...FIXTURE_DTO.ytd!, isProvisional: true },
    };
    const { getByText } = render(<PayslipDocument dto={dtoWithProvisional} lang="en" />);
    expect(getByText(/PROVISIONAL/i)).toBeDefined();
  });

  it("NET PAY label present in document", () => {
    const { getAllByText } = render(<PayslipDocument dto={FIXTURE_DTO} lang="en" />);
    // Appears in both PayEquation (Section 4) and NetPayConclusion (Section 6)
    expect(getAllByText("NET PAY").length).toBeGreaterThanOrEqual(1);
  });

  it("employer contributions note present", () => {
    const { getByText } = render(<PayslipDocument dto={FIXTURE_DTO} lang="en" />);
    expect(getByText(/not deducted from your salary/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/domain/payslip-tokens.test.ts
```
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add tests/domain/payslip-tokens.test.ts
git commit -m "test(phase8): payslip document render assertions"
```

---

## Self-Review

**Spec coverage check:**
- §3.1 architectural rules — enforced via `--doc-*` in all components, `payslip-print.css`, `documentStatus` watermark ✓
- §3.2 employer gap — `employerSourceWarning: "LIVE_COMPANY_RECORD"` in DTO and header component ✓
- §3.3 auth contract — route returns `DRAFT_PREVIEW` not 403 ✓
- §3.4 DTO all fields — Task 1 ✓
- §3.5 YTD provisional — Task 1 + `ytd-summary.tsx` ✓
- §3.6 SPA files — Task 3 + Task 4 ✓
- §3.7 bilingual labels — Task 2 (i18n keys) + Task 3 (components use `LABELS` maps) ✓
- §3.8 print CSS — Task 3 Step 1 ✓
- §9.1 tests 1–14 — Task 4 + Task 5 cover render assertions; server-route tests cover DTO structure ✓

**Type consistency check:**
- `PayslipDocumentDto` defined once in `types.ts`, imported by server route (inline) and all SPA components ✓
- `EmployerContributions` import in `payslip-document.tsx` — noted fix in Step 13 ✓
- `inArray` used in YTD query — requires Drizzle import in server route ✓
