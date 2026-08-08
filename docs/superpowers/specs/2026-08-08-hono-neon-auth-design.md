# Phase 3 — Hono API + Neon Auth (auth platform)

**Date:** 2026-08-08 · **Status:** Implemented (auth platform) · **Scope:** auth platform only

Server-side authentication and invite-gated identity for Clarity Payroll.
Implements README Phase 3 as an **auth platform**, not a payroll business API.
Pay-run / transfer HTTP routes wait until a UI needs them.

Companion: [presentation-facade.md](../../architecture/presentation-facade.md) L4
(server-authoritative API — business mutations arrive later); existing RBAC in
`src/domain/rbac`, `src/service/rbac`, `src/db/schema/rbac.ts`.

---

## 1. Scope

**In scope**

- Node Hono app served by `npm run dev:api` (`src/server/dev-server.ts`)
- Neon Auth Bearer JWT verification (`jose` + JWKS)
- Invite-only mapping from Neon Auth identity → app `users` via `auth_subject`
- `GET /health`, `GET /v1/me`, `GET /v1/me/permissions`
- SYSTEM_ADMIN admin HTTP: invite users, list, set status, assign/revoke roles
- Bootstrap CLI: `scripts/invite-user.ts`
- Design contract for the Phase 4 Vite client (Bearer token usage)

**Out of scope**

- Auth UI / `@neondatabase/neon-js` in the SPA (Phase 4)
- Pay-run, transfer, employment, catalog HTTP routes (later, with screens)
- Findings, gates, revision hashes (Phase 6)
- Vercel adapter / serverless packaging (Phase 9)
- Neon Data API / Postgres RLS as the application API
- Requiring JWT `emailVerified` (deferred hardening; see §3)
- Counting “last remaining SYSTEM_ADMIN” (CLI recovers lockout)

---

## 2. Architecture

```
Neon Auth (Better Auth, already provisioned)
    │  authClient.token() → JWT (EdDSA, ~15 min)
    ▼
Hono (Node :8787)
    │  Authorization: Bearer <jwt>
    ├─ jose verify (JWKS, iss, aud)
    ├─ invite-only resolve → users.auth_subject
    └─ routes: /health | /v1/me* | /v1/admin/*
            │
            ▼
Postgres — existing RBAC tables + users.auth_subject
```

- **One DB client:** existing `drizzle-orm/node-postgres` + `pg.Pool` (`src/db/client.ts`).
  No edge/serverless driver in this phase.
- **Sessions stay with Neon Auth.** The API does not set session cookies; it only
  accepts Bearer JWTs so a Vite origin can call a separate API origin.
- **App authorization stays in RBAC.** Neon Auth proves identity; `roles` /
  `role_permissions` / `user_role_assignments` decide what the user may do.

---

## 3. Identity model

### 3.1 `users.auth_subject`

New nullable unique column on `users`:

- Stores Neon Auth user id (`sub` from the JWT)
- Null until first successful authenticated request after invite
- Postgres UNIQUE allows multiple NULLs

Emails stored and matched as `trim` + lowercase (`normalizeEmail`).

### 3.2 Invite-only resolve

On each authenticated request, after JWT verify:

1. Lookup by `auth_subject = sub` → if found, require `ACTIVE`, done
2. Else lookup by normalized email → none → `403 INVITE_REQUIRED` (never auto-create)
3. If row has a different non-null `auth_subject` → `403 AUTH_SUBJECT_CONFLICT`
4. Else link `auth_subject` in a short transaction; on unique violation, re-read
   and continue (concurrent first login)
5. `DISABLED` → `403 USER_DISABLED`

### 3.3 JWT verification

- Header: `Authorization: Bearer <token>`
- JWKS: `NEON_AUTH_JWKS_URL` (or derived from `NEON_AUTH_BASE_URL`)
- Algorithm: EdDSA
- `iss` and `aud` = `new URL(NEON_AUTH_BASE_URL).origin`
- Require claims: `sub` (or `id`), `email`
- Reject when `banned === true`
- **Do not** require `emailVerified` in Phase 3 — invite list is the gate.
  Enabling Neon email verification is a later prod hardening step (Phase 4 checklist).

### 3.4 Provisioning

1. **CLI bootstrap** (no JWT):  
   `tsx scripts/invite-user.ts --email a@b.com --name "Ada" --system-admin`  
   Creates the `users` row if needed and assigns seeded `SYSTEM_ADMIN`.
2. **Admin HTTP** (SYSTEM_ADMIN + JWT): day-to-day invites and role changes.
3. Invitee signs up / signs in via Neon Auth with the **same email**, then calls
   the API; first call stamps `auth_subject`.

Neon Auth may still allow open sign-up at the IdP; uninvited Neon accounts cannot
use this API.

---

