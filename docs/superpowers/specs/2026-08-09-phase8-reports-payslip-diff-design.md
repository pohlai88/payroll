# Phase 8 — Reports, Bilingual Payslip & Run-Diff Design

**Date:** 2026-08-09  
**Status:** Approved for implementation  
**Scope:** SPA + server read facades only — no payroll engine changes, no new schema

---

## 1. Context

Phase 8 completes the remaining UI work listed in the README phase table:

| Workstream | Backend | SPA |
|---|---|---|
| Employee import | Done (Phase 4B) | Done (Phase 4B) |
| Reports | None | Placeholder (`EmptyState`) |
| Bilingual payslip | None | English-only quick preview in slide-over |
| Run-diff | `diffGraphs()` domain fn exists | None |

All three workstreams are presentation-only. The payroll engine (`src/domain/calc/`), statutory tables, and golden master must not be modified. Every figure displayed must come from the server — no client-side recalculation.

---

## 2. Approach: Layered Server Facades

Three independent read-facade route files are added to `src/server/routes/`. Each returns an immutable projection of already-computed data. No new Drizzle schema is required.

PDF generation uses `window.print()` with a CSS print stylesheet — no headless browser (Puppeteer/Playwright) in Phase 8. This keeps the Hono server lightweight for Phase 9 Vercel deployment.

---

## 3. Workstream A — Bilingual Production Payslip

### 3.1 Architectural rules (from `docs/architecture/payslip.md`)

- Presentation layer only — never recompute statutory figures
- `--doc-*` tokens exclusively; no app theme tokens; no raw hex
- Light-only document, print-safe, monochrome-safe
- Nil amount = `—` (em dash)
- No green net-pay box; no red deduction amounts
- Legal employer from `payLines.employeeSnapshot` / `companies` table, never from department
- YTD scoped to legal employer (not merged across group transfers)
- Bilingual: `renderLabel(label, lang)` from `src/domain/derive/i18n/render.ts` drives all labels
- Historical rendering must be stable — use payroll snapshot data, not current master data lookup

### 3.2 New server route — `src/server/routes/pay-run-payslip.ts`

**Endpoints:**

```
GET /v1/pay-runs/:runId/lines/:lineId/payslip
  Auth:   requirePayRunAccess(READ)
  Access: run status must be APPROVED or CLOSED (not DRAFT/REVIEWED)
  Returns: PayslipDocumentDto

GET /v1/pay-runs/:runId/payslips
  Auth:   requirePayRunAccess(READ)
  Returns: { payslips: PayslipIndexRow[] }
```

**`PayslipDocumentDto`** — assembled from existing tables, no new schema:

