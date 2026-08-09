# Skill system optimization (vite-fullstack + hub-refactor + headers)

## Purpose

Make project skills discoverable, non-overlapping, and safe for agents doing create/wire vs hub-scoped bulk refactor. Single source of truth for the hub map. Document how personal quality/review skills load with this stack.

## Non-goals

- No `src/` product behavior changes in the implementation of this spec
- Do not merge `hub-refactor` into `vite-fullstack`
- Do not split `file-headers` into a third top-level skill
- Do not copy personal skills (`code-quality`, `coding-standards`) into the repo

## Skill ownership

| Skill / doc | Owns | Does not own |
|-------------|------|----------------|
| `vite-fullstack` | Mode A create, Mode B drift, continuous-dev, UI studio gate (`/rui` `/cui` `/iui`), registration spines | Multi-file debt extract programs |
| `hub-refactor` | Hub-scoped bulk refactor (`extract` / `polish` / `headers-only`) | New greenfield features (hand off to Mode A) |
| `vite-fullstack/references/file-headers.md` | Tag convention, **canonical hub map + slug list**, audit greps | Refactor tactics / batching |
| `hub-refactor/references/batching.md` | Never-batch pairs, debt order, parallel-safe set | Hub path table (link to file-headers) |
| `.cursor/skills/README.md` | Skill map, when to load which, load order, `.cursor`→`.claude` sync rule | Feature inventory (surface-map) |
| Personal: code-quality, coding-standards, code-reviewer | Quality bar + post-hub review | Stack layout — **vite-fullstack overrides Next/tRPC/Prisma advice** |

## Canonical data

- **Hub map + `@feature` slug list + `@layer` vocab + audit commands:** only in [`file-headers.md`](../../../.cursor/skills/vite-fullstack/references/file-headers.md).
- `hub-refactor/SKILL.md` must **not** duplicate the hub path table; link to file-headers.
- Hub count for audits: **17** (16 registered API route hubs + `src/marketing/landing.tsx`). `pay-run-access.ts` is not a hub.

## vite-fullstack changes

1. Scope gate: add row — bulk refactor / fat-route extract / polish by `@feature` → **hub-refactor**.
2. Keep Mode A step 12 + Done-when header rules; point audits at file-headers.
3. References: keep link to hub-refactor; no second hub map.
4. continuous-dev DoD: keep file-header line; optional one-liner “debt extract → hub-refactor”.

## hub-refactor changes

1. Remove duplicate hub map table from SKILL.md; replace with link to file-headers hub map.
2. Keep: hard rules, quality bar (personal skills + ignore Next), per-hub loop, intent presets, default `remuneration`+`extract`, Done when.
3. Quality bar: explicit load order (see below).
4. batching.md stays; ensure it does not restate full hub paths (slug names only is fine).

## file-headers.md changes

1. Fix audit commentary: expect **17** hubs (`rg -l '@chain' src` after excluding false positives).
2. Keep documented exceptions: `vite-env.d.ts`, `src/db/migrations/**`.
3. Tighten `@hub` audit guidance to match required-leaf rules (repo, service, feature UI including payslip-document, feature-bound studio/payroll).
4. Remain the only place with the full hub path table.

## Skill map README (new)

Create [`.cursor/skills/README.md`](../../../.cursor/skills/README.md):

- Table: skill → use when → start file
- Hub refactor load order (below)
- Sync rule: edit under `.cursor/skills/**`, then copy to `.claude/skills/**` (same relative paths). Do not edit `.claude` as primary.

Mirror README into `.claude/skills/README.md` on sync.

## Agent load order

### Hub refactor (extract / polish / headers-only)

1. `hub-refactor`
2. `file-headers.md` (via hub-refactor / vite-fullstack link)
3. Personal **code-quality** + **coding-standards** (ignore Next-shaped advice)
4. `vite-fullstack` only if wiring / DTO / nav / registration breaks (Mode B)
5. Task **code-reviewer** on that hub’s diff after tests; fix criticals before next hub

### Mode A create / Mode B drift

1. `vite-fullstack` (+ checklist / drift-audit / surface-map as needed)
2. `file-headers.md` when adding/touching files
3. Personal quality skills as usual for correctness
4. Do **not** start `hub-refactor` unless the ask is explicitly multi-file debt extract

## Sync discipline

| Primary | Mirror |
|---------|--------|
| `.cursor/skills/vite-fullstack/**` | `.claude/skills/vite-fullstack/**` |
| `.cursor/skills/hub-refactor/**` | `.claude/skills/hub-refactor/**` |
| `.cursor/skills/README.md` | `.claude/skills/README.md` |

Implementation of this spec updates primary then mirrors in the same change.

## Success criteria

- One hub map in the tree (file-headers only)
- README skill map exists and states load order + sync rule
- vite-fullstack Scope gate routes bulk refactor to hub-refactor
- hub-refactor SKILL has no duplicate hub path table
- `.cursor` and `.claude` copies match after implementation
- No product `src/` changes required for this spec

## Implementation note

Follow-on plan (writing-plans) edits skill markdown only; no commits of product code unless a later hub-refactor execution asks for it.
