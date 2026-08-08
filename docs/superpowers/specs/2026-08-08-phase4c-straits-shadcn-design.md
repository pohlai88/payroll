# Phase 4C — Vite Straits / shadcn design-system foundation

**Date:** 2026-08-08 · **Status:** ACCEPTED / FROZEN · **Scope:** Tailwind v4 + Studio-selected shadcn primitives + Straits token projection on the existing Vite SPA

Wires the Straits colour contract and shadcn primitives into the Phase 4A/4B
shell without product chrome, new workflows, or auth/import behaviour changes.

Companions: [palette README](../../palette/README.md) (doctrine),
[straits-document-palette.json](../../palette/straits-document-palette.json)
(canonical values), [phase4a-auth-shell-design](./2026-08-08-phase4a-auth-shell-design.md)
(frozen), [phase4b-employee-import-api-design](./2026-08-08-phase4b-employee-import-api-design.md)
(frozen), [presentation-facade](../../architecture/presentation-facade.md).

---

## Invariant

> Studio and shadcn are generation inputs, not continuing runtime or architectural
> authorities. Straits doctrine decides what may remain. The browser still never
> becomes authorization authority (Phase 4A invariant unchanged).

---

## 1. Scope and authority

### In scope

- Tailwind v4 + shadcn wiring on the existing Vite SPA under `src/web/`
- Studio selects theme/preset and the minimal primitives needed by shipped surfaces
- Install via pinned `npx shadcn@<exact-version>` (resolve once if Studio emits
  `@latest`; record version in the implementation plan/evidence)
- Inspect proposed generation (`--diff` / `--dry-run` / `--view` where available)
  before write; compare actual diff to the inspected proposal
- Full Straits app-token contract projected into CSS (`:root` / `.dark`), plus
  status / section / chart families required by doctrine
- The `--doc-*` contract/namespace is established in 4C. Tokens with canonical
  print values MUST be emitted into CSS. Tokens whose doctrine has no canonical
  value yet MUST be documented as reserved/unimplemented and MUST NOT be emitted
  with invented placeholder values
- Restyle **only currently shipped 4A/4B surfaces** with installed primitives
- README phase line records Phase 4C design-system foundation complete (without
  implying chrome, dashboard, or Phase 5 payroll presentation)

### Out of scope

- Sidebar / dashboard / nav chrome; Studio `/cui` layout blocks
- New API routes, auth semantics, import behaviour, or demo gallery / workflows
  introduced merely to demonstrate the design system
- Discretionary visual or refactoring “improvements” to generated primitives
- Broad shadcn normalization sweeps
- Treating CLI or theme output as authority over Straits
- Unreviewed `shadcn apply` (or equivalent broad rewrite) as a casual install

### Authority chain

```text
Studio → selects what (theme / components / blocks)
pinned shadcn CLI → installs how
Straits doctrine → decides what may remain
repo → owns accepted source
```

Studio and shadcn are generation inputs, not continuing runtime or architectural
authorities.

### Straits internal precedence

```text
docs/palette/README.md doctrine
  → canonical palette/token JSON
  → app CSS token projection
  → generated shadcn / component styles
```

Generated CSS variables may be **translated into** Straits semantics, never the
reverse.

### Integration vs design edits

No discretionary visual/refactoring changes to generated primitives. Minimal
integration changes required for compilation, Vite compatibility, accessibility
correctness, or Straits token mapping are permitted and must be attributable to
one of those reasons.

---

## 2. Architecture and install pipeline

### Layout

```text
src/web/                  consumer (existing 4A/4B surfaces)
src/components/ui/        generated / shared primitives
src/lib/utils.ts          primitive support
src/hooks/                hooks alias root (as CLI expects)
```

Do not nest shadcn under `src/web/components`. Primitives are shared
design-system artefacts; `src/web` is the presentation consumer.

### Aliases

Canonical `@/*` → `./src/*` across TypeScript and Vite (`tsconfig` paths +
`vite.config.ts`). `components.json` uses the same roots:

