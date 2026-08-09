# Phase 8 — Payroll Reports, Bilingual Payslip, Run-Diff & Annual Remuneration Summary

**Date:** 2026-08-09 (revised after P0 review)  
**Status:** Approved for implementation  
**Scope:** SPA + server read facades only — no payroll engine changes, no new schema

---

## 0. Frozen design rules

These four rules govern the entire phase. Any implementation step that contradicts one of them must stop and flag the conflict.

```
1. Payslip figures are server-derived only; the client never calculates payroll.

2. Historical employee AND legal-employer identity must come from
   immutable payroll-time facts wherever available.

3. YTD identity = legal employer (companyId) + person (employmentId) + calendar year.
   Never group-wide. Where a reappointment creates a second employmentId at the
   same legal employer, both are summed under that employer only if they share the
   same companyId. Transfer to a different legal employer always produces a
   separate YTD row.

4. "Form EA" is not shipped. Phase 8 ships an Annual Remuneration Summary /
   EA Preparation Summary only. Official C.P.8A requires a prescribed structure
   covering employment income, benefits, pensions, tax-exempt perquisites, and
   tax-year receipt-date recognition — none of which can be faithfully
   generated from existing payLines roots alone.
```

---

## 1. Context

Phase 8 completes the remaining UI work listed in the README phase table:

| Workstream | Backend | SPA |
|---|---|---|
| Employee import | Done (Phase 4B) | Done (Phase 4B) |
| Reports | None | Placeholder (`EmptyState`) |
| Bilingual payslip | None | English-only quick preview in slide-over |
| Run-diff | `diffGraphs()` domain fn exists | None |

All workstreams are presentation-only. The payroll engine (`src/domain/calc/`), statutory tables, and golden master must not be modified.

---

## 2. Approach: Layered Server Facades + `window.print()`

Four independent read-facade route files are added to `src/server/routes/`. Each returns an immutable projection of already-computed data. No new Drizzle schema is required.

PDF generation uses `window.print()` with a CSS print stylesheet — no headless browser (Puppeteer/Playwright) in Phase 8. This keeps the Hono server lightweight for Phase 9 Vercel deployment.

**Classification:** Phase 8 produces a browser-renderable/printable payroll document, not a canonical immutable payroll artifact. A versioned document renderer → canonical PDF → SHA-256 artifact chain is a future phase concern. Do not misclassify `window.print()` output as a sealed artifact.

---

## 3. Workstream A — Bilingual Production Payslip

### 3.1 Architectural rules (from `docs/architecture/payslip.md`)

- Presentation layer only — never recompute statutory figures
- `--doc-*` tokens exclusively; no app theme tokens; no raw hex in document components
- Light-only document, print-safe, monochrome-safe
- Nil amount = `—` (em dash)
- No green net-pay box; no red deduction amounts
- Legal employer identity: see §3.2 architecture gap note — must not silently use current `companies` row
- YTD scoped to legal employer + person + calendar year (Rule 3 above)
- Bilingual: `renderLabel(label, lang)` from `src/domain/derive/i18n/render.ts` drives all labels
- `generatedAt` = render metadata only; document provenance = `approvedAt` / `closedAt`
- DRAFT_PREVIEW documents must display **PREVIEW — NOT ISSUED** and are never eligible for artifact distribution

### 3.2 Legal employer identity — architecture gap

`payLines.employeeSnapshot` freezes employee identity at compute time. There is currently **no equivalent employer snapshot** on `payLines` or `payRuns`. The `companies` table is mutable — a later name/registration change would silently alter a historical payslip.

**Phase 8 resolution:** The payslip server route reads employer identity from `companies` via `payRuns.companyId`, but explicitly annotates the DTO with `employerSourceWarning: "LIVE_COMPANY_RECORD"` when no employer snapshot exists. The audit annex renders this as a visible notice: "Employer identity sourced from current company record — not a payroll-time snapshot." This is an honest disclosure rather than a false stability claim. A future phase may add an employer snapshot column to `payRuns`.

The payslip architecture rule §1.14 ("Historical payslip rendering must use payroll/run snapshot or equivalent immutable facts") is **not fully satisfiable** for employer identity in Phase 8. This gap is explicitly recorded; do not paper over it.

