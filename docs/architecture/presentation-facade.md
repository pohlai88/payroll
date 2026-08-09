# Payroll architecture — the contract under the presentation facade

**Audience:** whoever builds or repairs the UI, API, service, repo, or schema —
agents included. **Purpose:** to say precisely what each layer guarantees, what
the presentation facade must never do, and how to trace a break from screen to
database (and back).

This is a description of the system as it exists in `src/`, not a proposal. Where
something is not built yet it is marked so. For deeper schema/function inventory
beneath these layers, see [payroll-architecture.md](./payroll-architecture.md).
For Vite/REST/shadcn discipline when *extending* features, see the
`vite-fullstack` skill (`references/layer-map.md`, `continuous-dev.md`,
`companies-trace.md`).

---

## 1. The shape

```
  ┌─────────────────────────────────────────────────────────────┐
  │  L5  PRESENTATION FACADE     Vite SPA · Wouter · payrollApi │
  │      shell · workspace · control · payslip · reports · admin│
  └─────────────────────────────────────────────────────────────┘
                    ▲ read model               │ intent
  ┌─────────────────────────────────────────────────────────────┐
  │  L4  API                     Hono /v1 · Neon Auth · RBAC    │
  │      route (Zod) → service (AuthZ) → repo (Drizzle)         │
  └─────────────────────────────────────────────────────────────┘
                    ▲                          │
  ┌─────────────────────────────────────────────────────────────┐
  │  L3  PERSISTENCE             src/db — Postgres + Drizzle    │
  │      ~41 tables · 13 schema modules · plpgsql invariants    │
  └─────────────────────────────────────────────────────────────┘
                    ▲                          │
  ┌─────────────────────────────────────────────────────────────┐
  │  L2  DERIVATION GRAPH        src/domain/derive              │
  │      11 node kinds · roots · citations · labels · diff      │
  └─────────────────────────────────────────────────────────────┘
                    ▲ mirrored against ────────┐
  ┌─────────────────────────────────────────────────────────────┐
  │  L1  STATUTORY ENGINE        src/domain/calc — pure, DB-free│
  │      integer sen · LineResult · the golden master           │
  └─────────────────────────────────────────────────────────────┘
                    ▲
  ┌─────────────────────────────────────────────────────────────┐
  │  L0  RULE PACK               db/seed — cited statutory data │
  │      EPF 3rd Sch A/C/E · SOCSO+SKBBK · EIS · 8 sources      │
  └─────────────────────────────────────────────────────────────┘
```

The load-bearing property is that **L1 and L2 have no dependency on L3 or above.**
The engine imports no database client, and the graph carries no URLs or hashes —
only `(ruleId, sourceRef)` pairs that L3 resolves. That is what keeps the golden
master meaningful: it exercises the real calculation path with nothing mocked.

**End-to-end spine (every feature):**

```
Page / panel
  → payrollApi / getPayrollApi()
  → createApiClient (Bearer JWT)
  → Hono /v1 + authMiddleware
  → route (Zod + requirePayRunAccess / requireSystemAdmin / *ForActor)
  → service (RBAC + orchestration)
  → repo (Drizzle)
  → db/schema tables
```

Gold path: companies —
`companies-page.tsx` → `payrollApi.getAdminCompanies` → `GET /v1/admin/companies`
→ `listAdminCompanies` → `listAllCompanies` → `companies` table;
FE `AdminCompanyRow` ↔ service `CompanyDirectoryRow`.

---

## 2. What each layer guarantees

### L0 — the rule pack

Statutory tables as data, each with an issuer, a URL, a retrieval date and a
SHA-256. A rate is never a literal in code. Rule packs are versioned, so a figure
computed in 2026 can be re-explained in 2031 against the pack that produced it.

Loaded via `src/repo/rule-pack.ts` + `src/repo/rule-resolution.ts`
(`resolveRule` for the pack active on a period end).

### L1 — the statutory engine (`src/domain/calc`)

Pure functions over a snapshot. Money is **integer sen** end to end; rounding
exists in exactly one place, `src/domain/money.ts`, half away from zero, with
`assertSen` raising rather than silently losing precision. The output is
`LineResult` — a flat record of ~19 sen fields.

Entry: `compose.ts` → `computeLine` / `computeLineChecked`. Pieces: `epf`,
`socso`, `eis`, `wage-base`, `classify`, `resolve-items`, `proration`, `validate`,
`version` (`CALC_ENGINE_VERSION`). PCB façade: `pcb.ts` (plus `pcb-core`,
`pcb-normal`, `pcb-additional`, `pcb-flat15`, `pcb-context`, `pcb-tables`,
`pcb-children`, `pcb-tp1`).