```text
components  → @/components
ui          → @/components/ui
lib         → @/lib
utils       → @/lib/utils
hooks       → @/hooks
```

Do not introduce a `#...` package-import scheme in this slice.

### Tailwind v4

Configure Tailwind v4 according to the pinned shadcn/Vite-generated contract,
including CSS-first `@import "tailwindcss"` and `@theme inline`; retain only
generated support imports/directives actually required by accepted primitives
(e.g. animate / shadcn CSS / dark custom variant when the generated setup needs
them).

**Straits owns semantic token values; `@theme inline` exposes those semantic
values to Tailwind utilities.** Do not duplicate colour literals inside
`@theme inline`.

```css
:root {
  --background: /* Straits value */;
  --foreground: /* Straits value */;
}

.dark {
  --background: /* Straits dark value */;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
}
```

Replace the active plain Phase 4A theme in `src/web/styles.css` (or have the
app entry import the tokenized CSS) so the Georgia demo theme is not left as a
parallel authority.

### Install loop

```text
0. Confirm expected baseline / clean diff
1. Studio returns command (MCP must work; do not invent block/component names)
2. Resolve and record exact CLI version if Studio emits @latest
3. Inspect proposed output
4. Execute pinned CLI
5. Inspect actual diff against inspected proposal
6. Straits acceptance gate (§3)
7. Minimal attributable integration edits
8. Verify typecheck / tests / check / production build
```

**Generated output that materially exceeds the inspected installation scope is a
stop condition**, not something to clean up afterward.

### Theme / apply

Prefer Studio theme selection that lands as inspectable CSS-variable changes.
`shadcn apply` (or any command that rewrites theme, CSS variables, fonts, icons,
and reinstalls existing components) is a **reviewed migration**, not an innocent
install side effect.

---

## 3. Straits token projection and acceptance gate

### App layer (`:root` / `.dark`)

Project the light mapping from the palette README (and values from the JSON):

| Semantic | Source |
|---|---|
| `background` | white |
| `card`, `popover` | `cool_porcelain` |
| `foreground` | ink body |
| `primary` | `executive_navy` |
| `ring`, `accent` | `governance_teal` |
| `destructive` | `destructive_clay` |
| `border`, `input` | hairline |
| `muted`, `secondary` | `screen_reference` tints |
| `chart-1..5` | `chart.series` |

Dark mode is a semantic remap only (doctrine surfaces/contrasts). Brand reference
hexes are not exposed as Tailwind palette utilities.

Register status and section families required by doctrine even if 4C barely
consumes section tints — registration is enough; do not invent UI solely to
demonstrate tokens.

### Status naming map

```text
CSS semantic family     Component API
status-ok-*          ←  success
status-info-*        ←  info
status-warn-*        ←  warning
status-bad-*         ←  destructive / error (where doctrine permits)
```

Do not rename palette doctrine merely to match component API spelling.

### Component contract

From palette doctrine — Badge/Alert may expose success/warning/info; Button does
not. If generated primitives lack variants needed by shipped surfaces, add only
what those surfaces require (attributable integration).

### Document layer (`--doc-*`)

```text
canonical document value exists
    → emit --doc-* CSS variable

canonical value does not exist
    → reserve/document token name
    → no fabricated CSS value
```

- Where doctrine defines a document token and a canonical print value exists,
  emit that value into CSS.
- Where doctrine has no canonical value yet, document the token as
  reserved/unimplemented; do not emit invented placeholder values. No
  placeholder hex may masquerade as canonical doctrine.
- If CSS technically requires a variable immediately, the implementation plan
  must state an explicit documented fallback — not a silent “plausible” colour.
- `--doc-*` MUST NOT be implicitly remapped by `.dark` application-theme
  semantics unless document doctrine explicitly defines such a mapping.

### No raw palette rule

No raw hex or raw Tailwind palette utilities in:

- `src/web/**`
- repo-owned integration edits under `src/components/ui/**`

Exception: canonical token-definition CSS may contain literal values sourced from
the Straits palette contract. Components consume semantics only (no inline hex
styles, no `bg-slate-100` / `text-blue-700`).

