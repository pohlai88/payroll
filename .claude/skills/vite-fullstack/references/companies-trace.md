# Companies feature — gold-path trace

Copy this shape for new admin/directory features. Prefer this over employees/payslip (those skip service/repo in places).

**Headers:** pilot for [file-headers.md](file-headers.md). Grep the slice with `rg "@feature companies" src tests`. Hub `@chain` lives on `src/server/routes/admin-companies.ts`.

## Flow

```
companies-page.tsx
  → payrollApi.getAdminCompanies / create / patch
  → GET|POST /v1/admin/companies, PATCH /v1/admin/companies/:companyId
  → admin-companies route (Zod + c.get("user"))
  → admin-companies service (requireSystemAdmin)
  → repo/companies (list/create/update) on parties.companies
  → schema: src/db/schema/parties.ts (companies)
```

## Files

| Layer | Path |
|-------|------|
| Page | `src/web/companies/companies-page.tsx` |
| Nav | `src/web/shell/app-nav.ts` (`/companies`, `adminOnly`) |
| Wouter | `src/web/app.tsx` (`/companies` → `CompaniesPage`) |
| FE types | `src/web/api/types.ts` — `AdminCompanyRow` has `Keep in sync with CompanyDirectoryRow`; create/patch bodies sync to route Zod |
| Client | `src/web/api/client.ts` (`getAdminCompanies`, create, patch) |
| Facade | `src/web/api/payroll-api.ts` (re-exports) |
| Route (hub) | `src/server/routes/admin-companies.ts` — `@chain` + `@surface` |
| Register | `src/server/app.ts` → `adminCompanyRoutes(deps.db)` |
| Service | `src/service/admin-companies.ts` |
| Repo | `src/repo/companies.ts` (`listAllCompanies`, create, update) |
| Schema | `src/db/schema/parties.ts` (`companies` — section banner) |
| Authz | `requireSystemAdmin` in service; FE `isSystemAdmin` + nav `adminOnly` (presentation) |

## Patterns to reuse

1. **Page**: load on mount; `Skeleton` while loading; `formatApiError` on failure; call `payrollApi` only.
2. **Client**: `requestJson<T>("/v1/admin/companies", …)` — typed with FE DTO.
3. **Route**: thin — Zod body, user id, service call, return row/list.
4. **Service**: system-admin gate first; map DB rows to stable DTO (`CompanyDirectoryRow`). List goes through `repo/rbac`; create/update may use Drizzle in the service today — for new features prefer repo helpers for writes too when non-trivial.
5. **Registration**: one line in `createApp` — never leave a route file unregistered.
6. **Nav + route together**: `/companies` in `APP_SHELL_ROUTE_PATHS`, `APP_NAV_ITEMS`, and `<Route>`.

## Minimal "new admin resource" template

When adding something like companies:

1. Schema (+ migrate) if new table
2. Repo list/get/insert/update
3. Service with `requireSystemAdmin` or `requirePermission`
4. `src/server/routes/admin-<resource>.ts`
5. Register in `src/server/app.ts`
6. Types + client + `payrollApi`
7. `src/web/<resource>/<resource>-page.tsx`
8. `app.tsx` + `app-nav.ts` (adminOnly if system-admin)
9. `tests/db/…` covering list/create happy path + 403 for non-admin

## Contrast (do not treat as template)

- **Employees list**: page → API → `routes/employees.ts` with inline joins — extract repo/service when you touch it.
- **Payslip**: large DTO assembly in the route — keep sync comments tight; prefer extracting when changing shape.