Verified by `tests/golden/july-2026-afenda.test.ts`: 37 real employees, every
statutory figure to the sen. **If it fails, the engine changed behaviour — do not
ship, and never update the fixture to match.**

### L2 — the derivation graph (`src/domain/derive`)

The layer the facade actually consumes for drill-down. `deriveLine()` emits a DAG
alongside the engine's arithmetic — it does not replace it — and `mirror.ts`
proves the two agree across all 19 roots on the golden fixture. A divergence is
an emitter bug, caught against real payroll before it can reach a payslip.

Four properties matter to the UI:

- **Flat, keyed, shared.** One EPF band lookup feeds both the employee and the
  employer figure, so the schedule highlights once. O(1) access by node id makes
  deep links and drill-downs trivial.
- **Semantic ids.** `line.epf.ee` is `line.epf.ee` in June and in July. That is
  what makes `diff.ts` a keyed map difference — month-over-month variance
  explained, with no separate variance engine.
- **No prose.** Nodes store a message key plus typed params; the sentence renders
  at display time. This is why one graph renders in English and Malay without the
  words drifting from the figures.
- **No dead ends.** `assertNoDeadEnds` enforces that every node either has an input
  edge or is a kind permitted to be terminal — and each terminal kind explains
  itself with provenance or a citation. "Nothing is hidden" is a failing test, not
  a slogan.

HTTP surface: `GET /v1/pay-runs/:runId/lines/:lineId/derivation` →
`src/service/line-derivation.ts` → `deriveLine`. Diff:
`GET …/lines/:lineId/diff` → `diffGraphs`.

### L3 — persistence (`src/db`)

Postgres via Drizzle (`src/db/client.ts`: `createPool`, `createDatabase`,
`casing: "snake_case"`). About **41 `pgTable`s** across 13 modules under
`src/db/schema/` (no barrel):

| Module | Tables / enums |
|---|---|
| `enums.ts` | All `pgEnum`s (run status, permissions, payment states, findings, artifacts, …) |
| `parties.ts` | `companies`, `persons`, `employments`, `employmentTaxProfiles`, `employmentPcbYtd` |
| `rbac.ts` | `users`, `roles`, `rolePermissions`, `userRoleAssignments` |
| `catalog.ts` | `payItems`, `employmentPayItems` |
| `employee-profile.ts` | `employmentProfiles`, `employeeCustomFieldDefs` |
| `rule-pack.ts` | `rulePacks`, `ruleSources`, `employmentLawRules`, `ruleSettings`, band tables, `seedFiles` |
| `run.ts` | `payRuns`, `payLines`, `payLineItems`, `payLineOverrides`, `pcbEntries`, `auditEvents` |
| `control.ts` | `gateCertifications`, `linePayments`, `withdrawals`, `releaseBatches`, `paymentAttempts`, `distributions` |
| `findings.ts` | `anomalyFindings`, `findingEvents` |
| `artifacts.ts` | `artifacts` |
| `seal.ts` | `closureSeals` |
| `transfer.ts` | `transfers`, `employmentPriorYtd` |
| `treatments.ts` | `payItemTreatments`, `payItemPcbClasses` |

Invariants live in plpgsql triggers where required, not only in application code.
Approval / gates lock lifecycle transitions. Schema changes: edit schema →
`npm run db:generate` → migrate → update repo.

### L4 — the API (`src/server`)

**Stack:** Hono under `/v1` with Neon Auth Bearer JWT (`authMiddleware`),
invite-only `users.auth_subject` linking, Zod on route bodies, RBAC in services.
Only `GET /health` is unauthenticated.

**Composition** (`src/server/app.ts` → `createApp`):

1. CORS
2. `healthRoutes` at `/`
3. Nested `v1` + `authMiddleware` on `*`
4. Feature routes mounted at `/` of `v1` (paths are absolute under `/v1`)
5. `onError` → `handleRouteError`

**Route modules** (`src/server/routes/`):