```typescript
interface PayslipDocumentDto {
  // Identity
  documentId: string;           // deterministic: "PSL-{runId}-{lineId}"
  generatedAt: string;          // ISO timestamp of this request
  documentStatus: "APPROVED" | "CLOSED" | "DRAFT_PREVIEW";

  // Legal employer (from companies + payRuns)
  legalEmployer: {
    name: string;
    registrationNumber: string | null;
    epfReference: string | null;
    socsoReference: string | null;
    eisReference: string | null;
    lhdnReference: string | null;
  };

  // Employee (from payLines.employeeSnapshot — immutable snapshot)
  employee: {
    id: string;
    name: string;
    code: string;
    designation: string | null;
    department: string | null;
    maskedNric: string | null;      // last 4 digits visible
    maskedBankAccount: string | null;
    epfNumber: string | null;
    socsoNumber: string | null;
  };

  // Pay period
  payPeriod: {
    reportingMonth: string;   // "YYYY-MM"
    runId: string;
    label: string;
  };

  // Earning line items from payLineItems (frozen nameEnSnap/nameMsSnap/resolvedAmountSen)
  // kindSnap IN ('EARNING', 'ALLOWANCE') — sorted by sortSnap
  lineItems: Array<{
    lineId: string;
    kind: string;            // kindSnap
    codeSnap: string;
    nameEnSnap: string;
    nameMsSnap: string;
    resolvedAmountSen: number;
    quantity: string | null;
    rateSen: number | null;
  }>;

  // All 19 sen roots from payLines (integer sen)
  roots: Record<string, { sen: number | null; notApplicable: boolean }>;

  // Statutory wage bases (explicit fields for document clarity)
  statutoryWageBases: {
    epfWagesSen: number | null;
    socsoWagesSen: number | null;
    eisWagesSen: number | null;
  };

  // YTD — sum of APPROVED + CLOSED runs same companyId + employmentId, same calendar year
  ytd: {
    grossSen: number;
    netSen: number;
    epfEeSen: number;
    epfErSen: number;
    socsoEeCoreSen: number;
    eisEeSen: number;
    pcbNetSen: number;
    cp38Sen: number;
  } | null;  // null when no prior approved runs in year

  // Approval provenance (from payRuns columns — reviewed/approved by Phase 6, closed by Phase 7)
  approval: {
    reviewedBy: string | null;
    reviewedAt: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    closedBy: string | null;
    closedAt: string | null;
  };

  // Audit identity
  auditIdentity: {
    runId: string;
    calcRevision: string | null;
  };
}

interface PayslipIndexRow {
  lineId: string;
  employeeCode: string;
  employeeName: string;
  netSen: number | null;
}
```

Access control: `DRAFT_PREVIEW` status is returned when the run is DRAFT/REVIEWED but the user still hits the endpoint (the SPA shows a watermark in that case). The route does not 403 on non-APPROVED runs — it returns `documentStatus: "DRAFT_PREVIEW"` so the full document can be previewed before approval.

### 3.3 New SPA files

**`src/web/payrun/payslip-page.tsx`** — full-page SPA route (`/pay-runs/:runId/payslip/:lineId`):
- Fetches `GET .../payslip`
- Renders `PayslipDocument` with a `lang` prop (`"en"` | `"ms"`)
- Lang toggle (`EN | BM`) top-right
- `Print` button calls `window.print()`
- Back navigation to the workspace
- No shell sidebar during print (hidden via print CSS)

**`src/web/payrun/payslip-document/`** — document component tree:

```
payslip-document.tsx          Root — receives PayslipDocumentDto + lang
payslip-header.tsx            Section 1: document ID + legal employer identity
employee-summary.tsx          Section 2: employee & payment summary
statutory-wage-basis.tsx      Section 3: EPF/SOCSO/EIS wage bases
pay-equation.tsx              Section 4: Gross − Deductions = Net display
earnings-section.tsx          Section 5A: earning lines from payLineItems (frozen nameEnSnap/nameMsSnap + resolvedAmountSen)
deductions-section.tsx        Section 5B: employee deduction lines
employer-contributions.tsx    Section 5C: employer contribution lines
net-pay-conclusion.tsx        Section 6: net pay grand total + payment method
ytd-summary.tsx               YTD table (current employer scoped)
audit-annex.tsx               Page 2: audit identity + approval provenance
document-status-mark.tsx      DRAFT / SPECIMEN watermark (when not APPROVED)
payslip-print.css             Print stylesheet
```

**`src/web/api/payroll-api.ts`** — add `fetchPayslip(runId, lineId)` and `fetchPayslipIndex(runId)`.

**`src/web/app.tsx`** — add:
```tsx
<Route path="/pay-runs/:runId/payslip/:lineId" component={PayslipPage} />
```

**`src/web/payrun/employee-slide-over.tsx`** — upgrade the existing Payslip tab: keep `PayslipPreview` for the quick view, add an "Open full payslip →" link pointing to `/pay-runs/:runId/payslip/:lineId`.

**`src/web/payrun/payslip-preview.tsx`** — unchanged (still used in the slide-over quick view).

### 3.4 Bilingual label convention

All section headings and field labels in the document components use `renderLabel`:

