# Drift audit — FE / BE / DB alignment

Use when the UI is wrong, API 404/403/shape errors appear, types lie, or "frontend not wired to backend."

## Procedure

1. Pick the feature surface (page path, `payrollApi` method, or `/v1/…` route).
2. Trace **down** the stack (page → client → route → service → repo → schema) and **up** for orphans.
3. Record every mismatch in the report table below.
4. Fix in layer order: schema → migration → repo → service → route → FE types/client → page/nav/tests.
5. Do not "fix" with `as any`, duplicate DTOs under new names, or client-only validation.

## Detection checklist

### A. DTO / contract skew

- [ ] Compare `src/web/api/types.ts` (and payslip-local types if relevant) to route JSON / repo DTO fields
- [ ] Optional vs required, nullability, and date string vs Date object
- [ ] Deprecated dual fields still used on one side (`evidenceRef` vs `evidenceArtifactId`, rule-pack boolean mirrors)
- [ ] Enum string unions differ between FE and domain/DB
- [ ] Missing `Keep in sync with …` on hand-mirrored FE types (process smell; add when touching)

#### Example — DTO skew (bad → good)

**Bad (silent break):** FE `AdminCompanyRow` adds `status: string` for a badge. Service still returns `CompanyDirectoryRow` without `status`. UI shows `undefined`; TypeScript does not catch it because `requestJson` casts JSON.

**Good:**
1. Add `status` to schema (if persisted) → migrate → map in `toDirectoryRow` / `CompanyDirectoryRow`.
2. Mirror the same field on `AdminCompanyRow` in `src/web/api/types.ts` with `Keep in sync with src/service/admin-companies.ts`.
3. Only then render the badge on `companies-page.tsx`.

| Severity | Finding | Evidence | Fix files |
|----------|---------|----------|-----------|
| high | FE `status` never in API JSON | `types.ts` `AdminCompanyRow` vs `CompanyDirectoryRow` | `admin-companies.ts`, `types.ts`, page |

### B. Client ↔ route wiring

- [ ] Every `payrollApi` / `createApiClient` method has a matching Hono path under `/v1`
- [ ] HTTP method matches (GET/POST/PATCH/DELETE)
- [ ] Path params and query keys match what the route reads
- [ ] No orphan Hono routes unused by any client method (flag; may be intentional for scripts)
- [ ] No parallel `fetch` in feature folders bypassing `payrollApi`

### C. Route ↔ registration

- [ ] Route module imported and `v1.route`’d in `src/server/app.ts`
- [ ] Handler sits under auth middleware (not accidentally on public app)
- [ ] Error paths go through `handleRouteError` / `onError`

### D. Page ↔ shell

- [ ] `src/web/app.tsx` has a `Route` for the page
- [ ] Shell destinations listed in `APP_SHELL_ROUTE_PATHS` and `APP_NAV_ITEMS` (`src/web/shell/app-nav.ts`)
- [ ] `adminOnly` nav matches who can call the API (presentation only — verify server too)
- [ ] Breadcrumb/title entries exist when other pages of the same class have them

### E. BE / DB drift

- [ ] Repo selects columns that exist on current Drizzle schema
- [ ] Schema changes have migrations under `src/db/migrations/`
- [ ] Applied DB (local/Neon) matches latest migration — run migrate if unsure
- [ ] Seed/demo JSON matches schema constraints

### F. Layering debt (warn, then fix when touching)

- [ ] Route contains raw SQL or giant DTO builders (should be repo/service)
- [ ] Service skipped (route → drizzle directly) for new code
- [ ] Domain module performing I/O

### G. Auth / RBAC

- [ ] Mutations/reads call `requirePermission` / `requireSystemAdmin` (or documented equivalent)
- [ ] FE hides controls the API still allows (OK) vs FE shows controls the API always 403s (bug)
- [ ] New resources missing from RBAC matrix/seed

## Report format

Use this table in the reply (and in PR notes if fixing):

| Severity | Finding | Evidence | Fix files |
|----------|---------|----------|-----------|
| critical | FE expects `foo` API omits it | `types.ts` vs `routes/…` | list paths |
| high | `payrollApi.x` 404 | client path vs `app.ts` | list paths |
| medium | Nav link, no Route | `app-nav.ts` vs `app.tsx` | list paths |
| low | Route skips service | `routes/employees.ts` | extract plan |

Severity guide:

- **critical** — data loss, wrong pay/authz, runtime crash on happy path
- **high** — feature unusable (404/403/shape break)
- **medium** — reachable only via URL, wrong empty states, layering that blocks safe change
- **low** — debt, naming, missing sync comments

## Suggested searches (read-only first)

Use the **Grep tool** — its results link to files and go through the permission UI, unlike shell `rg`. Each row below is one Grep call with `output_mode: "content"`.

| Looking for | `pattern` | `path` |
|-------------|-----------|--------|
| FE API surface | `requestJson\|/v1/` | `src/web/api/client.ts`, then `src/web/api/payroll-api.ts` |
| Route registration | `v1\.route\|Routes\(` | `src/server/app.ts`, then `src/server/routes` |
| Shell paths | `APP_SHELL_ROUTE_PATHS\|Route path=` | `src/web/shell/app-nav.ts`, then `src/web/app.tsx` |
| Twin DTOs | `Keep in sync\|EmployeeSummary\|PayRunWorkspaceView` | `src/web/api/types.ts`, `src/repo`, `src/server/routes` |
| Stray fetch | `\bfetch\(` | `src/web` — any hit outside `api/client.ts` is a finding |

Grep takes one `path` per call, so run the multi-path rows as parallel calls in a single message.

Two patterns worth knowing: `\bfetch\(` catches the parallel-HTTP smell that bypasses `client.ts`, and searching `Keep in sync` tells you which hand-mirrored types someone has already been disciplined about — the ones *without* it are where skew hides.

## After fixes

Re-run the detection checklist for the touched feature only. Confirm Done criteria in `SKILL.md`.