| File | Export | Surface (under `/v1` except health) |
|---|---|---|
| `health.ts` | `healthRoutes` | `GET /health` |
| `me.ts` | `meRoutes` | `GET /me`, `GET /me/permissions` |
| `admin-users.ts` | `adminUserRoutes` | `GET\|POST /admin/users`, `PATCH …/:userId`, `POST\|DELETE …/roles` |
| `admin-companies.ts` | `adminCompanyRoutes` | `GET\|POST /admin/companies`, `PATCH …/:companyId` |
| `employee-import.ts` | `employeeImportRoutes` | `GET /employee-import/template`, `POST /employee-import` |
| `employees.ts` | `employeeRoutes` | `GET /employees` |
| `employee-remuneration.ts` | `employeeRemunerationRoutes` | `GET /employees/:id/remuneration-summary/:year` |
| `pay-run.ts` | `payRunRoutes` | pay-runs CRUD/lifecycle, findings, gates |
| `pay-run-workspace.ts` | `payRunWorkspaceRoutes` | `GET …/workspace` |
| `pay-run-control.ts` | `payRunControlRoutes` | close/seal/payments/release/artifacts |
| `pay-run-payslip.ts` | `payRunPayslipRoutes` | payslip index + document |
| `pay-run-diff.ts` | `payRunDiffRoutes` | line graph diff |
| `pay-run-derivation.ts` | `payRunDerivationRoutes` | line derivation |
| `pay-run-reports.ts` | `payRunReportRoutes` | payment-register, statutory-summary, exception-report |
| `transfers.ts` | `transferRoutes` | `POST /transfers`, finding ack |
| `treatments.ts` | `treatmentRoutes` | wage treatment / PCB class departures |
| `pay-run-access.ts` | `requirePayRunAccess` | **helper only** — not registered |

**Mutation envelope (Phase 5A, frozen):** pay-run lifecycle mutations return
`PayRunMutationEnvelope` — run identity, `calcRevision` / certification fields,
findings counters, gate readiness. See
[phase5a-mutation-envelope-design](../superpowers/specs/2026-08-08-phase5a-mutation-envelope-design.md).

**Auth flow:**

```
Authorization: Bearer <token>
  → authMiddleware (src/server/auth/middleware.ts)
  → createNeonJwtVerifier (JWKS / EdDSA)
  → resolveAppUser (invite-only: auth_subject → email → link)
  → c.set("user", UserRow)
  → route / service RBAC
```

Auth codes: `UNAUTHORIZED` | `INVITE_REQUIRED` | `AUTH_SUBJECT_CONFLICT` |
`AUTH_BANNED` | `USER_DISABLED`.

**RBAC enforcement styles:**

1. **System admin:** `requireSystemAdmin` — admin users / companies
2. **Matrix cell:** `requirePermission(db, userId, resource, action, companyId?)`
3. **Run-scoped:** `requirePayRunAccess` (route) or `requirePayRunPermission` (service)
4. **Scope list:** `listAccessibleCompanies` — filter to assigned companies (admin sees all)

Resources: `COMPANY` | `EMPLOYMENT` | `PAY_RUN` | `PAY_ITEM` | `RULE_PACK` | `REPORT`.
Actions: `CREATE` | `READ` | `UPDATE` | `DELETE`.
`SYSTEM_ADMIN` short-circuits to full matrix (no `role_permissions` rows).

### L5 — the presentation facade (`src/web`)

**Stack:** Vite SPA + Wouter + Tailwind v4 + stock shadcn (`base-nova`) +
shadcn-studio. Theme: [`src/web/shadcn.css`](../../src/web/shadcn.css).
Light-theme document/print tokens only in
[`payslip-print.css`](../../src/web/payrun/payslip-document/payslip-print.css).

**API spine (mandatory — no parallel `fetch*`):**

| File | Role |
|---|---|
| `src/web/api/types.ts` | Hand-mirrored FE DTOs + `ApiClientError` / `SessionExpiredError` |
| `src/web/api/client.ts` | `createApiClient` — Bearer, 401 retry, `requestJson` / `requestText` |
| `src/web/api/payroll-api.ts` | `payrollApi` / `getPayrollApi()` singleton facade |
| `src/web/api/format-error.ts` | `formatApiError` for toasts / inline errors |

**DTO rule:** FE types match JSON field-for-field. Add
`Keep in sync with <path>` (canon: `AdminCompanyRow` ↔ `CompanyDirectoryRow`).
Change producer (service/route JSON) before consumer (`types.ts`).
`requestJson` casts — TypeScript will not catch DTO drift.

**Shell / nav:** `src/web/shell/app-nav.ts` (`APP_SHELL_ROUTE_PATHS`,
`APP_NAV_ITEMS`) + `src/web/app.tsx` `<Route>`s. Admin-only items use
`adminOnly: true` and are filtered by `isSystemAdminPresentation` (UI hide only —
server remains source of truth).

