# Extension patterns — copy-paste templates

Terse recipes for the next feature. Gold end-to-end file list: [companies-trace.md](companies-trace.md). Operating rules: [continuous-dev.md](continuous-dev.md). Live inventory: [feature-surface-map.md](feature-surface-map.md).

---

## 1. Admin directory resource

**Goal:** System-admin list/create/patch directory (companies / users class).

**Gold:** [companies-trace.md](companies-trace.md) — `admin-companies` + `CompaniesPage`.

### File touch list (ordered)

1. `src/db/schema/…` (+ `npm run db:generate` / migrate) — if new table
2. `src/repo/<resource>.ts` — list/get/insert/update returning DTOs
3. `src/service/admin-<resource>.ts` — `requireSystemAdmin`; `to*Row` with `toISOString()`
4. `src/server/routes/admin-<resource>.ts` — Zod bodies; `GET/POST /admin/…`, `PATCH /admin/…/:id`
5. `src/server/app.ts` — `v1.route("/", admin…Routes(deps.db))`
6. `src/web/api/types.ts` — row + create/patch bodies + `Keep in sync with …`
7. `src/web/api/client.ts` — `get/create/update…` via `requestJson`
8. `src/web/api/payroll-api.ts` — re-export wraps only
9. `src/web/<feature>/<name>-page.tsx` — load on mount; Skeleton; `formatApiError`
10. `src/web/app.tsx` + `src/web/shell/app-nav.ts` (`adminOnly: true`)
11. `tests/db/<feature>.test.ts` — 200 + non-admin 403

### Shape notes

```ts
// service: export type XDirectoryRow = { readonly id: string; …; readonly createdAt: string }
// route: thin — parse → service(db, { actorUserId: c.get("user").id, … }) → c.json
// client: requestJson<XRow>("/v1/admin/…", { method, body: JSON.stringify(…) })
```

### Failure modes

| Fail | Fix |
|------|-----|
| Route file exists, 404 | Missing `app.ts` register |
| UI shows undefined new field | Producer DTO first; then types.ts (cast hides skew) |
| Non-admin can mutate | Missing `requireSystemAdmin` in service |
| Nav link, blank page | `app-nav` without `app.tsx` Route |

---

## 2. Company-scoped entity CRUD

**Goal:** Tenant data filtered by accessible companies (employment-like), with `requirePermission`.

### File touch list (ordered)

1. Schema/repo as needed
2. `src/service/<entity>.ts` — `requirePermission(db, userId, "EMPLOYMENT"|"…", action, companyId)`; use `listAccessibleCompanies` for list scope
3. `src/server/routes/<kebab>.ts` — query/body Zod; reject `companyId` outside accessible set
4. Register `app.ts`
5. `types.ts` → `client.ts` → `payrollApi`
6. Page under `src/web/<feature>/`; shell dest if top-level list
7. `tests/db/…` — wrong-company 403; empty accessible → `[]`

### Shape notes

- List: `companyId?` + `search?` query params (match existing employees client params style).
- **Do not** copy SQL-from-`employees.ts` into the route — put joins in `repo/`.
- FE: pass scoped `companyId` from scope context when set.

### Failure modes

| Fail | Fix |
|------|-----|
| Cross-tenant leak | Always intersect with accessible IDs |
| FE-only filter | Server must enforce |
| New fat route | Extract repo before merge |

**Contrast:** `routes/employees.ts` is debt — intent is right, layering is not the template.

---

## 3. Read-model / workspace view

**Goal:** Aggregate read facade for a run (or similar) — no recalc in the route.

**Gold:** `src/repo/workspace.ts` → `pay-run-workspace.ts` → `getPayRunWorkspace` → `src/web/payrun/workspace.tsx`.

### File touch list (ordered)

1. `src/repo/<view>.ts` — compose from existing tables; export `*View` types
2. Route `GET /v1/pay-runs/:runId/<view>` — `requirePayRunAccess(…, "READ", runId)` then `load…`
3. Register if new module
4. Mirror view in `types.ts` (`Keep in sync with src/repo/…`)
5. `client.ts` getter
6. Page/panel in `src/web/payrun/` (or feature folder)
7. Nested `app.tsx` route if new URL; usually **no** nav item
8. `tests/db/pay-run-workspace.test.ts`-style contract test

### Shape notes

```ts
// repo: arithmetic only for tiles/sums of stored sen — not domain/calc engine
// route: if null → 404 JSON { code, message }
// FE: one get*Workspace call; panels consume view slices
```

### Failure modes

| Fail | Fix |
|------|-----|
| Recompute in GET | Move engine to service mutation; view reads stored lines |
| DTO drift on nested tiles | Sync entire view type; update producer mapper first |
| 403 vs 404 confusion | Missing run → NOT_FOUND; no permission → PermissionDenied |

---

## 4. Artifact-backed download/upload

**Goal:** Bytes in `ArtifactStore`; metadata in DB; SPA uses authenticated content GET.

