# Stack truth + T3 map + UI

Load when unsure about Vite vs Next, REST vs tRPC, or where UI belongs.

## This repo vs not

| Element | Use | Do not use |
|---------|-----|------------|
| Bundler / SPA | Vite 6 + `@vitejs/plugin-react` (`npm run dev`) | Next.js App Router, RSC |
| Routing | Wouter (`src/web/app.tsx`) | Next `app/` / `pages/` |
| API | REST JSON, Hono `/v1/*`, Bearer JWT | tRPC, GraphQL, server actions, Express |
| FE contract | Hand-mirrored `src/web/api/types.ts` + `requestJson` cast | Shared `AppRouter` inference |
| DB | Drizzle + `pg` + Neon/Postgres | Prisma |
| Auth | Neon Auth (browser) + JWT middleware | NextAuth as the app framework |
| CSS | Tailwind v4 via `@tailwindcss/vite`; `@import "tailwindcss"` in `src/web/styles.css` | Tailwind v3 `tailwind.config.js` |
| UI primitives | shadcn `base-nova`, `rsc: false` → `src/components/ui` | Inventing primitives by default |
| Studio | Registries `@shadcn-studio` / `@ss-blocks` / `@ss-components` → `src/components/shadcn-studio/` | RBAC / Drizzle / `payrollApi` inside studio files |
| Icons | `lucide-react` | — |
| Validation | Zod 4 on routes | — |
| Themes | `next-themes` for dark/light only | Treating `next-themes` as Next.js |

`next-themes` is a package name only — the app is still Vite.

## T3 discipline → paths

| T3 idea | Here |
|---------|------|
| `page.tsx` | `src/web/<feature>/*-page.tsx` + `Route` in `app.tsx` |
| `layout.tsx` | `ShellLayout` + `app-nav.ts` (Wouter shell paths) |
| `loading.tsx` | Page-local `Skeleton` / `use-async-load` |
| tRPC router + `root.ts` | `src/server/routes/<kebab>.ts` + `v1.route` in `app.ts` |
| `utils/api.ts` | `types.ts` → `client.ts` → `payrollApi` facade |
| `server/auth` | Neon Auth + JWT middleware + `service/rbac` |
| Drizzle schema | `db/schema` → `npm run db:generate` → migrate → `repo/` |

## UI placement

1. **Primitives** — shadcn into `src/components/ui` (`components.json`). Use `cn()` from `@/lib/utils`.
2. **Studio** — blocks under `src/components/shadcn-studio/`. Compose in pages/shell; no I/O or RBAC inside studio modules.
3. **Domain widgets** — `src/components/payroll`.
4. **Tokens** — CSS variables in `src/web/styles.css`. Do not add a Tailwind v3 config.
5. **Marketing** — separate Vite entry (`landing.html` / `src/marketing/`); do not cross-import SPA styles.

Component-only work: layers 1–3. Data features: full checklist in `feature-checklist.md`.
