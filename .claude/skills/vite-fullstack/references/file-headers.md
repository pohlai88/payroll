# File header surface envelopes

Spec: [docs/superpowers/specs/2026-08-09-file-header-surface-envelope-design.md](../../../../docs/superpowers/specs/2026-08-09-file-header-surface-envelope-design.md).

Inventory / orphans stay in [feature-surface-map.md](feature-surface-map.md). Headers are for **grep + glance**, not status grades.

## Audit — find untagged files

Run before claiming a slice done (or periodically):

```bash
# True untagged (no @feature anywhere in file)
rg -L --glob '*.ts' --glob '*.tsx' --glob '!**/vite-env.d.ts' --glob '!**/node_modules/**' '@feature ' src tests scripts

# Hubs (expect 17: 16 API route hubs + marketing landing; pay-run-access is not a hub)
rg -l --glob '*.ts' --glob '*.tsx' '(?m)^\s*\* @chain' src

# Leaves that require @hub (repo, service, feature UI, payslip-document, feature-bound studio/payroll)
# Expect: no output (or only shell-optional files you intentionally skip)
rg -L '@hub |@chain' src/repo src/service
rg -L '@hub |@chain' src/web/payrun src/web/control src/web/reports src/web/employees src/web/companies src/web/admin src/web/dashboard src/components/payroll
```

PowerShell equivalent for untagged:

```powershell
Get-ChildItem -Recurse src,tests,scripts -Include *.ts,*.tsx |
  Where-Object { $_.Name -ne 'vite-env.d.ts' } |
  Where-Object { -not (Select-String -Path $_.FullName -Pattern '@feature ' -SimpleMatch -Quiet) } |
  ForEach-Object { $_.FullName }
```

**Rule:** every new/touched `.ts`/`.tsx` under `src/`, `tests/`, `scripts/`, plus root tooling configs (`vite.config.ts`, `vitest.config.ts`, `drizzle.config.ts`, `knip.ts`) must carry `@feature` + `@layer` before Mode A / Increment DoD is green.

## How to find a slice

```bash
rg "@feature companies" src tests scripts
rg "@layer route" src/server/routes
rg "@chain" src                     # API hubs + marketing landing
rg "@hub src/server/routes/employees" src   # leaves pointing at employees hub
```

Open any hit → `@feature` + `@layer`. Open the hub → full `@chain`.

## Required lean header

```ts
/**
 * @feature <kebab-slug>
 * @layer <role>
 * @hub <path-to-hub-file>   // required on leaf layers (see below)
 *
 * <one-line purpose>
 */
```

### When `@hub` is required

| Layer | `@hub` |
|-------|--------|
| `route` / marketing landing with `@chain` | omit (`@chain` is the hub) |
| `repo`, `service`, feature `ui` pages/panels/drawers/dialogs, `payslip-document/*`, feature-bound studio/payroll widgets | **required** — path of the hub file |
| `schema`, `domain`, `test`, `client` section banners, `spine`, shared `components/ui/*` + shell-only studio | optional |
| Cross-cutting (`rbac`, shared helpers) | point at the primary consumer hub, or omit if truly multi-hub |

**Documented exceptions (only):** `src/web/vite-env.d.ts` (ambient); `src/db/migrations/**` (generated SQL).
### `@layer` (closed)

`ui` | `client` | `route` | `service` | `repo` | `schema` | `domain` | `test` | `spine`

### `@feature` slugs (closed starter set)

`companies`, `employees`, `employee-import`, `admin-users`, `me`, `pay-run`, `workspace`, `control`, `payslip`, `artifacts`, `reports`, `remuneration`, `diff`, `derivation`, `findings`, `gates`, `transfer`, `treatments`, `rbac`, `health`, `shell`, `auth`, `marketing`

- One primary slug per file (narrowest). No comma lists.
- Shared UI primitives (`components/ui/*`) and cross-page studio atoms → `shell`.
- Feature-bound studio blocks → feature slug (e.g. `datatable-company` → `companies`).
- Root tooling configs → `shell` / `spine`.

## Hub map (API + marketing)

| `@feature` | Hub file |
|------------|----------|
| `health` | `src/server/routes/health.ts` |
| `me` | `src/server/routes/me.ts` |
| `admin-users` | `src/server/routes/admin-users.ts` |
| `companies` | `src/server/routes/admin-companies.ts` |
| `employees` | `src/server/routes/employees.ts` |
| `employee-import` | `src/server/routes/employee-import.ts` |
| `pay-run` | `src/server/routes/pay-run.ts` |
| `findings` / `gates` | `src/server/routes/pay-run.ts` (co-located) |
| `workspace` | `src/server/routes/pay-run-workspace.ts` |
| `control` / `artifacts` | `src/server/routes/pay-run-control.ts` (artifacts co-located) |
| `payslip` | `src/server/routes/pay-run-payslip.ts` |
| `diff` | `src/server/routes/pay-run-diff.ts` |
| `derivation` | `src/server/routes/pay-run-derivation.ts` |
| `reports` | `src/server/routes/pay-run-reports.ts` |
| `remuneration` | `src/server/routes/employee-remuneration.ts` |
| `transfer` | `src/server/routes/transfers.ts` |
| `treatments` | `src/server/routes/treatments.ts` |
| `marketing` | `src/marketing/landing.tsx` |

## Hub `@chain` (one file per feature)

- API-backed → hub = **route** module
- SPA-only → hub = **page** or marketing landing
- Never duplicate `@chain` on every layer

```ts
/**
 * @feature companies
 * @layer route
 * @surface GET|POST /v1/admin/companies; PATCH /v1/admin/companies/:companyId
 * @chain
 *   ui:      src/web/companies/companies-page.tsx
 *   client:  getAdminCompanies, createAdminCompany, updateAdminCompany
 *   route:   src/server/routes/admin-companies.ts
 *   service: src/service/admin-companies.ts
 *   repo:    src/repo/companies.ts
 *   schema:  src/db/schema/parties.ts (companies)
 *   spine:   app.ts → adminCompanyRoutes; app.tsx + app-nav /companies
 *
 * Admin companies HTTP under /v1/admin/companies.
 */
```

Chain keys (omit N/A): `ui`, `client`, `route`, `service`, `repo`, `schema`, `spine`.

## Shared mega-files

File-level header uses `@feature shell` (or multi-banner note) **plus** section banners:

```ts
/**
 * @feature shell
 * @layer client
 *
 * Shared API client — per-feature clusters use section banners below.
 */

// --- @feature companies @layer client ---
```

Same for `types.ts`, `payroll-api.ts`, multi-table schema (`parties.ts`).

## Mode A / increment rules

1. New or touched feature file → lean tags **before** claiming done
2. New API feature → hub route gets `@chain` (+ `@surface`); leaves get `@hub`
3. Path/method rename → update hub `@chain` + leaf `@hub` in the same change
4. After edits: run the **Audit** greps above — zero untagged in touched trees
5. Do not skip [feature-surface-map.md](feature-surface-map.md) when inventory status changes