## 4. HTTP surface

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/health` | none | `{ ok: true }` |
| `GET` | `/v1/me` | JWT + invite | `{ id, email, name, status }` |
| `GET` | `/v1/me/permissions?companyId=` | JWT + invite | matrix with actions as string arrays |
| `POST` | `/v1/admin/users` | SYSTEM_ADMIN | invite `{ email, name, roleCode?, companyId? }` |
| `GET` | `/v1/admin/users` | SYSTEM_ADMIN | list users (no secrets) |
| `PATCH` | `/v1/admin/users/:userId` | SYSTEM_ADMIN | `{ status: ACTIVE \| DISABLED }` |
| `POST` | `/v1/admin/users/:userId/roles` | SYSTEM_ADMIN | `{ roleCode, companyId? }` |
| `DELETE` | `/v1/admin/users/:userId/roles` | SYSTEM_ADMIN | body `{ roleCode, companyId? }` |

CORS: allow `CORS_ORIGIN` (default `http://localhost:5173`) for the future SPA.

### 4.1 Self-lockout

- Refuse disabling **yourself**
- Refuse revoking **your own** `SYSTEM_ADMIN` assignment
- No global “last admin” check — CLI can re-invite

### 4.2 Error body

`{ "code": string, "message": string }`

| Situation | Status | code |
|---|---|---|
| Missing / invalid JWT | 401 | `UNAUTHORIZED` |
| Not invited | 403 | `INVITE_REQUIRED` |
| Subject conflict | 403 | `AUTH_SUBJECT_CONFLICT` |
| Banned in JWT | 403 | `AUTH_BANNED` |
| App user disabled | 403 | `USER_DISABLED` |
| RBAC deny | 403 | `PERMISSION_DENIED` |
| Zod / bad input | 400 | `VALIDATION_ERROR` |
| Duplicate email | 409 | `CONFLICT` |

---

## 5. Modules

| Unit | Responsibility |
|---|---|
| `src/server/env.ts` | Require `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL`; optional `PORT`, `CORS_ORIGIN` |
| `src/server/auth/jwt.ts` | JWKS verify + claim parse (injectable for tests) |
| `src/server/auth/resolve-user.ts` | Invite-only link / load |
| `src/server/auth/middleware.ts` | Bearer → `c.set('user', UserRow)` |
| `src/server/errors.ts` | Domain/auth errors → HTTP |
| `src/server/app.ts` | `createApp({ db, verifyJwt })` |
| `src/server/dev-server.ts` | Pool + listen |
| `src/server/routes/*` | Thin handlers |
| `src/service/admin-users.ts` | Invite / list / status / roles + self-lockout |
| `src/service/rbac.ts` | Add `requireSystemAdmin` |
| `src/repo/rbac.ts` | `auth_subject` helpers, `listUsers`, email normalize on create |
| `scripts/invite-user.ts` | Bootstrap SYSTEM_ADMIN |

Domain/calc remains DB-free. Server may import service / repo / db only.

---

## 6. Testing

- **Domain:** claim parsing, `normalizeEmail`, error classification (no network)
- **DB:** `auth_subject` unique, link helpers, resolve paths including conflict / disabled
- **Server:** Hono `app.request` with injected `verifyJwt` (no real Neon). Own Vitest
  project `server` with `maxWorkers: 1` (Vitest 4 multi-project constraint)

---

## 7. Phase 4 client contract

Not built here; documented so the SPA can attach without redesign:

```ts
import { createAuthClient } from "@neondatabase/neon-js/auth";

export const authClient = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL, {
  fetchOptions: { credentials: "include" },
});

const { data, error } = await authClient.token();
if (error || !data?.token) throw error ?? new Error("no token");

await fetch(`${import.meta.env.VITE_API_BASE}/v1/me`, {
  headers: { Authorization: `Bearer ${data.token}` },
});
```

- Refresh token on API `401` (JWT ~15 minutes)
- Register the Vite origin as a Neon Auth trusted origin when the SPA lands
- Optional later: enable Neon email verification and then require `emailVerified`

---

## 8. Env keys (names only)

- `DATABASE_URL`
- `NEON_AUTH_BASE_URL`
- `NEON_AUTH_JWKS_URL`
- `PORT` (optional, default `8787`)
- `CORS_ORIGIN` (optional, default `http://localhost:5173`)

`NEON_AUTH_COOKIE_SECRET` may exist for Neon tooling; the Hono API does not use it
for Bearer verification.

---

## 9. Success criteria

1. Uninvited Neon user → `403 INVITE_REQUIRED` on `/v1/me`
2. CLI-invited user with valid JWT → `200` on `/v1/me` and `auth_subject` set
3. Non-admin → `403` on `/v1/admin/*`; SYSTEM_ADMIN can invite and assign roles
4. `npm run dev:api` serves `/health` without a JWT
5. No pay-run/transfer routes exist in this phase