```tsx
import { renderLabel, type Lang } from "@/domain/derive/i18n/render";

// Example in payslip-header.tsx:
<h1>{lang === "en" ? "PAYSLIP" : "PENYATA GAJI"}</h1>
```

Where a label key exists in `en.ts` / `ms.ts`, use `renderLabel`. Where section headings do not have existing domain keys, add them to the i18n dictionaries as part of this phase (keys prefixed `doc.payslip.*`).

### 3.5 Print stylesheet rules

`payslip-print.css` must implement (per `docs/architecture/payslip.md`):

```css
@media print {
  :root, .dark { color-scheme: light; }
  html, body { background: white !important; color: black !important; }
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .shell-sidebar, .shell-topbar, .payslip-actions { display: none !important; }
  table, figure, [data-print-keep], [data-evidence-block] { break-inside: avoid; }
  h1, h2, h3, h4, [data-group-header] { break-after: avoid; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
}
```

---

## 4. Workstream B — Run-Diff UI

### 4.1 Domain

`diffGraphs(from, to): NodeDiff[]` exists in `src/domain/derive/diff.ts`. It compares two `DerivationGraph` objects and returns typed diff entries: `ADDED`, `REMOVED`, `VALUE`, `STRUCTURE`, `CITATION`.

The workspace DTO already carries `previousRoots` and `variance` per employee (root-level diff). The new run-diff UI adds the **graph-level** explanation layer.

### 4.2 New server route — `src/server/routes/pay-run-diff.ts`

```
GET /v1/pay-runs/:runId/lines/:lineId/diff
  Auth:   requirePayRunAccess(READ)
  Returns: RunLineDiffDto
```

**`RunLineDiffDto`:**

```typescript
interface RunLineDiffDto {
  runId: string;
  lineId: string;
  priorRunId: string | null;   // null when no linkedRunId on the run
  diffs: NodeDiffRow[];
}

interface NodeDiffRow {
  d: "ADDED" | "REMOVED" | "VALUE" | "STRUCTURE" | "CITATION";
  id: string;           // node ID (semantic, e.g. "line.epf.ee")
  label: string;        // renderLabel(node.label, "en") — server renders EN label
  fromValue: string | null;   // formatted string or null
  toValue: string | null;
  deltaSen: number | null;    // for VALUE diffs on money nodes
  addedRefs: string[];        // for STRUCTURE diffs
  removedRefs: string[];
}
```

Implementation: load `payLines.trace` JSONB for the current line and the same employee's line on `payRuns.linkedRunId`. The `trace` column is "the typed trace the payslip annex renders" — it stores the full derivation graph. Call `diffGraphs(from, to)`. Map `NodeDiff[]` to `NodeDiffRow[]` (rendering labels server-side with `renderLabel(..., "en")` — bilingual diff is a future enhancement).

### 4.3 SPA — Run-level diff (workspace header)

**`src/web/payrun/run-diff-panel.tsx`** — new component:
- Reads `view.lines` (already loaded in workspace)
- Filters to employees with `variance?.hasChanges === true`
- Renders a compact table: employee name, `DeltaBadge` for net direction, changed root keys as chips
- "No changes from prior run" empty state when all employees match
- Placed below the `RunHeader` as a collapsible panel, toggled by a "Compare" button added to `run-header.tsx`

**`run-header.tsx`** changes:
- Add a `Compare` button (only shown when `view.lines.some(l => l.previousRoots !== null)`)
- Add `onCompare` prop and `showCompare` state

### 4.4 SPA — Employee-level diff (slide-over tab)

**`src/web/payrun/employee-diff.tsx`** — new component:
- Props: `runId: string`, `lineId: string`
- Fetches `GET .../diff` on mount
- Groups `NodeDiffRow[]` by `d` kind
- Renders each group in a section with a count badge
- `VALUE` rows: old value → new value + `DeltaBadge` if `deltaSen` present
- `ADDED` / `REMOVED`: node label + muted "(added)" / "(removed)" annotation
- `STRUCTURE` / `CITATION`: node label + change summary