**UI placement:**

1. Primitives — `src/components/ui` (shadcn)
2. Studio blocks — `src/components/shadcn-studio/` (no I/O / RBAC inside)
3. Domain widgets — `src/components/payroll` (`MoneyCell`, `DeltaBadge`,
   `StatusBadge`, `NodePanel`, …)
4. Feature pages — `src/web/<feature>/*-page.tsx`

UI/UX changes go through `/rui` `/cui` `/iui` (shadcn-studio MCP), not freehand.

---

## 3. The read model the facade consumes

Four families cover every screen.

| Shape | Source | Feeds |
|---|---|---|
| `LineResult` roots / `RootValue` | `buildRootsFromLine` / `readSen(graph, root)` | grid cells, totals strip, payslip figures |
| `DerivationGraph` / `LineDerivationDto` | `deriveLine()` via `line-derivation` service | drill-down drawer, payslip annex |
| `GraphDiff` / `RunLineDiffDto` | `diff.ts` over two graphs | run-vs-run variance explanations |
| Workspace / control DTOs | `loadWorkspaceView`, payments, release, seal, artifacts | shell workspace + control plane |

The 19 roots are the entire numeric vocabulary of the UI:

```
gross · epfWages · socsoWages · eisWages
epfEe · epfEr · socsoEeCore · socsoEeSkbbk · socsoEr · eisEe · eisEr
pcbNet · cp38 · zakat · otherDeductions · deductionsTotal
net · hrdfLevy · employerCost
```

(`ROOT_KEYS` / `RootKey` in `src/repo/pay-line-roots.ts`.)

If a screen needs a number that is not a root, the answer is a new root in the
emitter — not arithmetic in a component. A figure computed in the facade has no
node id, therefore cannot be drilled, therefore breaks the product's one promise.

**Workspace variance:** `EmployeeLineDto` carries both line-level
`EmployeeVarianceDto` and per-root `rootVariances: Record<root, VarianceDto>`.
UI consumes server direction / bps via `DeltaBadge` — do not re-derive UP/DOWN
client-side.

**Other L5 DTO families** (see `src/web/api/types.ts`): me/permissions, admin
users/companies, employee import report, `PayRunMutationEnvelope`, findings/gates,
payments/release/batches, closure/seal/artifacts, payslip document types
(`src/web/payrun/payslip-document/types.ts`), reports, transfer, treatments.

---

## 4. Rendering the eleven node kinds

### Domain kinds (L2 — source of truth)

The derivation graph uses eleven kinds. This is the full drill-down specification
in `src/domain/derive/node.ts`. Each kind has a distinct visual job when the
facade eventually sees the uncollapsed graph:

| Kind | Terminal | What the panel shows |
|---|---|---|
| `INPUT` | yes | value, `origin`, `fieldPath`, and provenance — who entered it, when, which import batch |
| `SETTING` | yes | the scalar, its `settingKey`, `rawValue` verbatim from the pack, and its citation |
| `CLASSIFICATION` | no | the decision (age, EPF part, SOCSO category, EIS eligibility, SKBBK window), a `manual` marker when a human set it, and the detail line explaining *which* rule chose it |
| `TABLE_LOOKUP` | see note | the wage searched for, the matched row, `rowIndex` of `rowCount`, and `neighbours.prev/next` so "you are RM12 below the next band" is visible. Fetch the table by `tableId` once and highlight — the node deliberately carries the row, not the table |
| `CALCULATION` | no | the operator and its operands, refs resolved to their own nodes |
| `ROUNDING` | no | pre-rounded value, mode, and `deltaSen`. `NO_OP` when rounding changed nothing |
| `PRORATION` | no | basis, numerator/denominator, Employment Act citation. A full month reads "no proration applied", never "× 1" |
| `EXTERNAL_VERIFIED` | yes | PCB override / draft entry. Amount, source, `verificationStatus`, evidence ref. Offline `COMPUTED` MTD uses `CALCULATION` + `MY.PCB.COMPUTERIZED` instead |
| `MANUAL_OVERRIDE` | no | computed **and** applied side by side, plus reason, evidence, approver. The computed node stays in the graph as an input |
| `AGGREGATE` | no | members with their roles — and **excluded members with `because`**. This is the answer to "why isn't my overtime in EPF wages?" |
| `NOT_APPLICABLE` | yes | a zero with a citation. Renders as "contributes nothing by law", never as a blank or a bare 0.00 |

