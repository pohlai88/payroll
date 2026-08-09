# File header surface envelopes (lean + hub chain)

## Purpose

Make vertical slices **greppable** and **obvious at file open**, without duplicating the whole inventory on every file.

- Grep: `rg "@feature companies"` / `rg "@layer service"`
- Sight: open any file → see feature + layer; open hub → see full stack chain
- Keep [feature-surface-map.md](../../../.cursor/skills/vite-fullstack/references/feature-surface-map.md) as the live inventory (orphans, grades, status)

Agent/skill operating guide: [.cursor/skills/vite-fullstack/references/file-headers.md](../../../.cursor/skills/vite-fullstack/references/file-headers.md).

## Decision

**Approach B:** lean `@feature` / `@layer` tags on every feature-owned file; `@chain` (and optional `@surface`) only on one **hub** file per feature.

## Convention

### Required on every feature-owned source file

```ts
/**
 * @feature <kebab-slug>
 * @layer <role>
 *
 * <one-line purpose>
 */
```

### `@layer` vocabulary (closed)

| Tag | Typical path |
|-----|----------------|
| `ui` | `src/web/<feature>/*` pages/panels |
| `client` | Feature-dedicated client modules, or section banners in shared `client.ts` |
| `route` | `src/server/routes/*.ts` |
| `service` | `src/service/*.ts` |
| `repo` | `src/repo/*.ts` |
| `schema` | `src/db/schema/*.ts` |
| `domain` | `src/domain/**` |
| `test` | `tests/**` |
| `spine` | `src/server/app.ts`, `src/web/app.tsx`, `src/web/shell/app-nav.ts` |

### `@feature` slugs (starter set, kebab-case)

`companies`, `employees`, `employee-import`, `admin-users`, `me`, `pay-run`, `workspace`, `control`, `payslip`, `artifacts`, `reports`, `remuneration`, `diff`, `derivation`, `findings`, `gates`, `transfer`, `treatments`, `rbac`, `health`, `shell`, `auth`, `marketing`.

Shared UI primitives (`components/ui/*`) use `shell`. Feature-bound studio blocks use the feature slug.

Shared cross-cutting modules use the narrowest primary slug (e.g. `rbac`), not a comma list.

### Leaf `@hub`

Repo, service, and feature UI leaves **must** include `@hub <path>` pointing at the hub file (see skill hub map). Optional on schema/domain/test/shell primitives.

### Hub `@chain`

**Hub rule:** API-backed features → hub = **route** module. SPA-only → hub = **page** or marketing landing. Never put `@chain` on every layer file.

Chain keys (fixed; omit N/A): `ui`, `client`, `route`, `service`, `repo`, `schema`, `spine`.

Paths are repo-relative under `src/` (or method names for `client`).

Optional on hubs:

```ts
 * @surface GET|POST /v1/admin/companies; PATCH /v1/admin/companies/:companyId
```

### Shared mega-files

Do not invent a fake single `@feature` for `client.ts`, `types.ts`, or `app.ts`. Use section banners:

```ts
// --- @feature companies @layer client ---
```

Same tag strings so `rg "@feature companies"` still hits.

## Non-goals

- No peers list on every file
- No replacement of feature-surface-map
- No CI linter in v1 (convention + skill checklist first)

## Rollout

1. Pilot: **companies** gold path
2. Opportunistic: when touching another feature, add lean tags (and hub chain if missing)
3. No big-bang rewrite of the tree

## Success criteria

- Piloted companies files show `@feature` + `@layer` in the first screenful
- `rg "@feature companies"` returns the vertical slice
- Hub route shows full `@chain`
- Mode A checklist requires headers on new/changed feature files
- feature-surface-map remains status/orphan source of truth
