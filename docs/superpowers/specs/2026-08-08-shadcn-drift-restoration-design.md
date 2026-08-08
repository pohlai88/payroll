# shadcn/ui Drift Restoration

**Date:** 2026-08-08  
**Branch:** plan1-control-foundation  
**Scope:** Full design system — all `src/components/ui/` files, `globals.css` theme tokens, and consumer-level overrides in pages and layout components.

---

## Context

The project uses `shadcn@4.16.2` with `style: "base-nova"` and `baseColor: "neutral"` (see `components.json`). The `base-nova` style uses `@base-ui/react` primitives instead of Radix UI. Over time three categories of drift have accumulated:

1. Theme tokens in `globals.css` were patched (grayscale chart palette, custom `--font-heading` token).
2. UI component files may have been edited after initial CLI generation.
3. Consumer code hardcodes Tailwind color classes and layout overrides instead of using the token/variant system.

**Goal:** restore every layer to canonical shadcn base-nova output. No bespoke customisation — only what `npx shadcn@latest add` would generate.

---

## What is preserved (not touched)

- `--doc-*` CSS custom properties in `globals.css` (print palette for payslips, intentional and scoped).
- All business logic files — only UI layer is in scope.
- `components.json` configuration — style stays `base-nova`, baseColor stays `neutral`.

---

## Section 1 — Theme tokens (`globals.css`)

### 1a. Chart colour restoration

Current chart tokens are all grayscale:

```css
--chart-1: oklch(0.87 0 0);
--chart-2: oklch(0.556 0 0);
--chart-3: oklch(0.439 0 0);
--chart-4: oklch(0.371 0 0);
--chart-5: oklch(0.269 0 0);
```

Replace with the canonical `neutral` base-colour chart palette from `npx shadcn@latest init` output (varied hues, both `:root` and `.dark` blocks).

### 1b. `--font-heading` token

`--font-heading: var(--font-sans)` exists in `@theme inline`. Whether it stays depends on what `npx shadcn@latest add card` generates for `CardTitle`:

- If canonical `card.tsx` uses `font-heading` class → keep token.
- If canonical `card.tsx` does not → remove token from globals and replace `font-heading` usage in `app-sidebar.tsx` and `page.tsx` with plain `font-semibold`.

This is resolved during implementation (CLI is the authority).

---

## Section 2 — UI component files (`src/components/ui/`)

Regenerate all 20 component files via CLI:

```
button  card  badge  input  label  select  table  tabs
separator  checkbox  textarea  sonner  alert  dropdown-menu
dialog  sheet  chart  skeleton  tooltip  sidebar
```

Command: `npx shadcn@latest add <component> --overwrite` for each.

**`sidebar.tsx` special handling:** Run a before/after diff after regeneration to confirm no app-specific logic was embedded. At ~800 lines it is the highest-risk file. If the diff shows business logic, extract it before overwriting.

---

## Section 3 — Consumer-level cleanup

### `src/app/page.tsx`

| Location | Current | Fix |
|---|---|---|
| Line ~238 "Clear" badge | `variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"` | Remove className — use `variant="secondary"` only |
| Line ~323 "0" blocking badge | Same hardcoded green classes | Same fix |
| Line ~186 stat-card grid wrapper | `*:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card` | Remove entirely — Cards use canonical ring/border from component |

### `src/components/app-sidebar.tsx`

| Location | Current | Fix |
|---|---|---|
| Logo `SidebarMenuButton` | `className="data-[slot=sidebar-menu-button]:!p-1.5"` | Remove className |
| `BanknoteIcon` | `className="!size-5"` | Remove className |
| App name `<span>` | `className="font-heading text-base font-semibold tracking-tight"` | Simplify to `font-semibold text-sm` (or whatever canonical sidebar block uses) |

### `src/components/site-header.tsx`

| Location | Current | Fix |
|---|---|---|
| `<header>` element | `className="app-header flex h-..."` | Remove `app-header` (no matching styles in globals.css — stale hook) |

---

## Implementation sequence

1. Stash current changes, create a clean working commit baseline.
2. Restore `globals.css` chart tokens (Section 1a).
3. Run `npx shadcn@latest add --overwrite` for all 20 components (Section 2).
4. Diff `sidebar.tsx` before/after; resolve `--font-heading` based on CLI card output (Section 1b).
5. Clean consumer overrides in `page.tsx`, `app-sidebar.tsx`, `site-header.tsx` (Section 3).
6. Start dev server, visual check: dashboard, sidebar, header, badge variants.
7. Commit.

---

## Success criteria

- `globals.css` chart tokens match canonical neutral palette.
- All `src/components/ui/` files match `npx shadcn@latest add` output byte-for-byte (modulo line endings).
- No `bg-green-*`, `text-green-*`, or other hardcoded semantic colour classes remain in page/layout files.
- No `!important` class overrides (`!size-*`, `!p-*`) in sidebar or header.
- Dev server renders dashboard, sidebar, and header without visual regressions on the data path.