**`employee-slide-over.tsx`** changes:
- Add "Diff" as a 4th tab (after Line, Derivation, Payslip)
- Only rendered when `line.previousRoots !== null`
- Lazy-fetches on tab activation

**`src/web/api/payroll-api.ts`** — add `fetchLineDiff(runId, lineId)`.

---

## 5. Workstream C — Reports Portal

### 5.1 New server routes — `src/server/routes/pay-run-reports.ts`

```
GET /v1/pay-runs/:runId/reports/payment-register
  Auth:   requirePayRunAccess(READ)
  Returns: PaymentRegisterDto

GET /v1/pay-runs/:runId/reports/statutory-summary
  Auth:   requirePayRunAccess(READ)
  Returns: StatutorySummaryDto

GET /v1/pay-runs/:runId/reports/exception-report
  Auth:   requirePayRunAccess(READ)
  Returns: ExceptionReportDto
```

**`PaymentRegisterDto`:**
```typescript
interface PaymentRegisterDto {
  runId: string;
  reportingMonth: string;
  companyName: string;
  rows: Array<{
    lineId: string;
    employeeCode: string;
    employeeName: string;
    netSen: number | null;
    paymentState: string | null;   // from linePayments.state
    paymentRef: string | null;
    maskedBankAccount: string | null;
  }>;
  totalNetSen: number;
}
```

**`StatutorySummaryDto`:**
```typescript
interface StatutorySummaryDto {
  runId: string;
  reportingMonth: string;
  companyName: string;
  employeeCount: number;
  epfEeTotalSen: number;
  epfErTotalSen: number;
  socsoEeCoreTotalSen: number;
  socsoErTotalSen: number;
  eisEeTotalSen: number;
  eisErTotalSen: number;
  pcbNetTotalSen: number;
  cp38TotalSen: number;
  grossTotalSen: number;
  netTotalSen: number;
}
```

**`ExceptionReportDto`:**
```typescript
interface ExceptionReportDto {
  runId: string;
  reportingMonth: string;
  companyName: string;
  findings: Array<{
    id: string;
    severity: string;
    status: string;
    title: string;
    detail: string;
    lineId: string | null;
    employeeName: string | null;
  }>;
}
```

### 5.2 New server route — `src/server/routes/employee-ea.ts`

```
GET /v1/employees/:employeeId/ea/:year
  Auth:   Bearer JWT; user must have READ access to at least one run for the employee's company
  Returns: FormEaDto
```

**`FormEaDto`:**
```typescript
interface FormEaDto {
  year: number;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  companyName: string;
  // Totals from all APPROVED + CLOSED runs in the year
  grossSen: number;
  netSen: number;
  epfEeSen: number;
  socsoEeCoreSen: number;
  eisEeSen: number;
  pcbNetSen: number;
  cp38Sen: number;
  runCount: number;
  months: string[];   // ["YYYY-MM", ...]
  disclaimer: string; // "This is an annual remuneration summary. File C.P.8A via LHDN e-Filing."
}
```

Only `APPROVED` and `CLOSED` runs are included in the rollup. `DRAFT` and `REVIEWED` runs are excluded.

### 5.3 SPA — `src/web/reports/`

**`reports-page.tsx`** — rebuilt as a portal:
- Layout: two-column (sidebar report type list + main viewer)
- Report types: Payment Register, Statutory Summary, Exception Report, Form EA (Annual)
- URL-driven state: `/reports?type=payment-register&runId=<id>` (deep-linkable)
- Run picker dropdown (calls `GET /v1/pay-runs` filtered to scope company) for run-scoped reports
- Employee + year pickers for Form EA

