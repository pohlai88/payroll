# Feature surface map (as-of 2026-08-09)

## How to use this doc

Load this when you need a **live inventory** of routes, SPA paths, client methods, DTO twins, and per-feature layering grades. Use [layer-map.md](layer-map.md) for directory roles and anti-patterns; [companies-trace.md](companies-trace.md) as the gold-path template; [drift-audit.md](drift-audit.md) for the Mode B procedure; [feature-checklist.md](feature-checklist.md) for create steps. This file answers “what exists today and where does it drift?” — not how to invent structure.

## Registration spines (quick check)

| Spine | File | What must match |
|-------|------|-----------------|
| API | `src/server/app.ts` | Every `*Routes(db)` under `v1` (except public `healthRoutes`) |
| Wouter | `src/web/app.tsx` | Every signed-in `<Route path=…>` |
| Nav | `src/web/shell/app-nav.ts` | `APP_SHELL_ROUTE_PATHS` ↔ `APP_NAV_ITEMS` (asserted at module load) |

Verification (readonly):

```bash
rg "v1\\.route|Routes\\(" src/server/app.ts src/server/routes
rg "Route path=|Route component=" src/web/app.tsx
rg "APP_SHELL_ROUTE_PATHS|APP_NAV_ITEMS" src/web/shell/app-nav.ts
rg "requestJson|/v1/" src/web/api/client.ts
rg "Keep in sync" src/web/api/types.ts src/web/payrun/payslip-document/types.ts
```

**Note:** `src/server/routes/pay-run-access.ts` is a **shared helper**, not registered as a route module.

## API inventory

| Area | Hono route file | Registered in `app.ts` | Client methods (`createApiClient` → `payrollApi`) | Status |
|------|-----------------|------------------------|---------------------------------------------------|--------|
| Health | `health.ts` | `app.route("/", healthRoutes)` (public) | none | OK — intentional public; no Bearer |
| Me / permissions | `me.ts` | `meRoutes` | `getMe`, `getPermissions` | Wired |
| Admin users | `admin-users.ts` | `adminUserRoutes` | `getAdminUsers`, `createAdminUser`, `updateAdminUser`, `assignUserRole`, `revokeUserRole` | Wired |
| Admin companies | `admin-companies.ts` | `adminCompanyRoutes` | `getAdminCompanies`, `createAdminCompany`, `updateAdminCompany` | Wired (gold) |
| Employee import | `employee-import.ts` | `employeeImportRoutes` | `downloadEmployeeImportTemplate`, `importEmployees` | Wired |
| Employees list | `employees.ts` | `employeeRoutes` | `getEmployees` | Wired; **fat-route** |
| Pay-run CRUD / lifecycle / findings / gates | `pay-run.ts` | `payRunRoutes` | `getPayRuns`, `createPayRun`, `recompute`, `review`, `approve`, `demotePayRun`, `getFindings`, `scanFindings`, `acknowledgeFinding`, `evaluateGate` (GET) | Mostly wired |
| Gate evaluate (POST) | `pay-run.ts` `POST …/gates/:gate/evaluate` | via `payRunRoutes` | **none** | **Orphan endpoint** — FE uses `GET …/gates/:gate` only |
| Workspace | `pay-run-workspace.ts` | `payRunWorkspaceRoutes` | `getWorkspace` | Wired; thin route → repo |
| Control (close/seal/payments/release/artifacts) | `pay-run-control.ts` | `payRunControlRoutes(db)` | `getPayments`, `holdLine`, `unholdLine`, `withdrawLine`, `previewRelease`, `commitRelease`, `getBatch`, `settleAttempt`, `reconcileAttempt`, `cancelRelease`, `recordDistribution`, `getArtifacts`, `uploadArtifact`, `downloadArtifact`, `getClosureChecklist`, `closeRun`, `getRunSeal`, `getClosureChain` | Wired |
| Payslips | `pay-run-payslip.ts` | `payRunPayslipRoutes` | `getPayslip`, `getPayslipIndex` | Wired; **fat-route**; FE DTO outside `types.ts` |
| Line diff | `pay-run-diff.ts` | `payRunDiffRoutes` | `getLineDiff` | Wired; thin route → `loadDerivedGraph` + `diffGraphs` (compute-on-read; not `pay_lines.trace`) |
| Line derivation | `pay-run-derivation.ts` | `payRunDerivationRoutes` | `getLineDerivation` | Wired; thin route → `service/line-derivation` (compute-on-read `deriveLine`) |
| Run reports | `pay-run-reports.ts` | `payRunReportRoutes` | `getPaymentRegister`, `getStatutorySummary`, `getExceptionReport` | Wired; **fat-route**; totals carry `incomplete` |
| Annual remuneration | `employee-remuneration.ts` | `employeeRemunerationRoutes` | `getAnnualRemunerationSummary` | Wired; **fat-route**; totals carry `incomplete` |