`TERMINAL_KINDS` is the four that may have zero inputs. `TABLE_LOOKUP` also ends the
"why" chain in the sense that its value is read from a cited document, but its type
requires the wage edge, so the drill continues downward into how that wage was built.

### Presentation kinds (L4/L5 — what the HTTP DTO exposes today)

`src/service/line-derivation.ts` → `mapKind()` collapses the eleven domain kinds
into `DerivedNodeDto.kind` before the facade sees them:

| Domain kind(s) | `DerivedNodeDto.kind` |
|---|---|
| `TABLE_LOOKUP` | `TABLE_LOOKUP` |
| `NOT_APPLICABLE` | `NOT_APPLICABLE` |
| `MANUAL_OVERRIDE` | `OVERRIDE` |
| `SETTING` | `RATE` |
| `CALCULATION`, `ROUNDING`, `PRORATION`, `AGGREGATE` | `FORMULA` |
| `INPUT`, `CLASSIFICATION`, `EXTERNAL_VERIFIED` (default) | `PASSTHROUGH` |

The DTO union also lists `CAP`, which `mapKind` never produces (dead member).
**Implication:** do not implement §4's per-domain-kind UI against today's
`DerivedNodeDto` — the panel can only branch on the seven presentation kinds
above unless `mapKind` is widened. Domain kinds remain the contract for emitters,
mirrors, and tests.

**Node flags** map to UI treatment:

| Flag | Meaning | Treatment |
|---|---|---|
| `REVIEW_REQUIRED` | EIS contribution history at 57 unknown | warn tone, blocks review |
| `UNVERIFIED` | PCB entered, not yet checked against source | warn tone + verify affordance |
| `NOT_ENTERED` | PCB absent — net pay is unknown | the figure renders as unknown, **not zero** |
| `NO_OP` | rounding or proration changed nothing | collapse by default |

`SEN_UNKNOWN` is a real value in this system. A net pay whose PCB has not been
entered is *unknown*, and the facade must render it as such. Substituting zero is
the single most damaging thing the presentation layer could do.

---

## 5. Facade rules

These follow from the layering. Each one, if broken, silently converts a verified
system into an unverifiable one.

1. **Never recalculate.** The renderer reads persisted values and trace. No
   component adds, prorates, or applies a rate. If the number isn't there, add a
   root. Per-root variance comes from `rootVariances` on the workspace DTO.
2. **Never format money by hand.** Sen in, `MoneyCell` (and shared payroll
   widgets) out — tabular-nums, unknown/not-applicable states preserved.
3. **Never write prose about a figure.** Labels are `key + params` rendered by
   `renderLabel(label, lang)`. A hardcoded English sentence next to a number is how
   the words drift from the arithmetic, and it makes the Malay payslip impossible.
4. **Never recalculate PCB in the UI.** The browser reads the persisted /
   server-resolved figure. The server may resolve PCB via evidenced override or
   offline LHDN 2026 computerized MTD (`COMPUTED`); absent resolution stays
   `SEN_UNKNOWN` / null — never silently zero. Do not scrape the HTML calculator
   or claim `LHDN_VERIFIED` without a human IRBM process.
5. **Never render `NOT_APPLICABLE` as blank.** A zero owed to statute and a zero
   from a failed lookup must not look alike; the whole node kind exists to keep
   them distinguishable.
6. **Never resolve citations client-side from a hardcoded map.** Nodes carry
   `(ruleId, sourceRef)`; the issuer, URL and SHA-256 come from the rule pack join
   at render time. Reading a manifest with an unknown id is a **strict reject** with
   a clear error — never a silently dropped citation.
7. **Colour follows stock shadcn tokens** in [`src/web/shadcn.css`](../../src/web/shadcn.css)
   (`background`, `primary`, `muted`, `destructive`, `chart-*`, …). No raw hex, no
   Tailwind palette utilities (`bg-blue-500`), no resurrected Straits
   `brand` / `status-*` / `section-*` theme families. Document/print colour uses
   `--doc-*` in `payslip-print.css` only (light theme; never remapped under `.dark`).
   Palette-leak guard: `tests/domain/web-palette-leak.test.ts`.
8. **Never bypass `payrollApi`.** All product HTTP goes through
   `types.ts` → `client.ts` → `payroll-api.ts`. No page-local `fetch` to `/v1`.
9. **Never authorize in the UI.** Hide nav/actions with presentation predicates
   (`isSystemAdminPresentation`, workspace `actionAvailability`) — server RBAC
   remains the source of truth. A 403 is correct behaviour, not a bug to paper over.
