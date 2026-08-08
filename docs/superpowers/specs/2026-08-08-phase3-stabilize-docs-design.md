# Phase 3 stabilize — living docs + light code hygiene

**Date:** 2026-08-08 · **Status:** CLOSED / FROZEN · **Scope:** Auth/Phase 3 + living docs only

## Closure

```
PHASE 3 STABILIZE — CLOSED

Current auth/API architecture and living documentation are aligned.
Historical Plan1 documentation remains intentionally historical.
Environment loading and injected-env correctness defects are repaired.
Targeted auth/domain/DB verification passes.

No further work belongs to this stabilization slice.

Deferred:
- payroll L4 business mutations
- findings/revision flows
- richer system-admin authorization semantics
  (requireSystemAdmin still surfaces as PERMISSION_DENIED / COMPANY / UPDATE)
- unrelated documentation/design/package cleanup
```

Treat Phase 3 auth as stable infrastructure. Further auth changes only when a
consuming vertical needs them — not another cleanup sweep.

### Closure checks (not reopeners)

1. `.env.example` — names + safe placeholders only (`ep-xxxx…`, local Docker
   URL matching the published `LOCAL_DEV_DATABASE_URL`; no Neon secrets/tokens).
2. `load-env-local.ts` — deliberately narrow: KEY=VALUE, optional quotes, `#`
   comments; no `${VAR}` expansion, no multiline, not a full dotenv clone.
   Documented on the module; covered by `tests/domain/load-env-local.test.ts`.

## Objective

Make the current Auth / Phase 3 implementation and current documentation
truthful, robust, and internally consistent — without redesigning architecture
or cleaning unrelated areas.

## In scope

1. Harden concrete Auth/Phase 3 defects found on review: `.env.local` loading
   for API/CLI, failure edges, materially missing tests, low-risk dead auth code.
2. Repair living docs that contradict the tree: `payroll-architecture.md`,
   `presentation-facade.md` L4, README status/map, auth design status, other
   *current* claims that `src/server` / L4 are unbuilt.
3. README documentation map: doctrine vs living status vs active plans vs archive.
4. Plan1 SQLite/`src/server/*` v1 docs: historical marker only if they present as
   current authority — do not rewrite contents.

## Out of scope

Broad docs rewrite, palette/design-system, unrelated package cleanup, cosmetic
refactors, architecture redesign, speculative abstractions, renames without
correctness reason, drive-by edits.

## Change rule

Every change must be one of: current factual contradiction, correctness defect,
reliability risk, or missing high-value verification.

## Evidence rule

Inspect the tree and approved architecture first. Implementation is evidence,
not automatic doctrine. L4 facade still describes findings/revision for later
phases — document what exists now without inventing business mutation APIs.