### Route ↔ client path cheatsheet (all under `/v1` except health)

| Method | Path | Client |
|--------|------|--------|
| GET | `/health` | — |
| GET | `/me` | `getMe` |
| GET | `/me/permissions` | `getPermissions` |
| GET/POST | `/admin/users` | `getAdminUsers` / `createAdminUser` |
| PATCH | `/admin/users/:userId` | `updateAdminUser` |
| POST/DELETE | `/admin/users/:userId/roles` | `assignUserRole` / `revokeUserRole` |
| GET/POST | `/admin/companies` | `getAdminCompanies` / `createAdminCompany` |
| PATCH | `/admin/companies/:companyId` | `updateAdminCompany` |
| GET | `/employee-import/template` | `downloadEmployeeImportTemplate` |
| POST | `/employee-import` | `importEmployees` |
| GET | `/employees` | `getEmployees` |
| GET | `/employees/:employeeId/remuneration-summary/:year` | `getAnnualRemunerationSummary` |
| POST | `/transfers` | `commitTransfer` |
| POST | `/pay-items/:payItemId/treatments/departures` | `recordWageTreatmentDeparture` |
| POST | `/pay-items/:payItemId/pcb-classes/departures` | `recordPcbClassDeparture` |
| GET/POST | `/pay-runs` | `getPayRuns` / `createPayRun` |
| GET | `/pay-runs/:runId/workspace` | `getWorkspace` |
| POST | `/pay-runs/:runId/recompute\|review\|approve\|demote` | matching methods |
| GET/POST | findings + acknowledge | matching methods |
| GET | `/pay-runs/:runId/gates/:gate` | `evaluateGate` |
| POST | `/pay-runs/:runId/gates/:gate/evaluate` | **orphan** |
| GET | payslips / payslip / diff / derivation / reports / payments / artifacts / seal / closure-* | matching methods |
| POST | close, hold/unhold/withdraw, release, settle/reconcile, cancel, distributions, upload artifact | matching methods |

**Client orphans:** none found — every `createApiClient` `/v1/…` method has a matching Hono handler. Facade `payrollApi` mirrors `createApiClient` 1:1 (no extra HTTP).

## SPA inventory

| Path | Page file | In `app.tsx` | In `app-nav` | Notes |
|------|-----------|--------------|--------------|-------|
| `/` | `src/web/dashboard/dashboard-page.tsx` | yes | yes (`matchPrefix: false`) | Uses `getPayRuns` only |
| `/pay-runs` | `src/web/payrun/pay-run-list.tsx` | yes | yes | Studio `datatable-pay-run` + `empty-state-01` |
| `/pay-runs/:runId` | `src/web/payrun/workspace.tsx` | yes | no (nested under Pay Runs) | Intentional nested |
| `/pay-runs/:runId/payslip/:lineId` | `src/web/payrun/payslip-page.tsx` | yes | no (nested) | Intentional nested |
| `/employees` | `src/web/employees/employees-page.tsx` | yes | yes | Studio `datatable-employee` + `file-upload-01` + `empty-state-01` |
| `/reports` | `src/web/reports/reports-page.tsx` | yes | yes | |
| `/control` | `src/web/control/control-page.tsx` | yes | yes | |
| `/companies` | `src/web/companies/companies-page.tsx` | yes | yes (`adminOnly`) | |
| `/admin` | `src/web/admin/admin-page.tsx` | yes | yes (`adminOnly`) | |
| (fallback) | inline “Not found” | yes | — | |

**Nav↔Route mismatches:** none for shell destinations. Nested pay-run paths are correctly **in `app.tsx` only**. Breadcrumbs resolve via `resolveAppNavItem` (`shell-breadcrumb.tsx`) — nested URLs still highlight Pay Runs.

### Feature page folders under `src/web/`

