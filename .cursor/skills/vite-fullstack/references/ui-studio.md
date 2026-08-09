# UI / UX — shadcn-studio only (`/rui` `/cui` `/iui`)

Load when building, refining, or inspiring UI. Overrides freehand layout invention and generic frontend-design skills for this repo.

## Validation (MCP)

| Check | Expected |
|-------|----------|
| Server | `user-shadcn-studio-mcp` status `ready` |
| Commands | `/cui` → `get-create-instructions`; `/iui` → `get-inspire-instructions`; `/rui` → `get-refine-instructions` |
| Catalog | `get-blocks-metadata` returns categories (dashboard, marketing, datatable, …) |
| Config | `components.json`: `style: base-nova`, `rsc: false`, registries `@shadcn-studio` / `@ss-blocks` / `@ss-components` |
| Install root | Project root; never re-init shadcn |

If a tool reports freemium/license limit on `/iui`, say so and fall back to `/cui`.

## Allowed workflows only

| Command | When | First MCP call | Then |
|---------|------|----------------|------|
| `/iui` | New surface from inspiration | `get-inspire-instructions` | `get-blocks-metadata` → `get-inspiration-block-content` → synthesize into Vite paths |
| `/cui` | New surface from registry blocks | `get-create-instructions` | metadata → `get-block-meta-content` → `collect_selected_blocks` → batch `get_add_command_for_items` → customize content |
| `/rui` | Edit existing UI in place | `get-refine-instructions` | `get-component-meta-content` → `collect_selected_components` → batch install → edit files |

**Hard constraint:** UI/UX work uses **only** `/rui`, `/cui`, `/iui`. Do not invent layouts, hero systems, or component kits outside these flows.

## Forbidden for UI/UX

| Do not | Why |
|--------|-----|
| `/ftc` / Figma-to-code | Out of scope for this skill gate |
| Freehand page scaffolds | Bypass studio DNA |
| Re-init `shadcn` / change `components.json` style | Breaks `base-nova` + aliases |
| Put `payrollApi`, fetch, or RBAC inside `shadcn-studio/` | Studio = presentational only |
| Next `app/**/page.tsx` as product routes | Adapt installs into `src/web/<feature>/` + Wouter |
| Parallel design systems (random card grids, purple themes, etc.) | Studio + `shadcn.css` tokens only |

## Vite path adaptation (mandatory)

Studio docs often say `page.tsx` / `app/…`. **Here:**

1. Primitives / registry atoms → `src/components/ui/`
2. Blocks / inspired sections → `src/components/shadcn-studio/…`
3. Product composition → `src/web/<feature>/*-page.tsx` or feature widgets
4. Shell chrome → `src/web/shell/`
5. Marketing → `src/marketing/` only (`landing.html`); never import `src/web/shadcn.css` into marketing or vice versa
6. Wire routes in `src/web/app.tsx` + `app-nav.ts` when shell-visible

One block at a time for `/cui` and `/iui` unless the instruction set explicitly batches.

## Decision cheat sheet

```
New page / section / block?     → /iui (prefer) or /cui
Refine existing component?      → /rui
API / DTO / DB change?          → vite-fullstack Mode A/B (not studio)
Theme install only?             → /rui path + install-theme (still under /rui)
```