### 3.3 Payslip authorization contract

One clear contract — no contradictions:

```
requirePayRunAccess(READ)
    ↓
DRAFT / REVIEWED  →  documentStatus: "DRAFT_PREVIEW"
                     Watermark: "PREVIEW — NOT ISSUED"
                     YTD: provisional (see §3.6)
                     Not eligible for artifact distribution
APPROVED          →  documentStatus: "APPROVED"
CLOSED            →  documentStatus: "CLOSED"
```

The route never returns 403 based on run status alone (READ access already passed). Status drives the `documentStatus` field and watermark, not HTTP error codes.

### 3.4 New server route — `src/server/routes/pay-run-payslip.ts`

**Endpoints:**

```
GET /v1/pay-runs/:runId/lines/:lineId/payslip
  Auth:   requirePayRunAccess(READ)
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
  /** Render timestamp — document provenance uses approvedAt/closedAt, not this. */
  generatedAt: string;
  documentStatus: "APPROVED" | "CLOSED" | "DRAFT_PREVIEW";
  /** Present when employer identity is sourced from live company record, not a snapshot. */
  employerSourceWarning: "LIVE_COMPANY_RECORD" | null;

  // Legal employer (from companies via payRuns.companyId — see §3.2 gap note)
  legalEmployer: {
    name: string;
    registrationNumber: string | null;
    epfReference: string | null;       // KWSP employer registration number (item 11 in KWSP list)
    socsoReference: string | null;
    eisReference: string | null;
    lhdnReference: string | null;
    /** The legal employer representative identified for statutory wage statement purposes. */
    representativeName: string | null;
  };

  // Employee (from payLines.employeeSnapshot — immutable snapshot)
  // Fields sourced from snapshot, not current employment record.
  employee: {
    id: string;                         // employmentId (immutable)
    name: string;
    code: string;
    designation: string | null;
    department: string | null;
    /** Masked NRIC — last 4 digits visible per privacy doctrine. */
    maskedNric: string | null;
    /**
     * KWSP item 3+5 gap: gender and citizenship are not stored in the current
     * employee snapshot. These fields are null until a future phase adds them
     * to the snapshot contract. The payslip renders them only when non-null.
     */
    gender: string | null;
    citizenship: string | null;
    epfNumber: string | null;
    socsoNumber: string | null;
    /** Employment/pay basis — KWSP item 6 (daily/monthly). */
    payBasis: string | null;
  };

  // Pay period — KWSP items 7, 8
  payPeriod: {
    reportingMonth: string;    // "YYYY-MM"
    periodStart: string;       // from payRuns.periodStart
    periodEnd: string;         // from payRuns.periodEnd
    /** Scheduled payment date — KWSP item 8. Null when not yet recorded. */
    paymentDate: string | null;
    runId: string;
    label: string;
    workingDays: number;
  };

  // Payment method — rendered in Section 6 / net-pay-conclusion
  payment: {
    method: string | null;           // "BANK" | "CASH" | null
    maskedBankAccount: string | null;
    /** KWSP item 8 — statement date = date this document was approved/generated. */
    statementDate: string | null;    // approvedAt ?? closedAt ?? null
  };

  // Earning line items from payLineItems (frozen nameEnSnap/nameMsSnap/resolvedAmountSen)
  // All kindSnap values included — earnings and deductions — sorted by sortSnap.
  lineItems: Array<{
    kind: string;             // kindSnap: "EARNING" | "ALLOWANCE" | "DEDUCTION" | etc.
    codeSnap: string;
    nameEnSnap: string;
    nameMsSnap: string;
    resolvedAmountSen: number;
    quantity: string | null;
    rateSen: number | null;
  }>;

  // All 19 sen roots from payLines (integer sen) — used for statutory deductions and totals
  roots: Record<string, { sen: number | null; notApplicable: boolean }>;

  // Explicit statutory wage bases — KWSP requires these to be distinguishable from gross
  statutoryWageBases: {
    epfWagesSen: number | null;
    socsoWagesSen: number | null;
    eisWagesSen: number | null;
  };

  // YTD — Rule 3: legal employer (companyId) + person (employmentId) + calendar year
  // APPROVED + CLOSED runs only.
  // For DRAFT_PREVIEW: prior finalized YTD + provisional current-run values, clearly labelled.
  ytd: {
    grossSen: number;
    netSen: number;
    epfEeSen: number;
    epfErSen: number;
    socsoEeCoreSen: number;
    eisEeSen: number;
    pcbNetSen: number;
    cp38Sen: number;
    /** True when the current run is DRAFT/REVIEWED and current values are provisional. */
    isProvisional: boolean;
  } | null;

  // Approval provenance — from payRuns columns
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
    rulePackId: string;
    rulePackHash: string | null;
    calcEngineVersion: string | null;
  };
}

interface PayslipIndexRow {
  lineId: string;
  employeeCode: string;
  employeeName: string;
  netSen: number | null;
}
```