| Folder | Role |
|--------|------|
| `admin/` | System-admin users UI |
| `companies/` | Company directory |
| `control/` | Cross-run control console |
| `dashboard/` | Home aggregates |
| `employees/` | Employee list + import panel |
| `payrun/` | List, workspace, payslip; `panels/`, `drawers/`, `dialogs/`, `employee/`, `payslip-document/` |
| `reports/` | Report views |
| `api/`, `auth/`, `context/`, `shell/` | Cross-cutting (not feature pages) |

Marketing (`landing.html` → `src/marketing/`) is **outside** this SPA spine.

## DTO sync index

| FE type | Sync comment target | Producer path | Risk |
|---------|---------------------|---------------|------|
| `AdminCompanyRow` | `CompanyDirectoryRow` in `src/service/admin-companies.ts` | service | Low — canon example |
| `CreateAdminCompanyBody` / `UpdateAdminCompanyBody` | Zod in `admin-companies.ts` route | route Zod | Low |
| `ArtifactRow` | `ArtifactListItem` in `src/service/artifacts.ts` | service | Low |
| `PaymentRegisterDto` | `pay-run-reports.ts` payment-register | fat route | Med — producer is route-local |
| `StatutorySummaryDto` | `pay-run-reports.ts` statutory-summary | fat route | Med |
| `AnnualRemunerationSummaryDto` | `employee-remuneration.ts` | fat route | Med |
| `PayRunMutationEnvelope` (+ kind union) | `src/service/pay-run-mutation-envelope.ts` | service | Low |
| `PayslipDocumentDto` / `PayslipIndexRow` | `src/web/payrun/payslip-document/types.ts` → `pay-run-payslip.ts` | fat route | **High** — not in `types.ts`; agents often miss |
| `PayRunSummary` | comment → `src/repo/pay-run.ts` | repo | Med — informal “see” comment, not `Keep in sync with` |
| `EmployeeSummary` | comment → `routes/employees.ts` | route-local interface | Med — twin lives in route file |
| `PayRunWorkspaceView` + nested tiles/lines | comment → `src/repo/workspace.ts` | repo | Med — large nested surface |
| `FindingRow` / findings responses | path comments only | `run-findings` / route | Med — no formal sync tag |
| `LinePaymentRow`, release/batch/attempt DTOs | path comments → control route / `release.ts` / schema | service+route | Med |
| `CloseRunResponse`, seal/chain types | comments → `close.ts` / `closure-seal.ts` | service | Med |
| `RunLineDiffDto` / `NodeDiffRow` | `Keep in sync` → `pay-run-diff.ts` | route + `service/line-derivation` load | Low — compute-on-read graphs |
| `LineDerivationDto` / `DerivedNodeDto` | `Keep in sync` → `src/service/line-derivation.ts` | service | Low — gold-ish nested pay-run read |
| `ExceptionReportDto` | `Keep in sync` → `pay-run-reports.ts` | fat route | Low — sibling reports aligned |
| `MeResponse`, `AdminUserRow`, import report, `CreatePayRunBody`, invite bodies | missing or weak | various | Low–med process smell |

### Dual / deprecated fields still in play

| Dual | Where | Agent rule |
|------|-------|------------|
| `evidenceRef` vs `evidenceArtifactId` | `src/db/schema/transfer.ts`; transfer service still writes `evidenceRef: null` | Prefer `evidenceArtifactId` for new transfer evidence; don’t invent FE fields without producer |
| `reconEvidenceArtifactId` | `src/db/schema/control.ts`; `reconcileAttempt(…, evidenceArtifactId)` maps to it | Current payment recon API name is `evidenceArtifactId` in client body |
| Rule-pack boolean mirrors `socso_wages` / `eis_wages` | `catalog` schema + `repo/rule-pack.ts` | Treatments are authority; booleans are deprecated mirrors |
| `@deprecated` `pcbRemunerationClass` helper path | `src/domain/calc/pcb-context.ts` | Prefer `PayItemDef.pcbRemunerationClass` via treatments/`loadPayItems` |
| Derive-graph `evidenceRef` | `src/domain/derive/*` | Citation/explain string — **not** the transfer artifact dual |

## Feature layering grades

