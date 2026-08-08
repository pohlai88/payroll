# Phase 4B — Auth-gated employee master import (API + thin SPA)

**Date:** 2026-08-08 · **Status:** Implemented · **Scope:** HTTP + SPA over frozen create-only import

Exposes the Phase 2 create-only employee master import through the Phase 3/4A
auth stack. No Straits/shadcn, no new authorization resources, no update path.

Companions: [employee-master-import-design](./2026-08-08-employee-master-import-design.md),
[phase4a-auth-shell-design](./2026-08-08-phase4a-auth-shell-design.md) (frozen),
[hono-neon-auth-design](./2026-08-08-hono-neon-auth-design.md) (frozen).

---

## Invariant

> The browser may present import controls from server permissions, but create-only
> import authority and company checks remain on the API. HTTP never auto-registers
> custom fields (CLI-only; seed-file mutation).

---

## 1. Scope

**In**

- `GET /v1/employee-import/template` — CSV of fixed headers + active custom fields
- `POST /v1/employee-import` — create-only import (`text/csv` or JSON array)
- Auth: Bearer JWT (existing middleware)
- AuthZ: `EMPLOYMENT` + `CREATE` via `requirePermission`
- Thin SPA panel on the Phase 4A shell when presentation shows CREATE on EMPLOYMENT
- Reuse `importEmployeeRows` / domain row parser / repo

**Out**

- Straits / shadcn / dashboard chrome
- `--auto-register` over HTTP
- XLSX, update/upsert, custom-field CRUD UI
- New RBAC resources or actions
- Auth platform polish

---

## 2. HTTP contract

| Method | Path | Behaviour |
|--------|------|-----------|
| `GET` | `/v1/employee-import/template` | `text/csv`; optional `?companyId=` for authZ context |
| `POST` | `/v1/employee-import` | Body `text/csv` or `application/json` array; response `ImportReport`; never `autoRegister` |

Body size cap: 2 MiB. Oversize → `413` / `PAYLOAD_TOO_LARGE`.

Unrecognized headers → `400` / `VALIDATION_ERROR` (whole request).

---

## 3. Authorization

- Template: `requirePermission(db, userId, "EMPLOYMENT", "CREATE", companyId?)`
  — without `companyId`, only GLOBAL / SYSTEM_ADMIN succeed.
- Import: resolve distinct `Payroll Company Code` values to company ids; actor must
  have `EMPLOYMENT`/`CREATE` for **every** resolved company, else `403 PERMISSION_DENIED`
  for the whole request. Unknown company codes stay per-row `FAILED`.
- Presentation: show UI when server matrix has `EMPLOYMENT` ⊃ `CREATE` for the
  current company context (UI never authorizes).

---

## 4. Service boundaries

- `buildEmployeeImportTemplateCsv(db)` — string CSV (CLI writes file)
- Parse CSV/JSON in a shared helper used by the route
- Orchestrator: authZ company set → `importEmployeeRows(db, rows, { autoRegister: false })`

---

## 5. SPA

Bearer client methods for template download and import. Panel on `src/web/app.tsx`
(or thin panel component): download / file choose / import / report. Clear report
with auth-derived state on logout / expiry / principal change.

---

## 6. Success criteria

1. Invited user with `EMPLOYMENT`/`CREATE` downloads template and imports CSV.
2. Re-import → `SKIPPED_EXISTING`; no profile clobber.
3. Non-granted caller → 403; UI hidden without CREATE.
4. HTTP cannot auto-register custom fields.
5. No Straits/shadcn in this slice.