### 3.5 YTD for DRAFT_PREVIEW

```
APPROVED / CLOSED run:
  YTD = sum of all APPROVED + CLOSED runs for (companyId, employmentId, calendarYear)
        including the current run
  isProvisional = false

DRAFT / REVIEWED run:
  ytd.gross/net/... = sum of prior APPROVED + CLOSED runs
                      + current run's payLines roots (provisional)
  isProvisional = true
  Rendered with label: "YEAR-TO-DATE (PROVISIONAL)"
```

This prevents the confusing gap where a preview shows YTD only through the prior month.

### 3.6 New SPA files

**`src/web/payrun/payslip-page.tsx`** — full-page SPA route (`/pay-runs/:runId/payslip/:lineId`):
- Fetches `GET .../payslip`
- Renders `PayslipDocument` with a `lang` prop (`"en"` | `"ms"`)
- Lang toggle (`EN | BM`) top-right
- `Print` button calls `window.print()` — hidden during print via CSS
- Back link to workspace
- No shell sidebar during print

**`src/web/payrun/payslip-document/`** — document component tree:

```
payslip-document.tsx          Root — receives PayslipDocumentDto + lang
payslip-header.tsx            Section 1: document ID + legal employer identity
employee-summary.tsx          Section 2: employee & payment summary (gender/citizenship rendered when non-null)
statutory-wage-basis.tsx      Section 3: EPF/SOCSO/EIS statutory wage bases
pay-equation.tsx              Section 4: Gross − Deductions = Net
earnings-section.tsx          Section 5A: earning lines from lineItems (kindSnap EARNING/ALLOWANCE)
deductions-section.tsx        Section 5B: statutory + other deductions
employer-contributions.tsx    Section 5C: employer contributions (labelled not-from-salary)
net-pay-conclusion.tsx        Section 6: net pay + payment method + masked bank account
ytd-summary.tsx               YTD table — isProvisional renders PROVISIONAL label
audit-annex.tsx               Page 2: audit identity + approval provenance + rulePackId
document-status-mark.tsx      "PREVIEW — NOT ISSUED" watermark for DRAFT_PREVIEW
payslip-print.css             Print stylesheet
```

**`src/web/payrun/employee-slide-over.tsx`** — upgrade Payslip tab: keep `PayslipPreview` for quick view, add "Open full payslip →" link to `/pay-runs/:runId/payslip/:lineId`.

**`src/web/payrun/payslip-preview.tsx`** — unchanged (quick preview only, not the governed document).

**`src/web/app.tsx`** — add route:
```tsx
<Route path="/pay-runs/:runId/payslip/:lineId" component={PayslipPage} />
```

### 3.7 Bilingual label convention

All section headings and field labels use `renderLabel(label, lang)`. Where payslip-specific keys do not yet exist in `en.ts`/`ms.ts`, they are added in this phase (prefix `doc.payslip.*`). See §8 for the full dictionary.

Section headings that have no existing domain key use the pattern:
```tsx
// Direct bilingual string — used only for document-only labels with no domain equivalent
const SECTION_LABELS: Record<string, Record<Lang, string>> = {
  title: { en: "PAYSLIP", ms: "PENYATA GAJI" },
  // ... defined in payslip-document.tsx, not scattered across components
};
```

### 3.8 Print stylesheet rules

`payslip-print.css` implements (per `docs/architecture/payslip.md`):

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

