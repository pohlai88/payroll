# Layer map — Vite + Hono + Drizzle (this repo)

For stack truth (Vite vs Next, REST vs tRPC, Tailwind/shadcn/studio), see [stack.md](stack.md).

## Boot

| Process | Command | Entry |
|---------|---------|-------|
| SPA | `npm run dev` | `index.html` → `src/web/main.tsx` → `App` |
| Marketing | same Vite multi-page | `landing.html` → `src/marketing/main.tsx` |
| API | `npm run dev:api` | `src/server/dev-server.ts` → `createApp()` |

Alias: `@` → `src/`. FE calls API at `VITE_API_BASE` (default `http://localhost:8787`). No Vite proxy assumed.

## Directory roles

Canonical Vite FE tree + refactor debt: [frontend-structure.md](frontend-structure.md). UI via `/rui` `/cui` `/iui` only: [ui-studio.md](ui-studio.md).

```
src/web/                 # product SPA (index.html → main.tsx)
  app.tsx                # session gate + wouter Switch/Route
  shell/                 # layout, nav, top-bar, breadcrumbs
  api/                   # client.ts, payroll-api.ts, types.ts
  auth/                  # Neon Auth client
  context/               # auth-context, scope-context
  <feature>/             # pages and feature-only UI (no loose web/*.tsx)
                         # payrun/: panels/, drawers/, dialogs/, employee/, payslip-document/
src/marketing/           # landing.html — isolated styles/entry
src/components/
  ui/                    # shadcn primitives (incl. skeleton) — /rui
  payroll/               # domain widgets
  shadcn-studio/         # /cui /iui blocks only (no I/O or RBAC)
src/hooks/               # use-async-load, use-pagination, …
src/lib/                 # cn / shared non-UI helpers
src/server/
  app.ts                 # createApp — CORS, /health, /v1 registration spine
  auth/                  # jwt, middleware, resolve-user
  routes/                # Hono sub-apps
  errors.ts              # handleRouteError
src/service/             # business ops + RBAC enforcement
src/repo/                # Drizzle queries / read models
src/domain/              # pure calc, rbac types (no I/O)
src/db/
  client.ts              # drizzle + pg Pool
  schema/*.ts            # tables (no barrel; drizzle-kit glob)
  migrations/            # generated SQL
```

## Naming

| Kind | Pattern |
|------|---------|
| Feature page | `src/web/<feature>/<name>-page.tsx` |
| Route module | `src/server/routes/<kebab>.ts` exporting `*Routes(db)` |
| Service / repo | kebab or domain noun; no index barrels |
| FE contract | `src/web/api/types.ts` (+ payslip-local types only when already established) |
| HTTP paths | `/v1/...` under auth; public `/health` only |

## Registration spines (like T3 `root.ts`)

Must update these when adding a shell destination or API module:

1. **API**: `src/server/app.ts` — `v1.route("/", yourRoutes(deps.db))`
2. **Wouter**: `src/web/app.tsx` — `<Route path="…" component={…} />`
3. **Nav**: `src/web/shell/app-nav.ts` — `APP_SHELL_ROUTE_PATHS` + `APP_NAV_ITEMS` (paths must match `app.tsx`; these are **Wouter** shell paths, not Next.js App Router)

## Layering (preferred)

```
schema → repo (DTO) → service (RBAC + rules) → route (Zod + user) → app.ts
                                                              ↓
                         types.ts ← client/payrollApi ← page ← app.tsx + app-nav
```

- **Route**: parse/validate, `c.get("user")`, call service, return JSON
- **Service**: `requirePermission` / `requireSystemAdmin`, orchestration
- **Repo**: Drizzle only; return serializable DTOs (ISO strings for dates)
- **Domain**: pure functions; no DB

## Anti-patterns (do not copy)

| Smell | Where it shows up | Prefer |
|-------|-------------------|--------|
| Inline SQL/DTO build in route | `employees.ts`, fat `pay-run-payslip.ts` | Extract repo + service |
| Parallel `fetch` helpers | anywhere under `src/web` | Extend `createApiClient` / `payrollApi` |
| Next.js `loading.tsx` / nested layouts | N/A | Page-local Skeleton / `use-async-load`; single `ShellLayout` |
| FE-only auth as security | `adminOnly` nav, `isSystemAdmin` UI | Server `require*` always |
| Silent DTO drift | twin types without sync comment | Same fields + `Keep in sync with path` |
| Hand-edited migration SQL | `src/db/migrations` | `npm run db:generate` then migrate |
| Deprecated dual fields | `evidenceRef` vs `evidenceArtifactId`, rule-pack mirrors | New code uses current names only |

## Loading / layout / components

- **Layout**: signed-in routes wrap in `ShellLayout` (`src/web/shell/layout.tsx`)
- **Loading**: no route-level loading files — use `Skeleton` from `src/components/ui/skeleton.tsx` or `src/hooks/use-async-load.ts`
- **Errors**: `formatApiError` from `src/web/api/format-error`
- **shadcn UI**: `src/components/ui` — configured by `components.json` (`style: base-nova`, `rsc: false`, CSS entry `src/web/styles.css`). Install/refine via `/rui` only among studio commands for atoms
- **shadcn studio**: `src/components/shadcn-studio` — registries in `components.json` (`@shadcn-studio`, `@ss-blocks`, `@ss-components`). New blocks via `/cui` or `/iui`; compose in pages/shell; keep I/O and RBAC out of studio modules. **No freehand UI; no `/ftc`.**
- **Payroll atoms**: `src/components/payroll`
- **Page-only UI**: stay in `src/web/<feature>/` (see frontend-structure refactor list)
- **Tailwind v4**: `@tailwindcss/vite` in `vite.config.ts`; `@import "tailwindcss"`, `tw-animate-css`, `shadcn/tailwind.css` in `src/web/styles.css` — no `tailwind.config.js`
- **Dark mode**: `next-themes` + `use-dark-mode` — package name only; app is still Vite

## API style (REST, not tRPC)

- Hono route modules return JSON under `/v1/...`
- FE: `createApiClient` → `requestJson<T>("/v1/...")` → cast to hand-mirrored `T`
- No procedure routers, no `AppRouter` type export, no React Query tRPC hooks

## Auth / RBAC

| Layer | Path |
|-------|------|
| Identity (browser) | `src/web/auth/client.ts` (Neon Auth) |
| Session gate | `src/web/app.tsx` then `AuthProvider` |
| API auth | Bearer JWT → `src/server/auth/middleware.ts` → `c.set("user")` |
| Authorization | `src/service/rbac.ts` + `src/domain/rbac/` |
| FE presentation | `isSystemAdmin` / `adminOnly` — UI only |

## Env

- Server: `src/server/env.ts`
- Client: `VITE_API_BASE`, `VITE_NEON_AUTH_URL`, …
- Document new vars in `.env.example`

## Gold path

See [companies-trace.md](companies-trace.md).
