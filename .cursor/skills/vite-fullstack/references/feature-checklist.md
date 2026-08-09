# Feature checklist — create end-to-end

Work **top-down** unless the user already has a schema. Skip steps that truly do not apply (e.g. no new table), but never skip registration spines for pieces you did add.

Copy this into the task and check off:

```
Feature Progress:
- [ ] 1. Types / interface
- [ ] 2. DB schema + migration
- [ ] 3. Repo
- [ ] 4. Service + RBAC
- [ ] 5. Hono route + Zod
- [ ] 6. Register in server/app.ts
- [ ] 7. FE types + payrollApi/client
- [ ] 8. Page + loading + errors
- [ ] 9. Layout/nav + wouter Route
- [ ] 10. Auth / permissions (if new)
- [ ] 11. Tests + env docs
```

---

## 1. Types / interface

- Domain enums/types: `src/domain/…` (pure; no I/O)
- Repo/service DTO: exported type next to the producer (e.g. `src/repo/…` or service)
- FE mirror: `src/web/api/types.ts` with **identical field names**
- Comment on FE type: `/** Keep in sync with src/… */`
- Prefer `readonly` fields on public DTOs

## 2. DB schema + migration

- Add/adjust tables in `src/db/schema/<module>.ts`
- Generate: `npm run db:generate`
- Apply: `npm run db:migrate` (via project scripts)
- Do not hand-edit generated migrations to "fix" drift — regenerate
- Update seeds under `db/seed/` or `scripts/seed.ts` only when demo data is required

## 3. Repo

- Add `src/repo/<name>.ts` with Drizzle queries
- Accept `Database` from `@/db/client`
- Return DTO shapes (dates as ISO strings when crossing HTTP)
- Keep SQL out of routes and out of `src/domain`

## 4. Service + RBAC

- Add `src/service/<name>.ts`
- Call `requirePermission` / `requireSystemAdmin` / existing helpers before mutating or reading sensitive data
- Orchestrate repo + domain; throw typed/HTTP-mappable errors the route layer already understands
- Company scope: use existing accessible-company helpers when data is tenant-scoped

## 5. Hono route + Zod

- Add `src/server/routes/<kebab>.ts`
- Export `export function <name>Routes(db: Database) { … }`
- Zod-parse body/query/params
- Use `c.get("user")` after auth middleware
- Call service; return JSON; rely on `handleRouteError` / `v1.onError`
- Path prefix will live under `/v1` once registered

## 6. Register route

In `src/server/app.ts`:

- Import the route factory
- `v1.route("/", yourRoutes(deps.db))` (pass extra deps only when the module needs them, e.g. artifact store)

## 7. FE types + API client

- Add/update types in `src/web/api/types.ts` (include `Keep in sync with …` pointing at service/repo/route)
- **Implement the HTTP method in `src/web/api/client.ts` first** (`createApiClient` / `requestJson`)
- Then re-export or wrap on `payrollApi` in `src/web/api/payroll-api.ts` (`payrollApi` is a thin facade — do not put new `fetch` logic only there)
- Paths must match Hono exactly (including `/v1` prefix in client calls)
- No new standalone `fetch` modules

## 8. Page + loading + errors

- Create `src/web/<feature>/<name>-page.tsx`
- Loading: `Skeleton` and/or `use-async-load` — **not** Next `loading.tsx`
- Errors: `formatApiError`
- Call `payrollApi.*` only (or hooks that wrap it)
- Use existing UI primitives from `src/components/ui` and payroll atoms from `src/components/payroll`

## 9. Layout / nav / wouter

- Wrap stays `ShellLayout` for signed-in product pages (no new root layout tree)
- Add `<Route path="…" component={…} />` in `src/web/app.tsx`
- If it is a shell destination: update `APP_SHELL_ROUTE_PATHS` and `APP_NAV_ITEMS` in `src/web/shell/app-nav.ts`
- Update breadcrumb/title helpers if the shell expects them (`page-title`, `shell-breadcrumb`)
- Nested routes (e.g. payslip under pay-run) may omit nav items but **must** still be in `app.tsx`

## 10. Auth / permissions (if new)

- New resource/action: extend `src/domain/rbac` types + matrix/seed as required
- Enforce in service, not only in React
- FE: `adminOnly` / `isSystemAdmin` for presentation and nav hiding only
- Invite/bootstrap scripts (`scripts/`) only if ops need a new role assignment path

## 11. Tests + env

- API/DB: `tests/db/…` following existing patterns (inject `createApp` + test DB)
- Domain: `tests/domain/…` for pure rules
- New env vars: `src/server/env.ts` + `.env.example` + brief README note if operator-facing

---

## Scope decision

```
Needs new/changed HTTP JSON or DB column?
  YES → full checklist (or Mode B audit if fixing drift)
  NO  → component-only OK (ui / payroll / feature folder)

User said "just the page"?
  API already exists and matches types → page + nav/route only
  API missing or shape wrong → do not mock; extend route → client.ts → payrollApi first
```

## Partial work rules

| User asks only for… | Still do |
|---------------------|----------|
| "just the page" | Confirm API exists; if not, add route→`client.ts`→`payrollApi` or refuse silent mock |
| "just the API" | Register in `app.ts`; add FE types + `client.ts` method (and `payrollApi` wrap) or document follow-up |
| "just the schema" | Generate migration; note repo/service still needed |
| UI component only | Place under `components/ui` or `payroll` / feature folder; no fake API |

## Done gate

Before claiming complete: hit the Done criteria in `SKILL.md` (registered route, matching `payrollApi` path, DTO parity, nav/route wiring, RBAC on mutations, migration if schema changed, test when persistence/auth involved).