| Feature | Grade | Key files | Extend by… | Do not copy… |
|---------|-------|-----------|------------|--------------|
| Companies (admin) | **gold** (route→service→repo list; writes partly in service) | `admin-companies.ts` route/service, `repo/rbac.ts`, `companies-page.tsx` | Follow [companies-trace.md](companies-trace.md); prefer repo writes for new resources | — |
| Admin users / RBAC assign | **gold-ish** | `admin-users` route/service, `admin-page.tsx`, `service/rbac.ts` | Service `requireSystemAdmin` first | FE-only `isSystemAdmin` as security |
| Me / permissions | **mixed** (route→service/rbac; no dedicated me service DTO module) | `me.ts`, `service/rbac.ts`, `auth-context.tsx` | Keep serialization in route thin | Duplicating permission matrix on FE |
| Employee import | **gold-ish** | `employee-import` route/service, `domain/import/employee-row.ts`, `employee-import-panel.tsx` | Service + domain parse; route Zod/limits | Inline CSV parse in route |
| Employees list | **fat-route** | `routes/employees.ts` (Drizzle joins + DTO), `employees-page.tsx` | Extract `repo` + service when touching | New list endpoints with SQL in route |
| Pay-run create/recompute/review/approve | **mixed → gold lean** | `pay-run.ts`, `service/payrun.ts`, `repo/pay-run.ts` | Service `requirePermission` / `*ForActor`; envelope from service | Skipping envelope / RBAC |
| Findings / gates | **mixed** | `pay-run.ts`, `service/run-findings.ts`, `service/gates.ts` | Service for scan/ack/evaluate | New POST evaluate client without checking GET exists |
| Workspace read | **missing service** (route→repo) | `pay-run-workspace.ts`, `repo/workspace.ts` | Keep route thin; extend repo DTO + FE twin together | Assembling workspace in the route |
| Payments / release / close / seal | **gold-ish** (route auth helper + service) | `pay-run-control.ts`, `payments.ts`, `release.ts`, `close.ts`, `closure-seal.ts` | Service mutations; `requirePayRunAccess` at edge | Fat SQL for mutations |
| Artifacts | **gold** | `pay-run-control` routes, `service/artifacts.ts`, `repo/artifacts.ts`, `domain/artifacts/*` | `*ForActor` for HTTP; inject `ArtifactStore` via `createApp` / `setArtifactStore` | Bytes in DB; new parallel store APIs |
| Payslip | **fat-route** | `pay-run-payslip.ts`, `payslip-document/types.ts`, `payslip-page.tsx` | Extract builder when changing shape; sync local types file | Adding payslip fields only in `types.ts` |
| Line diff | **gold-ish** (route→service load→domain diff) | `pay-run-diff.ts`, `service/line-derivation.ts` `loadDerivedGraph`, `domain/derive/diff.ts` | Reuse `loadDerivedGraph`; keep `mapDiff` thin | Parsing `pay_lines.trace` as a DerivationGraph |
| Line derivation | **gold-ish** (route→service→domain) | `pay-run-derivation.ts`, `service/line-derivation.ts`, `domain/derive/emit.ts`, `derivation-drawer.tsx` | Extend mapper/DTO in service; keep route thin | Assembling graphs in the route; bloating workspace roots |
| Run reports | **fat-route** | `pay-run-reports.ts`, `reports/*` | Extract report service/repo when extending; preserve `incomplete` | Silent FE field adds; `?? 0` on nullable sen |
| Annual remuneration | **fat-route** | `employee-remuneration.ts` | Same as reports; keep disclaimer/limitation text | Treating as Form EA / C.P.8A |
| Dashboard / Control pages | **presentation** | `dashboard-page.tsx`, `control-page.tsx` | Compose existing `payrollApi` | New endpoints only for charts |

## Domain / calc / artifacts (agents commonly miss)

| Area | Path | Notes |
|------|------|-------|
| Pure calc | `src/domain/calc/*` | EPF/SOCSO/EIS/PCB dual-path compose — no DB; `sum-nullable-sen.ts` for aggregates |
| Derive / explain | `src/domain/derive/*` | Graphs, diff, i18n labels; HTTP via `GET …/derivation` |
| Findings rules | `src/domain/findings/*` | Catalog + detect; persistence via service |
| RBAC pure | `src/domain/rbac/*` | Types + `authorize.ts`; I/O in `service/rbac.ts` + `repo/rbac.ts` |
| Seal / timestamp | `src/domain/seal/`, `src/domain/timestamp/` | Closure hash + RFC3161 client |
| Import row model | `src/domain/import/employee-row.ts` | Shared with import service |
| Artifact store interface | `src/domain/artifacts/store.ts` | `put` / `get` / `delete` |
| R2 impl | `src/domain/artifacts/r2-store.ts` | Wired from `dev-server.ts` when `env.r2` set |
| Local FS fallback | `src/domain/artifacts/local-fs-store.ts` | Default in `service/artifacts.ts` if unset |
| Test memory store | `MemoryArtifactStore` in `store.ts` | Tests only |
| HTTP vs internal | `storeArtifact` (no AuthZ) vs `*ForActor` (PAY_RUN RBAC); HTTP attach types `EVIDENCE` \| `EXCEPTION_REPORT` only | Internal writers: release/close/timestamp |

