# Phase 5B Preflight — Read-Facade Readiness

Date: 2026-08-08

## Section token form

Confirmed by reading `src/web/styles.css` `:root` block (and its `.dark` override):

```css
--section-earning-fill: #eaf1f7;
--section-earning-ink: #114a65;
--section-deduction-fill: #f7e7c6;
--section-deduction-ink: #7c4e01;
--section-employer-fill: #e4efee;
--section-employer-ink: #1f5a58;
--section-summary-fill: #e6ebf0;
--section-summary-ink: #14324a;
```

These are **complete hex colour values**, not HSL channel tuples. Use `var(--section-earning-fill)` directly in inline styles or `style={{ background: "var(--section-earning-fill)" }}` in JSX — no `hsl(...)` wrapper is needed or correct. The same tokens are re-exposed as Tailwind utilities via `@theme inline` (e.g. `--color-section-earning-fill: var(--section-earning-fill)`), so `bg-section-earning-fill` / `text-section-earning-ink` classes are also available.

## Existing routes (confirmed)

All routes below are mounted under `/v1` by `src/server/app.ts` (`v1.route("/", payRunRoutes(...))`, `v1.route("/", payRunControlRoutes(...))`, `v1.route("/", meRoutes(...))`). No `app.get(...)` calls exist outside `pay-run.ts`, `pay-run-control.ts`, `me.ts`, `admin-users.ts`, and `employee-import.ts` (checked via a repo-wide search).

- [x] GET /v1/pay-runs — **MISSING** (no list route; `pay-run.ts` only has `POST /pay-runs`)
- [x] GET /v1/pay-runs/:runId — **MISSING** (no single-run fetch route; only sub-resources exist: `/findings`, `/gates/:gate`)
- [x] GET /v1/pay-runs/:runId/workspace — **MISSING** (no workspace aggregate route)
- [x] GET /v1/employees — **MISSING** (no employee list/search route anywhere in `src/server/routes/`)
- [x] Company list from /v1/me or similar — **MISSING** (`GET /v1/me` returns only `{id, email, name, status}`; `GET /v1/me/permissions?companyId=` requires a `companyId` as *input*, it does not enumerate companies)

Full inventory of `app.get(...)` routes found in the server:

| File | Route |
|---|---|
| `pay-run.ts` | `GET /pay-runs/:runId/findings` |
| `pay-run.ts` | `GET /pay-runs/:runId/gates/:gate` |
| `pay-run-control.ts` | `GET /pay-runs/:runId/closure-checklist` |
| `pay-run-control.ts` | `GET /pay-runs/:runId/payments` |
| `pay-run-control.ts` | `GET /pay-runs/:runId/batches/:batchId` |
| `pay-run-control.ts` | `GET /pay-runs/:runId/artifacts` |
| `pay-run-control.ts` | `GET /pay-runs/:runId/artifacts/:artifactId/url` |
| `me.ts` | `GET /me` |
| `me.ts` | `GET /me/permissions` |
| `admin-users.ts` | `GET /admin/users` |
| `employee-import.ts` | `GET /employee-import/template` |

None of these is a pay-run list, a single pay-run fetch, a workspace aggregate, an employee list, or a company list.

## Schema facts for Tasks 1–4

- `src/db/schema/run.ts`: `payRuns.linkedRunId` **exists** (`text("linked_run_id").references((): AnyPgColumn => payRuns.id)`) — the off-cycle-to-regular link column the SPA can rely on.
- `src/db/schema/employee-profile.ts` (`employmentProfiles`, `employeeCustomFieldDefs`) has **no** `employeeCode`, `fullName`, `companyId`, or `employmentStatus` columns. It only carries HR-admin fields (`jobTitle`, `department`, `gender`, etc.) keyed by `employmentId`, plus a JSONB `extraAttributes` bag. It is a 1:1 profile extension table, not the identity/roster table.
- The identity/roster columns actually live in `src/db/schema/parties.ts`:
  - `companies`: `id`, `code`, `name`, `epfNo`, `socsoNo`, `lhdnNo`, `hrdfEnabled`, `hrdfLevyPct`.
  - `persons`: `id`, `name` (full name lives here, not on `employments`), `ic`, `passport`, `dob`, `nationality`.
  - `employments`: `id`, `personId`, `companyId`, `employeeCode` (payroll-facing code, e.g. `DLBB1017`), `joinDate`, `terminationDate`, `terminationReason`, `payBasis`, `baseRateSen`, plus statutory-applicability flags. There is **no boolean/enum `employmentStatus` column** — active vs. terminated must be derived from `terminationDate IS NULL`.
- Implication for the SPA/Task 1–4 employee-list route: an employee row must be composed by joining `employments` (code, companyId, dates) with `persons` (name) — `employeeCode` and `companyId` are on `employments`, `fullName` is `persons.name`, and "employment status" is a derived value (`ACTIVE` when `terminationDate IS NULL`, else `TERMINATED`), not a stored column.

## Routes to add in Tasks 1–4

- `GET /v1/pay-runs` — list pay runs (filterable by `companyId`, `status`, `year`/`month` presumably) for the run picker/scope selector.
- `GET /v1/pay-runs/:runId` — single pay-run summary (status, revision, gate state) distinct from the sub-resource endpoints that already exist.
- `GET /v1/pay-runs/:runId/workspace` — the aggregate view combining run header + lines + findings + gates needed by the workspace screen; does not exist in any form today (not even as separate calls the SPA could compose, since there is no per-run line list endpoint either — pay lines are only reachable indirectly via `/payments` which joins `linePayments`+`payLines`).
- `GET /v1/employees` — employee list/search, joining `employments` + `persons` (see schema facts above), scoped by `companyId`.
- `GET /v1/me/companies` (or equivalent, e.g. broaden `GET /me`) — company list for the scope selector; `companies` table exists and is fully populated but no route reads it back.

## Gaps that cannot be deferred

- **No read path to pay lines at all.** Every existing route either mutates (`POST /pay-runs/:runId/recompute`, `/review`, `/approve`, etc.) or reads a narrow sub-resource (`findings`, `gates/:gate`, `payments`, `artifacts`). There is no `GET` that returns `payLines`/`payLineItems` rows for a run, which the workspace view will need beyond just the `/workspace` aggregate — Task 1–4 must define this shape from scratch, informed only by the `pay_lines`/`pay_line_items` schema in `src/db/schema/run.ts`, since no existing route or service function already assembles it for read.
- **No existing service-layer read function to reuse for `/me/companies`.** `listEffectivePermissions` (used by `/me/permissions`) takes a `companyId` as input rather than deriving the user's accessible company set, so Task 1–4 will need a new authorization-aware company-listing query (likely via `src/domain/rbac` + `src/repo/rbac.ts`), not just a thin wrapper over an existing function.
