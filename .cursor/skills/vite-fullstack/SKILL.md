---
name: vite-fullstack
description: >
  Wires and audits full-stack features in this Vite + React + Wouter + Hono + Drizzle
  payroll repo (REST /v1, hand-mirrored DTOs, shadcn + shadcn-studio, Tailwind v4).
  Covers types, schema, repo, service/RBAC, routes, client.ts/payrollApi, pages,
  loading, shell nav, and auth. Use when creating a page/component/API/route,
  wiring frontend to backend, fixing FE/BE or BE/DB drift, DTO skew, orphan routes,
  or when the user mentions payrollApi, Vite fullstack, Hono, shadcn studio, or
  T3-style wiring. Overrides Next.js/Express/tRPC/Prisma fullstack skills here.
---

# Vite Fullstack

T3 **discipline** (registration spine, Zod boundary, auth-aware handlers, schema-first, end-to-end checklist) — **not** Next/tRPC file names.

Stack one-liner: Vite SPA + Hono REST `/v1` + Drizzle + Neon Auth Bearer + Tailwind v4 + shadcn/`base-nova` + shadcn-studio. Details: [references/stack.md](references/stack.md).

## Hard rules

1. No Next App Router, `loading.tsx`, server actions, tRPC, or Prisma. Nav paths are **Wouter**.
2. Product API under `/v1` + `authMiddleware` (except `/health`).
3. HTTP in `src/web/api/client.ts` first; `payroll-api.ts` is a facade only — no parallel `fetch*`.
4. Zod in routes; RBAC in `src/service` (server is source of truth).
5. FE DTOs in `types.ts` match JSON field-for-field; add `Keep in sync with <path>` (canon: `AdminCompanyRow` ↔ `CompanyDirectoryRow`).
6. Prefer companies layering (route → service → repo). Avoid fat SQL-in-route (employees/payslip).
7. `requestJson` casts — TS will not catch DTO drift. Change producer before consumer.
8. Context7 for Hono/Drizzle/Wouter/Zod docs — never invent Next structure.

## Scope gate

| Ask | Do |
|-----|----|
| New CRUD / API-backed page | Mode A — full checklist |
| Drift / 404 / wrong shape / not wired | Mode B — audit then fix |
| UI atom, no new endpoint | `components/ui`, `payroll`, or feature folder; no fake API |
| "Just the page", API missing | Add route → `client.ts` → `payrollApi` (or ask) — do not mock |

## Mode A — Create feature

```
Feature Progress:
- [ ] 1. Types / interface
- [ ] 2. DB schema + migration
- [ ] 3. Repo
- [ ] 4. Service + RBAC
- [ ] 5. Hono route + Zod
- [ ] 6. Register in server/app.ts
- [ ] 7. FE types + client.ts then payrollApi
- [ ] 8. Page + loading + errors
- [ ] 9. Layout/nav + wouter Route
- [ ] 10. Auth / permissions (if new)
- [ ] 11. Tests + .env.example if needed
```

Follow [references/feature-checklist.md](references/feature-checklist.md). Paths: [references/layer-map.md](references/layer-map.md). Gold path: [references/companies-trace.md](references/companies-trace.md).

## Mode B — Drift audit

1. Read [references/drift-audit.md](references/drift-audit.md).
2. Inventory DTO / client↔route / nav↔page / schema↔repo / auth mismatches.
3. Report severity + files; fix schema → repo → service → route → types/`client.ts` → page/nav.

DTO skew: extend service JSON first, mirror `types.ts` with sync comment, then UI. No `as any`.

## Where things live

| Piece | Path |
|-------|------|
| Page | `src/web/<feature>/*-page.tsx` |
| Shell / nav | `src/web/shell/` (`app-nav.ts` = Wouter) |
| Routes | `src/web/app.tsx` |
| FE API | `types.ts` → `client.ts` → `payroll-api.ts` |
| Hono | `src/server/routes/*.ts` → `src/server/app.ts` |
| Service / repo / schema | `src/service/`, `src/repo/`, `src/db/schema/` |
| UI | `components/ui` (shadcn), `shadcn-studio/`, `payroll/` |
| Styles | `src/web/styles.css` (Tailwind v4) |

## Done when

- `/v1` route registered; `client.ts` + `payrollApi` path match
- FE DTO matches JSON + `Keep in sync with …`
- `app.tsx` Route; shell dests in `APP_SHELL_ROUTE_PATHS` / `APP_NAV_ITEMS`
- Mutations use service RBAC; schema changes migrated; test if persistence/auth touched

## References

- [stack.md](references/stack.md) — Vite/REST/Tailwind/shadcn/studio truth + T3 map
- [layer-map.md](references/layer-map.md) — paths, anti-patterns
- [feature-checklist.md](references/feature-checklist.md) — create steps
- [drift-audit.md](references/drift-audit.md) — audit + DTO example
- [companies-trace.md](references/companies-trace.md) — gold path