The workspace DTO already carries `previousRoots` and `variance` per employee (root-level diff). The new run-diff UI adds the **graph-level explanation layer** on top.

### 4.2 Authoritative column: `payLines.trace`

The derivation graph is stored in `payLines.trace` JSONB (confirmed from schema: "The typed trace the payslip annex renders. The renderer never recalculates."). All diff and annex references use `payLines.trace`. The name `derivation` does not appear in the schema — any test fixtures using that name must be corrected.

Employee lines are matched between runs using `employmentId` (the immutable FK on `payLines`). Never match by name or current employee code.

### 4.3 New server route — `src/server/routes/pay-run-diff.ts`

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
  /** employmentId used to locate the prior line — not employee name or code. */
  employmentId: string;
  priorRunId: string | null;   // null when payRuns.linkedRunId is null
  diffs: NodeDiffRow[];
}

interface NodeDiffRow {
  d: "ADDED" | "REMOVED" | "VALUE" | "STRUCTURE" | "CITATION";
  id: string;           // semantic node ID e.g. "line.epf.ee"
  label: string;        // renderLabel(node.label, "en") — server renders EN; bilingual diff is future
  fromValue: string | null;
  toValue: string | null;
  deltaSen: number | null;    // present for VALUE diffs on money nodes only
  addedRefs: string[];        // for STRUCTURE diffs
  removedRefs: string[];
}
```

Implementation:
1. Load `payLines.trace` for `lineId` (current run)
2. Load `payRuns.linkedRunId` to find the prior run
3. Query `payLines` where `runId = linkedRunId AND employmentId = <this line's employmentId>`
4. If prior line found: call `diffGraphs(priorTrace, currentTrace)` → map to `NodeDiffRow[]`
5. If no prior line: return `diffs: [], priorRunId: null`

### 4.4 SPA — Run-level diff (workspace header)

**`src/web/payrun/run-diff-panel.tsx`** — new component:
- Reads `view.lines` (already loaded in workspace — no extra fetch)
- Filters to employees with `variance?.hasChanges === true`
- Renders compact table: employee name, `DeltaBadge` for net direction, changed root keys as chips
- "No changes from prior run" empty state when all employees unchanged
- Placed below `RunHeader` as a collapsible section, toggled by a "Compare" button

**`run-header.tsx`** changes:
- Add `Compare` button (only shown when `view.lines.some(l => l.previousRoots !== null)`)
- `onCompare` prop + `showCompare` local state

### 4.5 SPA — Employee-level diff (slide-over tab)

**`src/web/payrun/employee-diff.tsx`** — new component:
- Props: `runId: string`, `lineId: string`
- Fetches `GET .../diff` lazily on tab activation
- Groups `NodeDiffRow[]` by `d` kind with count badges
- `VALUE` rows: old → new + `DeltaBadge` when `deltaSen` present
- `ADDED` / `REMOVED`: node label + muted annotation
- `STRUCTURE` / `CITATION`: node label + change summary

**`employee-slide-over.tsx`** changes:
- Add "Diff" as a 4th tab (after Line, Derivation, Payslip)
- Only rendered when `line.previousRoots !== null`
- Lazy-fetches on tab activation

---

## 5. Workstream C — Reports Portal

### 5.1 Report provenance envelope

Every report DTO carries a `reportMeta` block to make printed reports defensible:

```typescript
interface ReportMeta {
  companyId: string;
  companyName: string;
  runId?: string;
  runStatus?: string;
  calcRevision?: string;
  generatedAt: string;      // ISO timestamp
  reportSchemaVersion: string;  // e.g. "1.0"
}
```

### 5.2 New server routes — `src/server/routes/pay-run-reports.ts`

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
  reportMeta: ReportMeta;
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
  reportMeta: ReportMeta;
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
  reportMeta: ReportMeta;
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

### 5.3 Annual Remuneration Summary (not "Form EA")

**This is not Form EA / C.P.8A.** See Rule 4 in §0.

The correct product name is **Annual Remuneration Summary** (or "EA Preparation Summary"). It is a payroll-system-derived summary of remuneration paid through this system. The employer must still prepare the actual C.P.8A using the prescribed LHDN format and process.