**`src/web/reports/payment-register.tsx`** — table with print button  
**`src/web/reports/statutory-summary.tsx`** — summary card grid  
**`src/web/reports/exception-report.tsx`** — findings table (reuses finding severity chips from `findings-panel.tsx`)  
**`src/web/reports/form-ea.tsx`** — annual summary card with clear disclaimer

**`src/web/api/payroll-api.ts`** — add fetch functions for all four report endpoints.

### 5.4 Workspace deep-link

`run-header.tsx` gets a Reports icon button (link to `/reports?type=payment-register&runId={runId}`). Not a new tab — just a navigation shortcut.

---

## 6. SPA Routing Changes

In `src/web/app.tsx`, add one new route:

```tsx
<Route path="/pay-runs/:runId/payslip/:lineId" component={PayslipPage} />
```

The reports page already has a route (`/reports`). The `/reports` route is rebuilt in-place — no new route entry needed. The diff tab and run-diff panel are sub-components of the existing workspace route — no new routes.

---

## 7. API Client Changes (`src/web/api/payroll-api.ts`)

New fetch functions:
- `fetchPayslip(runId, lineId): Promise<PayslipDocumentDto>`
- `fetchPayslipIndex(runId): Promise<{ payslips: PayslipIndexRow[] }>`
- `fetchLineDiff(runId, lineId): Promise<RunLineDiffDto>`
- `fetchPaymentRegister(runId): Promise<PaymentRegisterDto>`
- `fetchStatutorySummary(runId): Promise<StatutorySummaryDto>`
- `fetchExceptionReport(runId): Promise<ExceptionReportDto>`
- `fetchFormEa(employeeId, year): Promise<FormEaDto>`

---

## 8. i18n Dictionary Additions

`src/domain/derive/i18n/en.ts` and `ms.ts` get new keys prefixed `doc.payslip.*` for payslip section headings not already in the domain dictionaries:

| Key | EN | MS |
|---|---|---|
| `doc.payslip.title` | PAYSLIP | PENYATA GAJI |
| `doc.payslip.earnings` | EARNINGS | PENDAPATAN |
| `doc.payslip.deductions` | EMPLOYEE DEDUCTIONS | POTONGAN |
| `doc.payslip.employer-contributions` | EMPLOYER CONTRIBUTIONS | SUMBANGAN MAJIKAN |
| `doc.payslip.net-pay` | NET PAY | GAJI BERSIH |
| `doc.payslip.ytd` | YEAR-TO-DATE | TAHUN SEMASA |
| `doc.payslip.statutory-wages` | STATUTORY WAGE BASES | GAJI BERKANUN |
| `doc.payslip.audit-annex` | CALCULATION & AUDIT ANNEX | LAMPIRAN AUDIT |
| `doc.payslip.employer-note` | Employer-paid contributions — not deducted from your salary. | Sumbangan majikan — tidak ditolak daripada gaji anda. |

---

## 9. Testing

### 9.1 Payslip document (unit + render)

Tests in `tests/payslip/`:

1. Gross − deductions = net reconciliation
2. Employer contributions do not reduce net pay
3. PCB and CP38 render separately
4. EPF/SOCSO/EIS wage bases can differ from gross pay
5. Nil amount renders as `—`
6. Money columns right-aligned, tabular numbers (class assertions)
7. Legal employer comes from `payLines.employeeSnapshot`, not department
8. Current-employer YTD is not combined with prior-employer YTD
9. `documentStatus: "DRAFT_PREVIEW"` renders document-status-mark watermark
10. No hardcoded hex in rendered HTML — only `var(--doc-*)` tokens
11. `renderLabel` used for all bilingual labels (spot-check EN/MS toggle)

### 9.2 Run-diff

Tests in `tests/diff/`:

1. `RunLineDiffDto` assembly from fixture `payLines.derivation` JSONB
2. VALUE diff row renders old → new values with `deltaSen`
3. ADDED / REMOVED rows render label + annotation
4. Diff tab hidden when `previousRoots === null`
5. Run-diff panel shows empty state when no employees changed

