# Continuous development — operating manual

Load this when **building the next increment** and you already know Mode A/B exists. Complements (does not replace):

| Doc | Use when |
|-----|----------|
| `feature-checklist.md` | Step-by-step create spine (checkboxes) |
| `drift-audit.md` | Something is wrong / unwired / shape-skewed |
| `companies-trace.md` | Need a concrete gold-path file list |
| `layer-map.md` / `stack.md` | Path or stack uncertainty |
| `feature-surface-map.md` | Live inventory of routes/SPA/DTOs/layering grades |
| `extension-patterns.md` | Copy-paste templates for common next features |
| **this file** | Decide *what kind* of work, *how* to extend, debt/DoD rules |

---

## 1. Purpose

Agent job: ship vertical slices without re-deriving architecture. Prefer **companies / workspace / artifacts** shapes. Treat **employees** and **payslip** as debt surfaces (patch carefully or extract — §8).

Hard stack (never invent Next/tRPC): Vite SPA + Wouter + Hono `/v1` + Drizzle + hand-mirrored `types.ts` + `client.ts` → `payrollApi`.

---

## 2. Decision tree

```
What is changing?

A) Marketing only (landing.html / src/marketing/*)
 → UI + marketing tests only. No /v1, no shell nav, no payrollApi.
 → Do not import src/web/styles.css or product pages.

B) UI atom only (no new JSON / DB column)
 → components/ui | components/payroll | src/web/<feature>/
 → No fake API. Studio blocks: compose only; no I/O/RBAC inside shadcn-studio.

C) Page/shell only, API already correct
 → page + app.tsx Route (+ app-nav if shell dest) + PageTitle
 → Confirm client path + DTO parity first (else Mode B / extend API).

D) New/changed HTTP JSON, same tables
 → service (+ RBAC) → route Zod → app.ts → types + client.ts → payrollApi → page

E) New/changed persistence
 → schema → db:generate → migrate → repo → then D

F) New pure calc/rule (domain)
 → src/domain/* (no I/O) → tests/domain → call from service (not route) → surface via D/E

G) New RBAC resource/action
 → domain/rbac/types + db/schema/enums (1:1) → migrate → seed/matrix → service require* → FE hide only
```

| Ask sounds like… | Branch |
|------------------|--------|
| "admin directory like companies" | E then D; `requireSystemAdmin` |
| "list under company scope" | D; `listAccessibleCompanies` / `requirePermission(…, companyId)` |
| "panel on pay-run workspace" | Prefer nested under `/pay-runs/:runId`; extend workspace DTO or dedicated `/v1/pay-runs/:runId/…` |
| "download/upload file" | Artifact pattern (`ArtifactStore` + `service/artifacts` + control routes) |
| "just the page" + API missing | **Do not mock** — add route → `client.ts` → `payrollApi` or stop |

---

## 3. Extension patterns (path-level)

Gold detail: [companies-trace.md](companies-trace.md). Templates: [extension-patterns.md](extension-patterns.md).

### 3.1 New admin CRUD resource (mirror companies)

| Step | Path |
|------|------|
| Schema (if needed) | `src/db/schema/<module>.ts` → migrate |
| Repo | Prefer `src/repo/<name>.ts` (list/get/write); companies today lists via `repo/rbac`, writes in service — **new** writes → repo |
| Service | `src/service/admin-<resource>.ts` — `requireSystemAdmin` first; export `*DirectoryRow` + ISO dates |
| Route | `src/server/routes/admin-<resource>.ts` — thin Zod + `c.get("user")` |
| Register | `src/server/app.ts` → `v1.route("/", admin…Routes(deps.db))` |
| FE | `types.ts` (`Keep in sync with …`) → **`client.ts` method** → `payroll-api.ts` wrap |
| UI | `src/web/<feature>/*-page.tsx` + `app.tsx` + `app-nav.ts` (`adminOnly: true`) |
| Test | `tests/db/…` happy path + non-admin 403 |

Canon: `AdminCompanyRow` ↔ `CompanyDirectoryRow` in `src/service/admin-companies.ts`.

### 3.2 Tenant-scoped list/detail under shell