**Misses:** (1) payslip DTOs live under `payrun/payslip-document/types.ts`, imported by `client.ts`; (2) `ArtifactStore` is module singleton via `setArtifactStore` from `createApp`; SPA downloads via authenticated `GET …/content` only; (3) `pay-run-access.ts` is the shared AuthZ edge for most run-scoped routes — some services also call `requirePayRunPermission` / `requirePermission` (artifacts, payrun mutations).

## Auth / RBAC touchpoints

| Layer | Location | Role |
|-------|----------|------|
| Browser identity | `src/web/auth/client.ts` | Neon Auth session / token |
| Session gate | `src/web/app.tsx` | Mount shell only when signed in |
| Bearer middleware | `src/server/auth/middleware.ts` | JWT → `resolveAppUser` → `c.set("user")` |
| All `/v1/*` | `src/server/app.ts` `v1.use("*", authMiddleware)` | Except `/health` |
| Service AuthZ | `src/service/rbac.ts` `requirePermission` / `requireSystemAdmin` | Source of truth |
| Pay-run edge helper | `src/server/routes/pay-run-access.ts` | Lookup company + `PAY_RUN` action |
| Domain evaluate | `src/domain/rbac/authorize.ts` | Pure matrix check |
| FE presentation | `isSystemAdminPresentation`, nav `adminOnly`, page early returns | **UI only** |

`requirePermission` / `requireSystemAdmin` call sites (non-exhaustive by design): `service/admin-companies.ts`, `service/admin-users.ts`, `service/payrun.ts`, `service/employee-import.ts`, `service/artifacts.ts` (`requirePayRunPermission`), routes `employee-import.ts`, `employee-remuneration.ts`, and everywhere via `requirePayRunAccess`.

## Continuous-dev hotspots

- **Fat routes:** `employees.ts`, `pay-run-payslip.ts`, `pay-run-reports.ts`, `employee-remuneration.ts` — DTO + SQL live together; highest skew risk.
- **Payslip twin outside `types.ts`** — update `payslip-document/types.ts` when changing route JSON.
- **Orphan** `POST …/gates/:gate/evaluate` — don’t add a second FE path without consolidating.
- **Workspace** large nested DTO in `repo/workspace.ts` ↔ FE block in `types.ts` — change producer first.
- **Dual evidence / rule-pack mirrors** — new code must use current names (`evidenceArtifactId` / treatments).
- **Companies create/update** still Drizzle-in-service — OK today; don’t worsen with SQL-in-route.
- **Registration spines** — new shell page without all three of `app.ts` / `app.tsx` / `app-nav.ts` is a medium drift bug.
- **`requestJson` casts** — TypeScript will not catch missing JSON fields.
- **Artifact store wiring** — forgetting `artifactStore` / `setArtifactStore` yields LocalFs silently in API process.

## Suggested agent checks before claiming done

Complementary to Mode A/B in `SKILL.md`:

1. Grep new path in `src/server/app.ts` **and** `src/web/api/client.ts` (then confirm `payrollApi` facade wraps it).
2. If shell destination: path in `APP_SHELL_ROUTE_PATHS`, `APP_NAV_ITEMS`, and `<Route>` — nested-only routes need `app.tsx` only.
3. FE DTO: identical fields + `Keep in sync with <producer>`; if payslip, check **`payslip-document/types.ts`**.
4. Mutations: service or `requirePayRunAccess` / `requirePermission` / `requireSystemAdmin` — not FE-only.
5. No new `fetch` under `src/web/**` outside `client.ts`.
6. Schema change → `npm run db:generate` + migrate; no hand-patched SQL.
7. Touching fat-route features: note extract-or-sync in the PR; don’t widen SQL-in-route without a plan.
8. Quick orphan scan: new Hono `app.get/post` without a `requestJson` twin (or document script-only intent).
