# Pay-run HTTP API (create + recompute)

**Date:** 2026-08-08 · **Status:** Implemented · **Scope:** Hono business routes over Neon Auth

Exposes Phase 2 `createRun` / `recomputeRun` through the Phase 3 Neon Auth stack.
No SPA, no list/get, no status transitions.

Companions: [hono-neon-auth-design](./2026-08-08-hono-neon-auth-design.md) (frozen),
[phase4b-employee-import-api-design](./2026-08-08-phase4b-employee-import-api-design.md)
(pattern), plan [pay-run-http-api](../plans/2026-08-08-pay-run-http-api.md).

---

## Invariant

> Neon Auth Bearer JWT + invite-linked `users` row is the only AuthN path.
> Audit `actor` / `created_by` is the resolved `users.email` — never client-supplied.
> UI never authorizes; `PAY_RUN` matrix cells gate every mutation.

---

## 1. Scope

**In**

- `POST /v1/pay-runs` — create run + membership lines
- `POST /v1/pay-runs/:runId/recompute` — recompute all lines
- Auth: existing `/v1` Neon Auth middleware
- AuthZ: `PAY_RUN` + `CREATE` / `UPDATE` via `requirePermission`
- Typed `PayRunError` → `{ code, message }`
- DB API tests with injected JWT verifier

**Out (this slice)**

- Anything under `src/web/**`
- List / get / approve / close / line or PCB edits over these two endpoints
- Findings, gates, payments, transfer HTTP (may exist in other modules)
- New RBAC resources or actions
- Calc engine or trigger changes

---

## 2. HTTP contract

| Method | Path | Behaviour |
|--------|------|-----------|
| `POST` | `/v1/pay-runs` | JSON body → `201` `PayRunMutationEnvelope` (`mutation.kind: CREATE`) |
| `POST` | `/v1/pay-runs/:runId/recompute` | No body → `200` envelope (`mutation.kind: RECOMPUTE` + computed/failures) |

See [phase5a-mutation-envelope-design](./2026-08-08-phase5a-mutation-envelope-design.md).

### Create body

| Field | Required | Notes |
|-------|----------|-------|
| `runId` | yes | Client-supplied primary key |
| `companyId` | yes | AuthZ company context |
| `rulePackId` | yes | Must exist |
| `year` | yes | 2000–2999 |
| `month` | yes | 1–12 |
| `periodStart` / `periodEnd` | yes | ISO dates |
| `workingDays` | yes | positive |
| `paidDays` | no | |
| `onlyEmploymentIds` | no | Off-cycle membership filter |
| `runType` | no | `REGULAR` \| `OFFCYCLE` (default REGULAR) |
| `offcycleReason` | no | Enum; DB enforces OFFCYCLE rules |

Omit `actor` — server sets it from Neon-linked `users.email`.

### Recompute failures

Line validation failures are **not** HTTP errors: response stays `200` with
`failures: [{ lineId, issues }]`, matching `recomputeRun` today.

---

## 3. Authorization

| Endpoint | Check |
|----------|-------|
| Create | `requirePermission(db, userId, "PAY_RUN", "CREATE", companyId)` |
| Recompute | Load run `companyId`; missing → `404 NOT_FOUND`; then `PAY_RUN`/`UPDATE` for that company |

Missing grant → `403 PERMISSION_DENIED`. Run exists but actor lacks UPDATE on its
company → `403` (not `404`).

---

## 4. Service boundaries

- Keep `createRun` / `recomputeRun` as pure orchestration (CLI/tests may call them)
- `createRunForActor` / `recomputeRunForActor` — AuthZ + actor email + error mapping
- Thin route: Zod parse → `*ForActor` → JSON status

---

## 5. Errors

| Code | Status | When |
|------|--------|------|
| `UNAUTHORIZED` | 401 | No/invalid Bearer (existing AuthError) |
| `PERMISSION_DENIED` | 403 | Matrix miss |
| `VALIDATION_ERROR` | 400 | Zod / bad input |
| `NOT_FOUND` | 404 | Unknown run or rule pack |
| `CONFLICT` | 409 | Duplicate `runId` / unique period constraint |

---

## 6. Success criteria

1. SYSTEM_ADMIN (Neon JWT + invite) creates a run → `201`, `created_by` = email.
2. Same principal recomputes → `200` `PayRunMutationEnvelope` with
   `mutation.kind === "RECOMPUTE"` and `mutation.computed` / `mutation.failures`.
3. Invited user without `PAY_RUN` CREATE → `403`.
4. No Authorization → `401`.
5. Unknown `runId` on recompute → `404`.
6. No files under `src/web/**` changed for this slice.