Do not display instructions to "File C.P.8A via LHDN e-Filing" — EA is prepared and given to the employee by the employer. The employer separately reports through the prescribed process. Cite LHDN guidance accurately.

**Route — `src/server/routes/employee-remuneration.ts`** (renamed from `employee-ea.ts`):

```
GET /v1/employees/:employeeId/remuneration-summary/:year
  Auth:   Bearer JWT; user must have READ access to at least one run for the employee's company
  Returns: AnnualRemunerationSummaryDto
```

**`AnnualRemunerationSummaryDto`:**
```typescript
interface AnnualRemunerationSummaryDto {
  reportMeta: ReportMeta;  // companyId + companyName + generatedAt + schemaVersion
  year: number;
  employeeId: string;       // employmentId
  employeeName: string;
  employeeCode: string;
  /**
   * Aggregation key: companyId + employmentId + calendar year.
   * Only APPROVED and CLOSED runs included.
   * Aggregation is by payroll reportingMonth falling within the year,
   * NOT by payment receipt date — see limitation notice below.
   */
  runsIncluded: string[];   // runIds
  months: string[];         // ["YYYY-MM", ...] — reporting months of included runs
  grossSen: number;
  netSen: number;
  epfEeSen: number;
  epfErSen: number;
  socsoEeCoreSen: number;
  eisEeSen: number;
  pcbNetSen: number;
  cp38Sen: number;
  /**
   * Limitation notice — must be rendered visibly in the SPA.
   * This summary aggregates by payroll reporting month, not by income receipt date.
   * Arrears, advance salary, late December payroll, and bonuses relating to prior
   * periods may need manual adjustment for ITA tax-year reporting purposes.
   * This is not a substitute for the official C.P.8A / Form EA.
   */
  limitationNotice: string;
  disclaimer: string;  // "Annual remuneration summary prepared from this payroll system. The employer must prepare and issue Form EA (C.P.8A) per ITA 1967 s.83(1A) using the LHDN prescribed format."
}
```

Only `APPROVED` and `CLOSED` runs are included. `DRAFT` and `REVIEWED` runs are excluded. The limitation notice about receipt-date vs. reporting-month aggregation **must be rendered** — it is part of the DTO, not optional UI copy.

### 5.4 SPA — `src/web/reports/`

**`reports-page.tsx`** — rebuilt as a portal:
- Layout: two-column (sidebar report type list + main viewer)
- Report types: Payment Register, Statutory Summary, Exception Report, Annual Remuneration Summary
- URL-driven state: `/reports?type=payment-register&runId=<id>` (deep-linkable)
- Run picker for run-scoped reports; employee + year picker for remuneration summary

**`src/web/reports/payment-register.tsx`** — table with print button  
**`src/web/reports/statutory-summary.tsx`** — summary card grid  
**`src/web/reports/exception-report.tsx`** — findings table (reuse severity chips from `findings-panel.tsx`)  
**`src/web/reports/annual-remuneration-summary.tsx`** — annual summary with prominent limitation notice and disclaimer; no "Form EA" label anywhere in this component

**`src/web/api/payroll-api.ts`** — add fetch functions for all four report endpoints.

### 5.5 Workspace deep-link

`run-header.tsx` gets a Reports icon button (link to `/reports?type=payment-register&runId={runId}`).

---

## 6. SPA Routing Changes

In `src/web/app.tsx`, add one new route:

```tsx
<Route path="/pay-runs/:runId/payslip/:lineId" component={PayslipPage} />
```

The `/reports` route is rebuilt in-place. The diff tab and run-diff panel are sub-components of the existing workspace route.

---

## 7. API Client Changes (`src/web/api/payroll-api.ts`)

New fetch functions:
- `fetchPayslip(runId, lineId): Promise<PayslipDocumentDto>`
- `fetchPayslipIndex(runId): Promise<{ payslips: PayslipIndexRow[] }>`
- `fetchLineDiff(runId, lineId): Promise<RunLineDiffDto>`
- `fetchPaymentRegister(runId): Promise<PaymentRegisterDto>`
- `fetchStatutorySummary(runId): Promise<StatutorySummaryDto>`
- `fetchExceptionReport(runId): Promise<ExceptionReportDto>`
- `fetchAnnualRemunerationSummary(employeeId, year): Promise<AnnualRemunerationSummaryDto>`