### Non-colour meaning

Status meaning MUST NOT depend on colour alone. Where status semantics are
rendered in 4C, retain the doctrine-required glyph and/or an explicit text label.

Light and dark semantic foreground/background pairs used by shipped surfaces must
remain legible; focus indication must remain visible. This is a foundation
minimum, not a full a11y certification exercise.

### Acceptance gate (PASS only if)

1. Straits semantic app-token contract is present.
2. `:root` and `.dark` are semantic projections, not duplicate palettes.
3. `@theme inline` contains semantic aliases, not copied colour literals.
4. Status/section/chart families required by doctrine are present.
5. Status meaning is not carried by colour alone.
6. `--doc-*` CSS variables are emitted only for tokens with canonical print
   values; reserved/unimplemented names are documented, not fabricated.
7. `.dark` does not mutate `--doc-*`.
8. No invented document values masquerade as canonical.
9. No raw hex/raw Tailwind palette styling exists in consumers or repo-owned
   primitive integration code.
10. Generated shadcn theme conflicts are reconciled in favour of Straits.
11. No unrequested blocks/components/chrome entered the diff.
12. Auth and employee-import behaviour is unchanged.
13. Typecheck, tests, repo check/lint, and production Vite build remain green.

---

## 4. Consumer adoption, verification, and closure

### Surfaces (presentation only)

Restyle existing shipped consumers only:

- `src/web/app.tsx` — sign-in, signed-in summary (me / permissions), conditional
  admin users table, and existing shell container/layout only; no navigation or
  product-chrome architecture
- `src/web/employee-import-panel.tsx` — template download / upload path UI
- Related web markup/styles entry as needed for the tokenized CSS

Swap native controls for Studio-selected primitives (`Button`, `Input`, `Label`,
`Card`, `Alert`, `Table`, `Badge`, etc.). Keep deterministic 4A/4B states
(loading, signed out, forbidden, session expired, API `{ code, message }`) and
map them through semantic tokens / `Alert` (glyph or label when status-like).

### Behavior-diff guard

Changes to auth/API/import behaviour modules are a **stop condition** unless
strictly required for presentation integration and individually justified. No
request shapes, endpoint paths, token/session behaviour, permission decisions,
parsing, validation, or import semantics may change.

Expected review answer: 4C changed **only how existing states are rendered**.

### Verification

**Generation evidence**

- Exact pinned shadcn CLI version recorded
- Inspected proposal retained/recorded
- Actual generated diff compared with proposal

**Static / automated**

- Section 3 thirteen-point Straits gate passes
- `npm run typecheck`
- `npm test`
- `npm run check`
- `npm run build` (hard gate — Vite production bundle)

**Behavior guard**

- Auth/API/import contracts unchanged
- No new endpoint / workflow / authorization / import semantics
- Presentation-only diff for existing consumer surfaces

**Manual smoke**

- Sign in
- me + permissions
- Conditional admin users
- Employee template / upload path
- Loading / forbidden / expired / API-error states
- Light + dark semantic rendering
- Keyboard focus remains visible
- No obvious narrow-viewport overflow

Manual smoke proves the foundation’s semantic contract; it is not a visual-polish
or responsive-redesign exercise.

### Done when

- Repo owns accepted primitives and Straits-projected CSS
- Shipped 4A/4B surfaces consume semantics
- README records **Phase 4C design-system foundation complete**, without implying
  application chrome, dashboard, or Phase 5 payroll presentation is complete

### Explicit non-goals

`/cui` chrome, Phase 5 payroll UI, inventing print UI, money/derivation
presentation beyond what 4B already shows.

---

## 5. Testing notes

- Prefer extending existing domain/API tests only if presentation integration
  would otherwise risk silent contract drift; 4C does not require a new visual
  snapshot suite.
- Production `npm run build` is mandatory evidence that Tailwind scanning, CSS
  imports, aliases, and generated dependencies resolve under Vite.
- Record CLI version and install evidence in the implementation plan or an
  adjacent evidence note under `docs/superpowers/` when executing.