- Authz: `requirePermission(db, userId, resource, action, companyId)` or scope via `listAccessibleCompanies` (never dump all tenants).
- Query: optional `companyId` must be in accessible set (see employees intent — but **extract** SQL to repo for new code).
- Shell: `/employees`-class dest → `APP_SHELL_ROUTE_PATHS` + `APP_NAV_ITEMS` + `<Route>`.
- FE: scope from `scope-context` / `me` companies; call `payrollApi` only.

### 3.3 Nested resource under pay-run

- HTTP: `/v1/pay-runs/:runId/…` in a route module (or extend `pay-run-control.ts` / `pay-run.ts` if same lifecycle cluster).
- Access: `requirePayRunAccess(db, userId, action, runId)` from `src/server/routes/pay-run-access.ts` **or** service `requirePayRunPermission`.
- FE route: `app.tsx` nested path (e.g. `/pay-runs/:runId/payslip/:lineId`) — **no** new `APP_NAV_ITEMS` entry.
- Breadcrumb: auto via `resolveAppNavItem` prefix match under `/pay-runs` — do not invent a second nav source.
- Client: `requestJson` under `/v1/pay-runs/${runId}/…`.

Workspace read-model gold: `repo/workspace.ts` → `pay-run-workspace.ts` → `getPayRunWorkspace` → `src/web/payrun/workspace.tsx`.

### 3.4 New domain calc → API/UI

```
src/domain/calc|findings|derive|… (pure)
 → tests/domain|tests/findings
 → src/service/* orchestrates (loads rows, calls domain, persists)
 → route returns stored/read-model JSON (not recompute in route)
 → types.ts + client → page/panel
```

Do **not** import Drizzle in `src/domain`. Engine example: `service/payrun.ts` → `computeLineChecked` from `domain/calc/compose`.

### 3.5 New RBAC permission/resource

| Layer | Action |
|-------|--------|
| Domain | Extend `PermissionResource` / lists in `src/domain/rbac/types.ts` |
| DB | Mirror `pgEnum` in `src/db/schema/enums.ts` **literally** (enums test enforces) |
| Migrate | `npm run db:generate` + migrate |
| Seed / roles | Update permission matrix seed as needed |
| Service | `requirePermission` / `requireSystemAdmin` |
| FE | Nav `adminOnly` / hide controls only — **never** security |

Closed resources today: `COMPANY | EMPLOYMENT | PAY_RUN | PAY_ITEM | RULE_PACK | REPORT`. Prefer reusing before adding.

### 3.6 Schema change touching hand-mirrored DTOs

**Producer-first order (mandatory):**

1. Schema + migration
2. Repo/service DTO mapper (ISO strings for dates)
3. Route JSON (Zod if body/query)
4. `src/web/api/types.ts` field-for-field + `/** Keep in sync with <producer path> */`
5. `client.ts` generic `T`
6. Page/UI

`requestJson<T>` **casts** — TS will not catch FE/BE skew. No `as any`. No dual deprecated fields on new code (`evidenceArtifactId` not `evidenceRef`).

---

## 4. Layer contracts

| Layer | May | Must not |
|-------|-----|----------|
| `db/schema` | Tables, enums, relations | Business rules, HTTP |
| `repo` | Drizzle queries; serializable DTOs | RBAC, Zod, React |
| `domain` | Pure calc/authorize types | DB, fetch, Hono, env I/O |
| `service` | RBAC (`require*`), orchestration, map rows→DTO | Render UI; skip authz on public mutations |
| `routes` | Zod parse, `c.get("user")`, call service, JSON | Fat SQL / giant DTO builders (new code) |
| `app.ts` | CORS, `/health`, `v1` + authMiddleware, register routes, inject `artifactStore` | Business logic |
| `types.ts` | Hand-mirrored FE contracts + sync comments | Fetch |
| `client.ts` | All HTTP (`requestJson` / raw / text) | Page-only one-off fetch modules |
| `payroll-api.ts` | Thin facade / singleton | New `fetch` logic that skips `client.ts` |
| Page / panel | `payrollApi`, Skeleton, `formatApiError` | Direct `fetch`, FE-only authz as security |
| `shadcn-studio` | Presentational blocks | `payrollApi`, Drizzle, RBAC |

---

## 5. DTO discipline