10. **Never invent Next/tRPC structure.** Paths are Vite + Wouter + Hono REST.
    UI atoms come from `/rui` `/cui` `/iui`, not freehand layout systems.

---

## 6. Screen mapping

| Screen | Page / panel | Reads / writes via `payrollApi` |
|---|---|---|
| Dashboard | `src/web/dashboard/dashboard-page.tsx` | `getPayRuns` |
| Pay-run list | `src/web/payrun/pay-run-list.tsx` | `getPayRuns`, `createPayRun` |
| Workspace | `src/web/payrun/workspace.tsx` | `getWorkspace`, recompute/review/approve, gates, payments, artifacts, seal, close |
| Totals strip | `panels/totals-strip.tsx` | workspace tiles (`currentSen` + server variance) |
| Employee grid / sheet | `employee/employee-grid.tsx`, slide-over | roots + `rootVariances` |
| Drill-down | derivation drawer | `getLineDerivation` |
| Run / line diff | `employee/employee-diff.tsx`, `panels/run-diff-panel.tsx` | `getLineDiff` / workspace variances |
| Findings / gates | findings panel, gate dialog | `getFindings`, `scanFindings`, `acknowledgeFinding`, `evaluateGate` |
| Payments / release | payments / release panels, batch drawer | hold/unhold/withdraw, preview/commit release, settle/reconcile/cancel |
| Closure / seal / artifacts | closure panels | checklist, close, seal, chain, artifact upload/download |
| Payslip | `payslip-page.tsx` + `payslip-document/` | `getPayslip`, `getPayslipIndex` |
| Control SPA | `src/web/control/control-page.tsx` | runs + findings + gates + seal overview |
| Reports | `src/web/reports/reports-page.tsx` | payment-register, statutory-summary, exception-report, annual remuneration |
| Employees / import | `employees-page.tsx`, import panel | `getEmployees`, import template + POST |
| Companies (admin) | `companies-page.tsx` | admin companies CRUD |
| Admin users | `admin-page.tsx` | invite / status / roles |
| Transfer / treatments | (API-first; UI as wired) | `commitTransfer`, treatment/PCB departure POSTs |

Nav dests: `/`, `/pay-runs`, `/employees`, `/reports`, `/control`, `/companies`
(admin), `/admin` (admin). Nested pay-run paths (workspace panels, payslip) do
**not** get separate `APP_NAV_ITEMS` entries.

**On the AutoCount reference.** Its process screen is a good grid — see the hybrid
worked out in [workspace-grid.md](../palette/workspace-grid.md) — and its per-line
scheme tags ("SOCSO & EIS | Tax") are the right instinct. The structural difference
is that those tags are a *label*, whereas here every cell is a graph root and the
tag is derivable from the pay-item matrix flags that actually drove the wage bases.
The facade's job is to expose that, not to reproduce a grid that can only assert.

---

## 7. What the facade owns

Layout, navigation, selection, keyboard model, empty and loading states, formatting
via the shared renderers, and the collection of user intent. It owns **no** payroll
truth. The test: delete the facade and every statutory figure, citation and
explanation still exists and is still provable. That is currently true, and it is
worth keeping true.

---

## 8. Seams — closed and open

### Closed (do not re-open as "missing")

- **L4/L5 payroll workspace + control HTTP** — workspace, derivation drawer,
  findings, gates, review/approve/demote, payments, release, closure, seal,
  artifacts are built and wired. `PayRunMutationEnvelope` is consumed on lifecycle
  mutations.
- **Per-statutory-root variance** — `loadWorkspaceView` emits
  `rootVariances` per root; grid / slide-over / run-diff consume via `DeltaBadge`.
- **Payslip document + print CSS** — production payslip document under
  `src/web/payrun/payslip-document/` with light-only `--doc-*` tokens.
- **Graph lifecycle (compute-on-read)** — `loadDerivedGraph()` in
  `src/service/line-derivation.ts` re-derives on every read, runs
  `assertGraphInvariants` + `assertMirrors`, and does **not** persist the DAG.
  Settled architecture, not an open design question.

### Still open

- **Derivation presentation fidelity.** Domain has 11 kinds; HTTP
  `DerivedNodeDto` collapses to 7 via `mapKind` (§4). Full per-kind drill-down
  UI needs a wider DTO (or a parallel domain payload), not panel inventiveness.
