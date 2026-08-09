---
name: hub-refactor
description: >
  Hub-scoped bulk refactor for this payroll repo using @feature / @layer / @hub /
  @chain file headers as the work unit. One hub at a time for debt/DTO/AuthZ work;
  parallel only isolated thin hubs. Applies code-quality + coding-standards, then
  code-reviewer per hub. Use when the user says hub refactor, bulk refactor,
  refactor by feature/@chain, fat-route extract, or names a hub slug (companies,
  remuneration, pay-run, control, etc.).
---

# Hub refactor

Unit of work = one `@chain` hub + its `@feature` leaves. Do not refactor the whole tree in one pass.

Headers: [vite-fullstack/references/file-headers.md](../vite-fullstack/references/file-headers.md).  
Layering / Mode B: [vite-fullstack/SKILL.md](../vite-fullstack/SKILL.md).  
Gold path: [vite-fullstack/references/companies-trace.md](../vite-fullstack/references/companies-trace.md).  
Batching rules: [references/batching.md](references/batching.md).

## Hard rules

1. **Default: one hub at a time** if extracting SQL, changing DTOs, or touching AuthZ/persistence.
2. Touch **only** files from `rg "@feature <slug>" src tests` (plus spines listed in hub `@chain`).
3. Prefer companies layering: `schema → repo → service (RBAC) → route (Zod) → types/client → ui`.
4. Update `@chain` / `@hub` / `Keep in sync` in the **same** change as path or shape moves.
5. After the hub: run targeted tests, then **code-reviewer** on that hub's diff only.
6. Never co-batch forbidden pairs ([batching.md](references/batching.md)).

## Quality bar + load order (every hub)

Load in this order:

1. This skill (`hub-refactor`)
2. [file-headers.md](../vite-fullstack/references/file-headers.md) — hub map, tags, audit
3. Personal **code-quality** + **coding-standards** (ignore Next/tRPC/Prisma advice; stack is Vite + Hono + Drizzle)
4. [vite-fullstack](../vite-fullstack/SKILL.md) only if wiring / DTO / nav / registration breaks (Mode B)
5. After tests: Task **code-reviewer** on this hub's diff; fix criticals before the next hub

## Per-hub loop

Copy and check off:

```
Hub Progress (<slug>):
- [ ] 1. Confirm slug + intent (extract | polish | headers-only)
- [ ] 2. Scope: rg "@feature <slug>" src tests
- [ ] 3. Read hub @chain (route or marketing landing)
- [ ] 4. Refactor in-scope files only (code-quality + coding-standards)
- [ ] 5. Sync headers / Keep in sync / feature-surface-map if inventory changed
- [ ] 6. Targeted tests for this hub
- [ ] 7. Task code-reviewer on this hub's diff; fix findings
- [ ] 8. File-headers audit clean for touched trees
```

### Scope commands

```bash
rg "@feature <slug>" src tests
rg "@chain" src/server/routes/<hub-file>.ts   # or src/marketing/landing.tsx
rg "@hub src/server/routes/<hub-file>" src
```

### Intent presets

| Intent | Do | Don't |
|--------|----|--------|
| `extract` | Move SQL/DTO out of fat route → repo/service; keep HTTP JSON stable | Redesign product UX |
| `polish` | Naming, layering, error paths, dead code | Behavior/API shape changes unless required for correctness |
| `headers-only` | Fix `@feature`/`@layer`/`@hub`/`@chain` | Logic edits |

If user says "start" with no slug: **`remuneration` + `extract`**.

## Hub map

Canonical slug → hub path table: [file-headers.md — Hub map](../vite-fullstack/references/file-headers.md#hub-map-api--marketing). Do not duplicate paths here.

## Done when

- Diff stays inside the feature grep (no drive-by other hubs)
- Layering matches intent; fat SQL not expanded in routes
- Headers/`Keep in sync` accurate; hub `@chain` paths still true
- Targeted tests green; code-reviewer criticals fixed
- Forbidden co-batch pairs not mixed in the same PR

## Out of scope unless asked

Product redesign, schema redesign, big-bang multi-fat-route extract in one PR.