---

## 8. i18n Dictionary Additions

New keys prefixed `doc.payslip.*` added to `src/domain/derive/i18n/en.ts` and `ms.ts`:

| Key | EN | MS |
|---|---|---|
| `doc.payslip.title` | PAYSLIP | PENYATA GAJI |
| `doc.payslip.earnings` | EARNINGS | PENDAPATAN |
| `doc.payslip.deductions` | EMPLOYEE DEDUCTIONS | POTONGAN |
| `doc.payslip.employer-contributions` | EMPLOYER CONTRIBUTIONS | SUMBANGAN MAJIKAN |
| `doc.payslip.net-pay` | NET PAY | GAJI BERSIH |
| `doc.payslip.ytd` | YEAR-TO-DATE | TAHUN SEMASA |
| `doc.payslip.ytd-provisional` | YEAR-TO-DATE (PROVISIONAL) | TAHUN SEMASA (SEMENTARA) |
| `doc.payslip.statutory-wages` | STATUTORY WAGE BASES | GAJI BERKANUN |
| `doc.payslip.audit-annex` | CALCULATION & AUDIT ANNEX | LAMPIRAN AUDIT |
| `doc.payslip.employer-note` | Employer-paid contributions — not deducted from your salary. | Sumbangan majikan — tidak ditolak daripada gaji anda. |
| `doc.payslip.preview-watermark` | PREVIEW — NOT ISSUED | PRATONTON — TIDAK DIKELUARKAN |
| `doc.payslip.employer-source-warning` | Employer identity sourced from current company record — not a payroll-time snapshot. | Identiti majikan diambil daripada rekod syarikat semasa — bukan rekod syarikat masa gaji diproses. |

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
7. Legal employer comes from `companies` via `payRuns.companyId`, `employerSourceWarning` present
8. Current-employer YTD is not combined with prior-employer YTD
9. `documentStatus: "DRAFT_PREVIEW"` renders "PREVIEW — NOT ISSUED" watermark
10. DRAFT_PREVIEW YTD renders `isProvisional: true` label
11. No hardcoded hex in rendered HTML — only `var(--doc-*)` tokens
12. `renderLabel` used for all bilingual labels (spot-check EN/MS toggle)
13. `payment.method` renders in Section 6 / net-pay-conclusion
14. `auditIdentity.rulePackId` renders in audit annex

### 9.2 Run-diff

Tests in `tests/diff/`:

1. `RunLineDiffDto` assembled from `payLines.trace` JSONB (not `derivation`)
2. Prior line matched by `employmentId`, not employee name or code
3. VALUE diff row renders old → new values with `deltaSen`
4. ADDED / REMOVED rows render label + annotation
5. Diff tab hidden when `line.previousRoots === null`
6. Run-diff panel shows empty state when no employees changed
7. `priorRunId: null` returned when `payRuns.linkedRunId` is null

### 9.3 Reports

Tests in `tests/reports/`:

1. Payment register returns all lines with correct `netSen` and `paymentState`
2. Statutory summary totals match sum of individual `payLines` roots
3. Exception report maps findings correctly (severity + employee name join)
4. Annual remuneration summary includes only APPROVED + CLOSED runs
5. Annual remuneration summary excludes DRAFT / REVIEWED runs
6. Annual remuneration summary with zero approved runs returns zero totals, not error
7. All report DTOs include `reportMeta` with `generatedAt` and `reportSchemaVersion`
8. Annual remuneration summary DTO contains `limitationNotice` (non-empty string)

---

## 10. Non-Goals (Phase 8)

- No headless PDF generation (no Puppeteer/Playwright)
- No Form EA / C.P.8A — deferred to a future statutory-reporting slice with proper prescribed-format implementation and tax-year receipt-date recognition
- No LHDN e-submission integration
- No payslip distribution automation (use existing Phase 7 `POST .../distributions`)
- No new Drizzle schema
- No engine or statutory table changes
- No gender / citizenship fields unless already present in `employeeSnapshot` (rendered when non-null; not forced to null)
- No employer snapshot column (gap recorded in §3.2, deferred to future phase)
- No canonical immutable PDF artifact chain (future phase — `window.print()` is not a sealed artifact)