- **Rule-pack citation join at render time.** Nodes carry `(ruleId, sourceRef)`;
  a dedicated query layer that hydrates issuer / URL / SHA-256 for the payslip
  annex must remain a strict reject on unknown ids (§5.6). Incomplete surfaces
  must not silently drop citations. (`citationStatus: RESOLVED | UNRESOLVED` is
  already on the DTO — unresolved must surface, never disappear.)
- **Fat / debt surfaces.** Prefer companies layering for new code. Workspace is
  still mostly route → repo (no dedicated service). Employees / payslip routes
  have carried fat SQL historically — extract carefully; do not add more SQL to
  routes.
- **Transfer / treatments UI.** HTTP exists; shell pages may be thin or absent.
  Do not mock — wire `client.ts` → `payrollApi` → page when building UI.

---

## 9. Full-stack file inventory

### Domain (L0–L2 + shared)

| Area | Path |
|---|---|
| Calc engine | `src/domain/calc/*` (`compose.ts` entry) |
| Derive / diff / i18n | `src/domain/derive/*` |
| Findings | `src/domain/findings/*` |
| Artifacts store | `src/domain/artifacts/*` (local-fs / R2 / memory) |
| RBAC pure | `src/domain/rbac/{types,authorize,email}.ts` |
| Seal / timestamp | `src/domain/seal/`, `src/domain/timestamp/` |
| Money / date / IC | `src/domain/money.ts`, `date.ts`, `ic.ts`, `sum-nullable-sen.ts` |
| Import row parse | `src/domain/import/employee-row.ts` |

### Service (`src/service/`)

| File | Primary exports |
|---|---|
| `rbac.ts` | `requirePermission`, `listEffectivePermissions`, `listAccessibleCompanies`, `requireSystemAdmin` |
| `admin-users.ts` | invite / list / status / assign / revoke |
| `admin-companies.ts` | `CompanyDirectoryRow`, list/create/update |
| `employees.ts` | `listEmployeesForActor` |
| `employee-import.ts` | template + import `*ForActor` |
| `employee-remuneration.ts` | annual summary `*ForActor` |
| `payrun.ts` | create/recompute/review/approve/demote `*ForActor`, `PayRunError` |
| `pay-run-mutation-envelope.ts` | `loadPayRunMutationEnvelope` |
| `run-findings.ts` | scan / list / acknowledge |
| `gates.ts` | `evaluateGate`, `certifyGate` |
| `payments.ts` / `release.ts` / `close.ts` | control plane |
| `artifacts.ts` | store / list / read `*ForActor` |
| `closure-seal.ts` / `manifest-timestamp.ts` | seal + TSA |
| `line-derivation.ts` | `getLineDerivation` |
| `pay-run-reports.ts` | payment-register / statutory / exception |
| `transfer.ts` / `treatments.ts` / `findings.ts` | transfer + departures + shared findings |
| `revision.ts` | `stampCalcRevision` |
| `control-errors.ts` | `ControlError` |

Convention: `*ForActor` = RBAC at service boundary.

### Repo (`src/repo/`)

`rbac`, `companies`, `employees`, `employee-profile`, `employee-remuneration`,
`pay-run`, `workspace`, `pay-line-roots`, `payslip`, `artifacts`,
`pay-run-reports`, `rule-pack`, `rule-pack-schema`, `rule-resolution`.

### Frontend API + pages

| Piece | Path |
|---|---|
| DTOs | `src/web/api/types.ts` |
| Client factory | `src/web/api/client.ts` |
| Facade | `src/web/api/payroll-api.ts` |
| Errors UI | `src/web/api/format-error.ts` |
| Auth context | `src/web/context/auth-context.tsx` |
| Routes | `src/web/app.tsx` |
| Nav | `src/web/shell/app-nav.ts` |
| Feature pages | `src/web/<feature>/*-page.tsx` |
| Theme | `src/web/shadcn.css` |
| Print tokens | `src/web/payrun/payslip-document/payslip-print.css` |

---

## 10. Error flow

```
Domain / service / repo throw
  → route try/catch → handleRouteError(c, error)   // src/server/errors.ts
    → HTTP status + JSON { code, message }
      → createApiClient.toApiError
        → ApiClientError(code, message, status)
        → or SessionExpiredError (401 after retry / token failure)
          → page / hook: formatApiError(err) → toast or inline
```

### Server mapping (`handleRouteError`)

