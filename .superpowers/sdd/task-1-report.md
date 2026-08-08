# Task 1 Report: Pin CLI, Studio selection, evidence file

## Status

DONE

## What was implemented

Created `docs/superpowers/evidence/2026-08-08-phase4c-cli.md` recording:

1. **Pinned CLI** — `PINNED_VERSION=4.16.2` from `npm view shadcn version` at 2026-08-08T13:48:25Z; verified via `npx shadcn@4.16.2 --version`.
2. **Studio selection** — Minimum primitives for 4A/4B: `button`, `input`, `label`, `card`, `alert`, `table`, `badge`. Theme: none — tokens only via Straits. Rejected sidebar/dashboard/`/cui` blocks.
3. **Deferred install commands** — Documented for Task 2+ (`init` + `add` with pinned version).

No runtime code changes.

## Verification

| Check | Result |
|---|---|
| `git status --short` | Dirty tree noted; only evidence file staged for commit |
| `npm view shadcn version` | `4.16.2` |
| `npx shadcn@4.16.2 --version` | `4.16.2` |
| Studio MCP `get-create-instructions` | Success (after `mcp_auth`) |
| Studio MCP `get-component-meta-content` | Confirmed 6/7 variant catalogs; `label` has no catalog but is registry dependency |
| Tests | N/A — docs/evidence only |

## Commit

```
3b962c8 docs: record Phase 4C pinned shadcn CLI and Studio selection
```

Staged only: `docs/superpowers/evidence/2026-08-08-phase4c-cli.md`

## Self-review

**Strengths**

- Evidence matches brief template verbatim (pinned version, component list, rejected items, deferred commands).
- Global constraints honored: no `@latest`, no `/cui` chrome, narrow staging, no runtime edits.
- Studio MCP used to confirm primitives; MCP auth gap documented.

**No issues in**

- Component list matches plan/spec required set exactly.
- Optional `separator`/`sonner` correctly skipped.

## Concerns

1. **`label` Studio catalog** — `get-component-meta-content` endpoint `label` returns "Component not found"; primitive still required per plan and confirmed via `registryDependencies` on input/card variants. Install list unchanged.
2. **MCP initial disconnect** — First MCP call failed until `mcp_auth`; documented in evidence.

## Recommendation

Proceed to Task 2 (Tailwind v4 + shadcn init) using `npx shadcn@4.16.2` and style `base-nova`.
