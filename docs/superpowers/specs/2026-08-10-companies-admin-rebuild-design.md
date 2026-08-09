# Companies admin rebuild — design

**Date:** 2026-08-10  
**Slice:** System-admin company directory (`/companies`)  
**Layer:** Full vertical (route → service → repo → SPA); schema `parties.companies` kept  
**Skills:** brainstorming (locked), vite-fullstack Mode A, `/iui` (datatable DNA)

---

## 1. Goal

Rebuild the companies **admin feature surface** for MVP ship quality: typed errors, guarded hard-delete, DTO sync, tests, and a studio-aligned SPA page. Do **not** drop or redesign the `companies` table or migrate employments/pay runs.

## 2. Decisions

| Topic | Choice |
|-------|--------|
| Blast radius | Feature rewrite only; keep `parties.companies` + data |
| Lifecycle | Hard delete when zero employments **and** zero pay runs; else **409 CONFLICT** |
| UI | May reshape; inspired by studio datatable-component-06 actions/toolbar |
| Shell-page-kit | Full kit remains a separate prerequisite for later page-kit adoption; this pass uses existing `useAsyncLoad` / `useDialogSubmit` / `Alert` |
| Spec boundary | Companies-only; kit stays in `2026-08-10-shell-page-kit-design.md` |

## 3. Architecture

```
companies-page.tsx
  → payrollApi.get|create|update|deleteAdminCompany
  → GET|POST /v1/admin/companies
  → PATCH|DELETE /v1/admin/companies/:companyId
  → admin-companies service (requireSystemAdmin + AdminCompaniesError)
  → repo/companies (list/create/update/count deps/delete)
  → parties.companies (+ employments / pay_runs counts for delete guard)
```

## 4. API contract

| Method | Path | Success | Notes |
|--------|------|---------|-------|
| GET | `/v1/admin/companies` | `{ companies: AdminCompanyRow[] }` | SYSTEM_ADMIN |
| POST | `/v1/admin/companies` | `AdminCompanyRow` 201 | code trimmed + uppercased; unique → 409 |
| PATCH | `/v1/admin/companies/:companyId` | `AdminCompanyRow` | code immutable |
| DELETE | `/v1/admin/companies/:companyId` | `{ ok: true }` | 409 if deps; 404 if missing |

`AdminCompaniesError` codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409). Mapped in `handleRouteError` like `AdminUsersError`.

## 5. UI composition

1. PageTitle + Add company  
2. Alert for load/mutation errors  
3. HRDF KPI tiles (`statistics-with-status`)  
4. Empty state with Add CTA, or directory table with search + edit/delete menu  
5. Form dialog (create/edit); delete confirm dialog  

Presentational blocks stay under `src/components/shadcn-studio/`; page wires `payrollApi` only.

## 6. Testing

`tests/db/admin-companies-api.test.ts`: 401, 403, create/list/patch/delete happy path, duplicate code 409, delete-with-employment 409.

## 7. Out of scope

- Soft archive / deactivate flag  
- Renaming company code after create  
- Shell header band / full page-kit portal contract  
- Nuclear DB rebuild  

## 8. Done when

- DELETE registered; FE client + facade + types synced  
- Typed service errors (no bare `Error` → 500 for validation)  
- SPA delete + empty CTA + hooks  
- DB API tests green  
- `@feature companies` headers intact on hub/leaves  
