---
name: vite-fullstack
description: >
  Wires and audits full-stack features in this Vite + React + Wouter + Hono + Drizzle
  payroll repo (REST /v1, hand-mirrored DTOs, shadcn + shadcn-studio, Tailwind v4).
  Covers types, schema, repo, service/RBAC, routes, client.ts/payrollApi, pages,
  loading, shell nav, and auth. UI/UX only via /rui /cui /iui (shadcn-studio MCP).
  Defines Vite frontend folder layout for SPA vs marketing refactor. Use when creating
  a page/component/API/route, wiring FE/BE, fixing drift, DTO skew, orphan routes,
  folder refactor, or when the user mentions payrollApi, Vite fullstack, Hono,
  shadcn studio, /rui, /cui, /iui, or T3-style wiring. Overrides Next.js/Express/tRPC/Prisma
  fullstack skills here.
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
9. **UI/UX only via `/rui` `/cui` `/iui`** (shadcn-studio MCP). Call the matching `get-*-instructions` first; no freehand layouts, no `/ftc`. Details: [references/ui-studio.md](references/ui-studio.md).
10. Frontend paths follow the Vite tree in [references/frontend-structure.md](references/frontend-structure.md) — SPA under `src/web/`, marketing under `src/marketing/`, primitives/studio under `src/components/`.

## Scope gate

| Ask | Do |
|-----|----|
| New CRUD / API-backed page | Mode A — full checklist; UI step uses `/iui` or `/cui` then wire data |
| Drift / 404 / wrong shape / not wired | Mode B — audit then fix |
| UI atom / refine existing, no new endpoint | `/rui` (or `/cui`/`/iui` for new block) → `components/ui`, `payroll`, or feature folder; no fake API |
| "Just the page", API missing | Add route → `client.ts` → `payrollApi` (or ask) — do not mock |
| FE folder refactor | Follow [frontend-structure.md](references/frontend-structure.md); path moves only unless asked to redesign |
| Bulk refactor / fat-route extract / polish by `@feature` | [hub-refactor](../hub-refactor/SKILL.md) — one `@chain` hub at a time |

## Mode A — Create feature

```
Feature Progress:
- [ ] 1. Types / interface
- [ ] 2. DB schema + migration
- [ ] 3. Repo
- [ ] 4. Service + RBAC
- [ ] 5. Hono route + Zod (+ hub @chain / @surface)
- [ ] 6. Register in server/app.ts
- [ ] 7. FE types + client.ts then payrollApi
- [ ] 8. Page + loading + errors
- [ ] 9. Layout/nav + wouter Route
- [ ] 10. Auth / permissions (if new)
- [ ] 11. Tests + .env.example if needed
- [ ] 12. File headers (@feature / @layer; hub @chain) — see file-headers.md
```

Follow [references/feature-checklist.md](references/feature-checklist.md). Paths: [references/layer-map.md](references/layer-map.md). Headers: [references/file-headers.md](references/file-headers.md). Gold path: [references/companies-trace.md](references/companies-trace.md). Decision tree / DoD: [references/continuous-dev.md](references/continuous-dev.md). Templates: [references/extension-patterns.md](references/extension-patterns.md).

## Mode B — Drift audit

1. Read [references/drift-audit.md](references/drift-audit.md).
2. Cross-check live inventory in [references/feature-surface-map.md](references/feature-surface-map.md).
3. Inventory DTO / client↔route / nav↔page / schema↔repo / auth mismatches.
4. Report severity + files; fix schema → repo → service → route → types/`client.ts` → page/nav.

DTO skew: extend service JSON first, mirror `types.ts` with sync comment, then UI. No `as any`.

## Continuous development

For ongoing increments (not greenfield discovery):

1. [references/continuous-dev.md](references/continuous-dev.md) — decision tree, layer contracts, debt protocol, increment DoD
2. [references/extension-patterns.md](references/extension-patterns.md) — copy-paste templates (admin CRUD, tenant CRUD, workspace, artifacts, domain, nav)
3. [references/feature-surface-map.md](references/feature-surface-map.md) — current API/SPA/DTO inventory + layering grades

## Where things live

| Piece | Path |
|-------|------|
| Page | `src/web/<feature>/*-page.tsx` |
| Shell / nav | `src/web/shell/` (`app-nav.ts` = Wouter) |
| Routes | `src/web/app.tsx` |
| FE API | `types.ts` → `client.ts` → `payroll-api.ts` |
| Hono | `src/server/routes/*.ts` → `src/server/app.ts` |
| Service / repo / schema | `src/service/`, `src/repo/`, `src/db/schema/` |
| UI | `components/ui` (shadcn), `shadcn-studio/`, `payroll/` — via `/rui` `/cui` `/iui` only |
| Styles | `src/web/styles.css` (SPA Tailwind v4); marketing isolated |
| FE layout | [frontend-structure.md](references/frontend-structure.md) |

## Done when

- `/v1` route registered; `client.ts` + `payrollApi` path match
- FE DTO matches JSON + `Keep in sync with …`
- `app.tsx` Route; shell dests in `APP_SHELL_ROUTE_PATHS` / `APP_NAV_ITEMS`
- Mutations use service RBAC; schema changes migrated; test if persistence/auth touched
- UI changes came from `/rui` `/cui` or `/iui` and land in the Vite paths above (not Next `app/`)
- Touched feature files have `@feature` / `@layer`; API hub has `@chain`; leaves have `@hub` ([file-headers.md](references/file-headers.md))
- Untagged audit clean for touched trees (see file-headers.md Audit — use --files-without-match)

## References

- [stack.md](references/stack.md) — Vite/REST/Tailwind/shadcn/studio truth + T3 map
- [ui-studio.md](references/ui-studio.md) — `/rui` `/cui` `/iui` gate + MCP validation
- [frontend-structure.md](references/frontend-structure.md) — Vite SPA/marketing folder target + refactor debt
- [layer-map.md](references/layer-map.md) — paths, anti-patterns
- [file-headers.md](references/file-headers.md) — `@feature` / `@layer` / hub `@chain` for grep + sight
- [hub-refactor](../hub-refactor/SKILL.md) — hub-scoped bulk refactor (one `@chain` at a time)
- [feature-checklist.md](references/feature-checklist.md) — create steps
- [drift-audit.md](references/drift-audit.md) — audit + DTO example
- [companies-trace.md](references/companies-trace.md) — gold path
- [continuous-dev.md](references/continuous-dev.md) — decision tree, contracts, debt, DoD
- [extension-patterns.md](references/extension-patterns.md) — copy-paste feature templates
- [feature-surface-map.md](references/feature-surface-map.md) — live API/SPA/DTO inventory