1. **Producer owns the shape** — export type next to service/repo (or document route-local DTO only when already established, e.g. payslip).
2. **FE mirror** in `src/web/api/types.ts` — identical keys, nullability, string unions.
3. **Sync comment** on every hand-mirrored type: `Keep in sync with <path>`.
4. **Dates**: DB `Date` → ISO string at service/repo boundary before JSON.
5. **Cast risk**: `requestJson` returns `as T`. After any producer field change, update FE type in the **same** change set.
6. Prefer `readonly` on public DTOs.

---

## 6. Registration discipline — 3 spines

| Spine | File | When |
|-------|------|------|
| API | `src/server/app.ts` `v1.route("/", …Routes(deps.db))` | Every new route module (extra deps e.g. `artifactStore` when needed) |
| Wouter | `src/web/app.tsx` `<Route path=…>` | Every navigable page (incl. nested) |
| Nav | `src/web/shell/app-nav.ts` `APP_SHELL_ROUTE_PATHS` + `APP_NAV_ITEMS` | **Shell destinations only** (assertNavMatchesRoutes enforces 1:1) |

**Breadcrumbs / titles**

| Need | Where |
|------|-------|
| Section label / nested crumb | Automatic from `app-nav` + `shell-breadcrumb.tsx` (`matchPrefix`) |
| Page H1 | `PageTitle` in the page (`shell/page-title.tsx`) — set per page |
| Nested under pay-runs | Route in `app.tsx` only; crumb uses last path segment |

Nested routes **must** be in `app.tsx`; **must not** invent orphan nav hrefs.

---

## 7. Testing & env — when mandatory

| Change | Mandatory |
|--------|-----------|
| Schema / migration | `db:generate` + migrate; enums touch → `tests/db/enums.test.ts` still green |
| Authz / admin / RBAC | `tests/db/…` with `createApp` + 403 case |
| Persistence / HTTP contract | `tests/db/<feature>.test.ts` (inject DB + JWT verifier; artifacts → `MemoryArtifactStore`) |
| Pure domain rule | `tests/domain/…` (or `tests/findings/…`) |
| New env var | `src/server/env.ts` (server) and/or `VITE_*` + **`.env.example`** |
| Marketing copy/layout gates | `tests/marketing/…` |
| UI-only atom | No API test required |

Test style: Vitest; DB harness `tests/db/harness/database.ts`; seed via `scripts/seed` when needed.

---

## 8. Debt protocol (employees / payslip / fat routes)

**Debt markers:** SQL or large DTO assembly in `src/server/routes/employees.ts`, `pay-run-payslip.ts`, parts of remuneration reports.

| Touch size | Rule |
|------------|------|
| Typo / one field / sync comment | Patch in place; add/keep `Keep in sync`; do not expand fatness |
| New endpoint sibling on same resource | **Extract** repo (+ service if authz/orchestration) for the new path; leave old handler only if out of scope |
| Shape change to fat DTO | Extract mapper to `repo/` or `service/` in the same PR as the shape change |
| Greenfield near debt | Do **not** copy fat-route style — use companies / workspace layering |

Never "fix" debt by adding a parallel `fetch` helper or FE-only type that diverges.

---

## 9. Definition of done (micro-checklist)

Stricter than SKILL "Done when" — tick for every continuous increment that touches API or shell:

```
Increment DoD:
- [ ] Correct branch of decision tree (§2); marketing vs product not mixed
- [ ] Layering: no new SQL-in-route; RBAC in service (or requirePayRunAccess → requirePermission)
- [ ] Schema changed ⇒ migration generated (not hand-edited) and applied locally
- [ ] Route module registered in app.ts under /v1 + authMiddleware
- [ ] FE: types.ts sync comment + client.ts method BEFORE payrollApi wrap
- [ ] payrollApi path/method match Hono; no parallel fetch*
- [ ] Page uses payrollApi + Skeleton/use-async-load + formatApiError
- [ ] app.tsx Route present; shell dest ⇒ app-nav both arrays; adminOnly if system-admin
- [ ] Nested route: app.tsx only (no fake nav item)
- [ ] Producer-first DTO order; requestJson cast acknowledged (fields match JSON)
- [ ] Tests per §7; .env.example if new env
- [ ] Debt surfaces: extract-or-patch rule followed (§8)
```

If any box fails, feature is not done — even if the UI "looks wired."