**Present:** `domain/artifacts/store.ts` (+ `local-fs-store`, `r2-store`, `MemoryArtifactStore`); `service/artifacts.ts`; HTTP in `pay-run-control.ts`; client `uploadArtifact` / `downloadArtifact`.

### File touch list (ordered)

1. Confirm `ArtifactType` / schema enums cover the new kind (migrate if new)
2. Prefer existing `storeArtifactForActor` / `listRunArtifactsForActor` / `readRunArtifactContentForActor`
3. If new HTTP verb/path: add to `pay-run-control.ts` (or thin module) + `requirePayRunAccess`
4. `createApp` calls `setArtifactStore` when `artifactStore` is provided — do not re-set inside route factories
5. `types.ts` — `ArtifactRow` sync with `ArtifactListItem`
6. `client.ts` — JSON via `requestJson`; **content** via raw/blob helper (existing download path)
7. UI panel (e.g. `artifacts-panel.tsx`) — `payrollApi` only
8. Test with `MemoryArtifactStore` + `setArtifactStore` / `createApp({ artifactStore })`

### Shape notes

- DB owns metadata + sha256; store owns bytes only.
- Object key helper: `artifactObjectKey(runId, artifactId, filename)`.
- Internal writers (close/release) may call `storeArtifact` without actor; HTTP must use `*ForActor`.
- Env: R2 five-pack documented in `.env.example` — all-or-nothing.

### Failure modes

| Fail | Fix |
|------|-----|
| SPA opens signed URL / `file://` | Use authenticated `/artifacts/:id/content` only — no `/url` route |
| Tests hit real R2 | Inject `MemoryArtifactStore` |
| Upload without PAY_RUN UPDATE | Missing `*ForActor` RBAC |
| New store wiring forgotten | Pass `artifactStore` in `createApp` / `AppDeps` |

---

## 5. Pure domain rule + API exposure

**Goal:** New statutory/calc/findings rule, then expose results through existing or new API.

### File touch list (ordered)

1. `src/domain/<area>/<rule>.ts` — pure functions + types
2. `tests/domain/…` or `tests/findings/…` — vectors first
3. `src/service/…` — load inputs from repo, call domain, persist outputs
4. Route only if new HTTP; else existing mutation/read already returns stored fields
5. If JSON shape changes: producer DTO → `types.ts` → client → UI
6. Golden/DB parity tests if pay numbers change (`tests/golden/…`, `tests/db/golden-parity.test.ts`)

### Shape notes

```ts
// domain: (inputs) => outputs — no Database, no Hono
// service/payrun.ts pattern: computeLineChecked(...) then write payLines
// route: never import domain/calc directly for new features
```

### Failure modes

| Fail | Fix |
|------|-----|
| Domain opens DB | Move I/O to repo/service |
| UI recomputes statute | Display stored roots/items only |
| Enum/resource changed without migration | Keep `domain/rbac/types` ↔ `enums.ts` 1:1 |

---

## 6. Shell nav destination + nested route without nav item

### 6A — New shell destination

**Goal:** Top-level signed-in page in sidebar/command palette.

### File touch list (ordered)

1. `src/web/<feature>/*-page.tsx` (+ `PageTitle`)
2. `src/web/app.tsx` — `<Route path="/…" component={…} />`
3. `src/web/shell/app-nav.ts` — add to **both** `APP_SHELL_ROUTE_PATHS` and `APP_NAV_ITEMS` (same href)
4. Set `adminOnly: true` if system-admin only
5. Wire API first if page needs data (patterns 1–3)

`assertNavMatchesRoutes()` throws if arrays diverge.

### 6B — Nested route, no nav item

**Goal:** Detail under an existing section (payslip, future run tabs).

### File touch list (ordered)

1. Page/panel component
2. `app.tsx` only — e.g. `/pay-runs/:runId/payslip/:lineId` **before** or ordered so Wouter matches correctly vs `/pay-runs/:runId`
3. **Do not** add `APP_NAV_ITEMS` / `APP_SHELL_ROUTE_PATHS` entry
4. Rely on `matchPrefix` under parent (`/pay-runs`) for breadcrumb section label
5. `client.ts` method for the nested resource

### Failure modes

| Fail | Fix |
|------|-----|
| Nav href not in PATHS | Update both arrays |
| Nested URL 404 in SPA | Missing `app.tsx` Route |
| Nested item in PATHS without sidebar desire | Remove from nav arrays; keep Route |
| Wrong active nav | Adjust `matchPrefix` / href specificity (`resolveAppNavItem` picks longest) |
| Marketing link into shell | Marketing stays on `landing.html` / `src/marketing`; product SPA is separate entry |

---

## Quick chooser

| Next feature | Pattern |
|--------------|---------|
| Admin table CRUD | §1 (+ companies-trace) |
| Company employees/items CRUD | §2 |
| Run dashboard / tiles / summary GET | §3 |
| File attach/download on run | §4 |
| EPF/PCB/findings rule | §5 |
| New sidebar page | §6A |
| Payslip-like deep link | §6B |