### 9.3 Reports

Tests in `tests/reports/`:

1. Payment register returns all lines with correct `netSen` and `paymentState`
2. Statutory summary totals match sum of individual `payLines` roots
3. Exception report maps findings correctly (severity + employee name join)
4. Form EA rollup includes only APPROVED + CLOSED runs
5. Form EA excludes DRAFT / REVIEWED runs
6. Form EA with zero approved runs returns zero totals, not null error

---

## 10. Non-Goals (Phase 8)

- No headless PDF generation (no Puppeteer/Playwright in server)
- No Form EA LHDN e-submission integration
- No payslip distribution automation (distribution can be manually recorded via existing Phase 7 `POST .../distributions`)
- No new Drizzle schema (all data from existing tables)
- No engine changes, no statutory table changes
- No EA 1955 citations in UI copy (use EPF Act 1991 s.42 / KWSP guidance per `payslip-legal-requirements.md`)
- No gender / citizenship fields on payslip (tracked as P1 gap in legal requirements doc — deferred)

---

## 11. File Map

### New server files
| File | Purpose |
|---|---|
| `src/server/routes/pay-run-payslip.ts` | `GET .../payslip`, `GET .../payslips` |
| `src/server/routes/pay-run-diff.ts` | `GET .../diff` |
| `src/server/routes/pay-run-reports.ts` | `GET .../reports/{type}` |
| `src/server/routes/employee-ea.ts` | `GET .../ea/:year` |

### New SPA files
| File | Purpose |
|---|---|
| `src/web/payrun/payslip-page.tsx` | Full-page payslip route |
| `src/web/payrun/payslip-document/payslip-document.tsx` | Root document component |
| `src/web/payrun/payslip-document/payslip-header.tsx` | Section 1 — identity |
| `src/web/payrun/payslip-document/employee-summary.tsx` | Section 2 — employee |
| `src/web/payrun/payslip-document/statutory-wage-basis.tsx` | Section 3 — wage bases |
| `src/web/payrun/payslip-document/pay-equation.tsx` | Section 4 — pay equation |
| `src/web/payrun/payslip-document/earnings-section.tsx` | Section 5A — earnings |
| `src/web/payrun/payslip-document/deductions-section.tsx` | Section 5B — deductions |
| `src/web/payrun/payslip-document/employer-contributions.tsx` | Section 5C — employer |
| `src/web/payrun/payslip-document/net-pay-conclusion.tsx` | Section 6 — net pay |
| `src/web/payrun/payslip-document/ytd-summary.tsx` | YTD table |
| `src/web/payrun/payslip-document/audit-annex.tsx` | Page 2 — audit |
| `src/web/payrun/payslip-document/document-status-mark.tsx` | Watermark |
| `src/web/payrun/payslip-document/payslip-print.css` | Print stylesheet |
| `src/web/payrun/run-diff-panel.tsx` | Run-level compare panel |
| `src/web/payrun/employee-diff.tsx` | Employee-level graph diff tab |
| `src/web/reports/payment-register.tsx` | Payment register report |
| `src/web/reports/statutory-summary.tsx` | Statutory summary report |
| `src/web/reports/exception-report.tsx` | Exception/findings report |
| `src/web/reports/form-ea.tsx` | Annual Form EA summary |

### Modified files
| File | Change |
|---|---|
| `src/server/app.ts` | Mount 4 new route files |
| `src/web/app.tsx` | Add payslip-page route |
| `src/web/api/payroll-api.ts` | 7 new fetch functions |
| `src/web/payrun/employee-slide-over.tsx` | Add Diff tab + payslip link |
| `src/web/payrun/run-header.tsx` | Add Compare button |
| `src/web/reports/reports-page.tsx` | Replace EmptyState with portal |
| `src/domain/derive/i18n/en.ts` | Add `doc.payslip.*` keys |
| `src/domain/derive/i18n/ms.ts` | Add `doc.payslip.*` keys |
