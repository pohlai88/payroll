# Pay-run Hono Routes Implementation Plan

> **Historical plan.** Success response shapes below are superseded by
> [Phase 5A mutation envelope](../specs/2026-08-08-phase5a-mutation-envelope-design.md)
> (`PayRunMutationEnvelope`; recompute fields live under `mutation.*`).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auth-gated `POST /v1/pay-runs` and `POST /v1/pay-runs/:runId/recompute` over Neon Auth, reusing [`src/service/payrun.ts`](../../../src/service/payrun.ts), with zero changes under `src/web/**`.

**Architecture:** Mirror Phase 4B employee-import: thin Hono route module → service `*ForActor` wrappers (RBAC + Neon-linked actor email) → existing `createRun` / `recomputeRun`. JWT AuthN stays on `/v1` middleware; AuthZ uses matrix resource `PAY_RUN`.

**Tech Stack:** Hono, Zod, Drizzle/Postgres, Vitest DB harness, existing Neon Auth JWT verify + invite resolve.

## Global Constraints

- Neon Auth Bearer only (no alternate AuthN); actor audit string = resolved `users.email` after JWT→invite link — never client-supplied
- No `src/web/**` edits; no list/get/status-transition endpoints in this slice
- Do not change calc engine membership rules or DB triggers
- Errors: `{ code, message }`; recompute line failures remain HTTP 200 with `{ computed, failures }`
- New RBAC resources/actions: none (`PAY_RUN` already exists)

---

## Approved design (locked)

| Method | Path | AuthZ | Success |
|--------|------|-------|---------|
| `POST` | `/v1/pay-runs` | `PAY_RUN`/`CREATE` + body `companyId` | `201 { runId, lineCount }` |
| `POST` | `/v1/pay-runs/:runId/recompute` | Load run `companyId`; `PAY_RUN`/`UPDATE` | `200 { computed, failures }` |

**Create JSON body (Zod):** `runId`, `companyId`, `rulePackId`, `year`, `month`, `periodStart`, `periodEnd`, `workingDays`, optional `paidDays`, `onlyEmploymentIds`, `runType`, `offcycleReason`. Omit `actor`.

**Out:** list/get, approve/close, line/PCB edits, SPA client, engine changes.

Spec: [pay-run-http-api-design](../specs/2026-08-08-pay-run-http-api-design.md).

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `docs/superpowers/specs/2026-08-08-pay-run-http-api-design.md` | Short contract |
| Create | `docs/superpowers/plans/2026-08-08-pay-run-http-api.md` | This plan |
| Create | `src/server/routes/pay-run.ts` | Thin handlers |
| Modify | `src/service/payrun.ts` | `PayRunError`, `*ForActor` |
| Modify | `src/server/app.ts` | Mount routes |
| Modify | `src/server/errors.ts` | Map `PayRunError` |
| Create | `tests/db/pay-run-api.test.ts` | Injected Neon JWT + real DB |
| Modify | `README.md` | Note routes exist |

---

### Task 1: Design spec + failing API tests

Write spec + this plan. Add `tests/db/pay-run-api.test.ts` cases: 401, 403, 201 create, 200 recompute, 400 bad body, 404 unknown run, actor email on create.

Run: `npx vitest run tests/db/pay-run-api.test.ts` — expect FAIL until routes exist.

### Task 2: Service `*ForActor` + `PayRunError`

Add `PayRunError`, `createRunForActor`, `recomputeRunForActor` in `src/service/payrun.ts`. Map in `src/server/errors.ts`.

### Task 3: Routes + mount

`src/server/routes/pay-run.ts` + mount in `createApp`.

### Task 4: Green tests + README

Tests PASS; README notes `/v1/pay-runs*` (Neon Auth + `PAY_RUN`); no SPA.

Do **not** commit unless the user asks.