---

## 11. File Map

### New server files
| File | Purpose |
|---|---|
| `src/server/routes/pay-run-payslip.ts` | `GET .../payslip`, `GET .../payslips` |
| `src/server/routes/pay-run-diff.ts` | `GET .../diff` |
| `src/server/routes/pay-run-reports.ts` | `GET .../reports/{type}` (3 report types) |
| `src/server/routes/employee-remuneration.ts` | `GET .../remuneration-summary/:year` |

### New SPA files
| File | Purpose |
|---|---|
| `src/web/payrun/payslip-page.tsx` | Full-page payslip route |
| `src/web/payrun/payslip-document/payslip-document.tsx` | Root document component |
| `src/web/payrun/payslip-document/payslip-header.tsx` | Section 1 — identity + employer source warning |
| `src/web/payrun/payslip-document/employee-summary.tsx` | Section 2 — employee (gender/citizenship when non-null) |
| `src/web/payrun/payslip-document/statutory-wage-basis.tsx` | Section 3 — EPF/SOCSO/EIS wage bases |
| `src/web/payrun/payslip-document/pay-equation.tsx` | Section 4 — pay equation |
| `src/web/payrun/payslip-document/earnings-section.tsx` | Section 5A — from lineItems |
| `src/web/payrun/payslip-document/deductions-section.tsx` | Section 5B — statutory + other deductions |
| `src/web/payrun/payslip-document/employer-contributions.tsx` | Section 5C — employer (labelled not-from-salary) |
| `src/web/payrun/payslip-document/net-pay-conclusion.tsx` | Section 6 — net + payment method |
| `src/web/payrun/payslip-document/ytd-summary.tsx` | YTD table (isProvisional label) |
| `src/web/payrun/payslip-document/audit-annex.tsx` | Page 2 — rulePackId + approval provenance |
| `src/web/payrun/payslip-document/document-status-mark.tsx` | PREVIEW — NOT ISSUED watermark |
| `src/web/payrun/payslip-document/payslip-print.css` | Print stylesheet |
| `src/web/payrun/run-diff-panel.tsx` | Run-level compare panel (from workspace data) |
| `src/web/payrun/employee-diff.tsx` | Employee-level graph diff tab |
| `src/web/reports/payment-register.tsx` | Payment register report |
| `src/web/reports/statutory-summary.tsx` | Statutory summary report |
| `src/web/reports/exception-report.tsx` | Exception/findings report |
| `src/web/reports/annual-remuneration-summary.tsx` | Annual summary (NOT labelled Form EA) |

### Modified files
| File | Change |
|---|---|
| `src/server/app.ts` | Mount 4 new route files |
| `src/web/app.tsx` | Add payslip-page route |
| `src/web/api/payroll-api.ts` | 7 new fetch functions |
| `src/web/payrun/employee-slide-over.tsx` | Add Diff tab + payslip link |
| `src/web/payrun/run-header.tsx` | Add Compare button + Reports deep-link |
| `src/web/reports/reports-page.tsx` | Replace EmptyState with portal |
| `src/domain/derive/i18n/en.ts` | Add `doc.payslip.*` keys |
| `src/domain/derive/i18n/ms.ts` | Add `doc.payslip.*` keys |

---

## 12. Known Architecture Gaps (not blocking Phase 8)

| Gap | Impact | Future resolution |
|---|---|---|
| No employer snapshot on `payLines`/`payRuns` | Historical payslips may render different employer identity if `companies` row changes | Add `employerSnapshot` JSONB to `payRuns` in a future phase |
| YTD aggregation by `reportingMonth`, not income receipt date | Annual remuneration summary may need manual correction for arrears/advance/late-December pay | Tax-year receipt-date policy required for full C.P.8A implementation |
| Gender/citizenship not in `employeeSnapshot` | KWSP wage statement items 3+5 cannot be rendered | Add to snapshot contract in future employee master phase |
| `window.print()` PDF not a sealed artifact | Cannot chain hash + artifact identity to a canonical PDF | Future versioned renderer → R2 artifact phase |