| Thrown type | HTTP | Body `code` |
|---|---|---|
| `AuthError` | 401 if `UNAUTHORIZED`, else 403 | auth code |
| `PermissionDeniedError` | 403 | `PERMISSION_DENIED` |
| `AdminUsersError` / `EmployeeImportError` / `ControlError` / `PayRunError` | their `.status` | their `.code` |
| `ZodError` | 400 | `VALIDATION_ERROR` |
| `RbacRepoError` / `CompanyRepoError` | 409 if conflict-like message, else 400 | `CONFLICT` / `VALIDATION_ERROR` |
| anything else | 500 | `INTERNAL_ERROR` (+ `console.error`) |

### ControlError defaults

`NOT_FOUND` → 404;
`GATE_BLOCKED` / `INVALID_STATE` / `STALE_REVISION` / `SCAN_INCOMPLETE` / `CONFLICT` → 409;
else → 400.

### Client classes

- **`ApiClientError`** — server `code` + `message` + HTTP `status`
- **`SessionExpiredError`** — auth/token path; triggers re-auth / sign-out flows
- **`formatApiError`** — `"CODE: message"` for UI; also used by
  `use-async-load` / `use-dialog-submit`

---

## 11. Diagnostic playbook

Use this when repairing fullstack breaks. Fix **producer before consumer**;
schema → repo → service → route → `types.ts` / `client.ts` → page / nav.

| Symptom | Layer | Check |
|---|---|---|
| 404 on new endpoint | L4/L5 | Route factory registered in `src/server/app.ts`? Path string in `client.ts` exact match? Typo in `:runId` segment? |
| Method exists in service but UI 404 | L4 | Route module exports handler? Mounted on `v1`? |
| DTO shape mismatch / undefined field | L4/L5 | Service JSON changed without `types.ts` mirror? Sync comment present? No `as any` papering over drift |
| 401 | L4 auth | Bearer missing? Neon Auth token acquire failing? JWKS / `NEON_AUTH_BASE_URL`? |
| 403 `INVITE_REQUIRED` | L4 auth | App `users` row missing — run `npm run setup:dev-user` / `invite-user` |
| 403 `PERMISSION_DENIED` | L4 RBAC | `requirePermission` resource/action/companyId correct? Role assignment exists? SYSTEM_ADMIN short-circuit expected? |
| 409 `GATE_BLOCKED` / `STALE_REVISION` | L4 control | Re-fetch workspace / envelope; refresh `calcRevision`; resolve open findings |
| 400 `VALIDATION_ERROR` | L4 | Zod schema vs body; repo validation message |
| 500 `INTERNAL_ERROR` | L3/L4 | Server log; migration applied?; repo column select; unhandled throw |
| Column / relation not found | L3 | Schema edited? `db:generate` + migrate? Repo query updated? |
| UI shows stale figures after mutation | L5 | Page re-fetches workspace / envelope? Optimistic UI discarding server roots? |
| Nav item missing | L5 | `APP_NAV_ITEMS` + `APP_SHELL_ROUTE_PATHS` + `<Route>` in `app.tsx`? `adminOnly` + system-admin presentation? |
| Developer Login not SYSTEM_ADMIN | L5/ops | `npm run setup:dev-user` always assigns SYSTEM_ADMIN; `npm run auth:smoke` asserts full `/me/permissions` matrix |
| Money shows `0.00` when PCB missing | L5 | Must render unknown / `SEN_UNKNOWN` — never coerce null sen to zero |
| Palette / theme leak | L5 | Using hex or `bg-blue-*`? Remapping should use shadcn tokens; print uses `--doc-*` only |
| Calc wrong vs golden | L1 | Do not update fixture; fix `domain/calc` / rule pack data |
| Drill-down disagrees with roots | L2 | `mirror.ts` / emitter bug — fix `derive`, not the UI |
| Citation missing on payslip | L2/L3 | Unknown `sourceRef` must hard-fail; check rule-pack join |

### Repair order (vite-fullstack Mode B)

1. Inventory mismatch (DTO / client↔route / nav↔page / schema↔repo / auth)
2. Fix schema → migrate → repo → service (+ RBAC) → route Zod → `app.ts`
3. Mirror FE `types.ts` + `client.ts` method → `payrollApi` wrap
4. Page loading/errors + nav Route
5. File headers (`@feature` / `@layer`; hubs `@chain`) on touched trees

### Quick greps

```bash
rg "@feature companies" src tests
rg "@chain" src
rg "payrollApi\." src/web
rg "v1.route" src/server/app.ts
rg -L --glob '*.ts' --glob '*.tsx' '@feature ' src/web/api src/server/routes
```
