# Phase 4A — Auth-consuming application shell

**Date:** 2026-08-08 · **Status:** Implemented · **Scope:** thin SPA consumer of frozen Phase 3 auth

Proves the Phase 3 Hono + Neon Auth platform from a real browser client without
payroll-domain complexity, dashboard work, or new authorization architecture.

Companion: [hono-neon-auth-design](./2026-08-08-hono-neon-auth-design.md) (frozen),
[presentation-facade](../../architecture/presentation-facade.md) L4/L5.

---

## Invariant

> The browser may use server authority to decide what to present, but it never
> becomes the authority.

---

## 1. Scope

**In scope**

- Scaffold Vite + React SPA under `src/web/` (none exists today)
- Neon Auth client (`@neondatabase/neon-js/auth`) for sign-in / session / sign-out
- Bearer-only business API client against `VITE_API_BASE`
- `GET /v1/me`, `GET /v1/me/permissions`
- Conditional read-only `GET /v1/admin/users` when presentation predicate says System Admin
- Sign-out and principal-change state clearing
- Deterministic UX for unauthenticated, forbidden, expired session, and API `{ code, message }`
- Env placeholders: `VITE_NEON_AUTH_URL`, `VITE_API_BASE`
- Ops note: register Vite origin as Neon Auth trusted origin

**Out of scope (frozen)**

- Payroll mutations, employee import APIs/UI
- Invite / edit / role assign / deactivate / delete on users
- Role-management architecture or new auth semantics
  (including richer `requireSystemAdmin` error codes)
- Straits palette / shadcn-studio shell / dashboard redesign
- Cookie authentication to the business API
- Mock/bypass of the production API client path
- Pagination architecture for admin users (endpoint is a flat list)

**After 4A passes:** freeze this shell foundation; next vertical is employee-master
import (not more frontend infrastructure).

---

## 2. Architecture

```
Vite SPA (src/web)
  → Neon Auth SDK (owns its session/cookie mechanics for the Auth URL)
  → authClient.token() → raw JWT
  → business API client (Bearer only — no credentials: 'include' on VITE_API_BASE)
      ├─ GET /v1/me
      ├─ GET /v1/me/permissions
      └─ if presentation says SYSTEM_ADMIN
            → GET /v1/admin/users (read-only list)
  → sign-out / expiry / principal change
      → clear all auth-derived application state before next render
```

Phase 3 API remains the sole authorization and identity authority for business data.

---

## 3. Token acquisition (not “refresh”)

Neon Auth exposes `authClient.token()` for the raw JWT used as a Bearer token.
Phase 4A does **not** depend on how Neon internally refreshes sessions.

**API client contract**

```text
request
  → authClient.token()
  → Authorization: Bearer <token>
  → API

on 401:
  → authClient.token() again
  → retry original request exactly once
  → second 401 or token acquisition failure
      → clear authenticated application state
      → sign out
      → deterministic "session expired" state
```

---

## 4. Cookies vs Bearer

- Neon Auth SDK may use credentials/cookies against `VITE_NEON_AUTH_URL` as the
  SDK requires — that is Auth-endpoint behaviour, not business-API behaviour.
- Calls to `VITE_API_BASE` use **Bearer only**. Do not set
  `credentials: 'include'` on the business API client.
- One clear API authority:

```text
Browser → API
Authorization: Bearer <JWT>
```

Avoid `Bearer + ambient cookies` ambiguity on the payroll API.

---

## 5. SYSTEM_ADMIN presentation predicate

Derived **only** from server-returned `/v1/me/permissions`:

```ts
isSystemAdminPresentation =
  every PERMISSION_RESOURCES × PERMISSION_ACTIONS is present
```

Rules:

- Derive the expected full matrix from the **canonical**
  `PERMISSION_RESOURCES` / `PERMISSION_ACTIONS` definitions shared with the
  domain (import from `@/domain/rbac/types` or a tiny shared module the web
  bundle can import — do not hand-maintain a second list in React).
- This is a **UI presentation predicate**. It grants no authority and is not an
  authorization mechanism.
- Render the admin users list only when the predicate is true.
- The API still enforces authorization on every `/v1/admin/users` call.

Decisive acceptance test (independent of UI hide/show):

```text
non-admin
  → directly GET /v1/admin/users with a valid Bearer token
  → 403 PERMISSION_DENIED
```

---

## 6. Admin users list rules

- Read-only table/list of id / email / name / status / authSubject (as returned)
- No invite, edit, role assignment, deactivate, or delete
- No pagination UI unless the endpoint later requires it (today it does not)

---

## 7. Principal-change hygiene

> No authenticated server data survives principal change.

On logout, session expiry, or signing in as another user, clear before rendering
the new principal:

- `/v1/me` payload
- permissions payload
- admin users list
- company-context query state (if any)

---

## 8. Modules

| Unit | Responsibility |
|---|---|
| `vite.config.ts` | React SPA; `@` alias; do not break Vitest domain/db projects |
| `index.html` + `src/web/main.tsx` | Entry |
| `src/web/auth/client.ts` | `createAuthClient(VITE_NEON_AUTH_URL)` |
| `src/web/api/client.ts` | Bearer fetch; re-acquire token once on 401; map `{ code, message }` |
| `src/web/auth/is-system-admin.ts` | Presentation predicate from canonical resource/action lists |
| `src/web/app.tsx` (or thin screen components) | Sign-in · shell · identity · permissions · conditional users · sign-out |
| `.env.example` | Add `VITE_NEON_AUTH_URL`, `VITE_API_BASE` (placeholders only) |

UI is intentionally boring: no dashboard chrome, no Straits token wiring in 4A.

---

## 9. UX states

| State | Behaviour |
|---|---|
| Signed out | Sign-in form (email/password via Neon Auth SDK) |
| Loading | Session / first `/me` in progress |
| Signed in | Identity + permissions matrix from server |
| System Admin presentation | Plus read-only users list |
| Unauthenticated API | Prompt sign-in |
| Forbidden | Show server `code` / `message` (e.g. `INVITE_REQUIRED`, `PERMISSION_DENIED`) |
| Session expired | After failed re-acquire + retry; signed out; clear state |
| Other API errors | Surface `{ code, message }` without inventing permissions |

---

## 10. Acceptance criteria (architectural)

1. Sign-in works from the real Neon Auth client.
2. `authClient.token()` acquisition works; business calls send Bearer only.
3. Unauthenticated API calls fail correctly (`401`).
4. `/v1/me` returns the authenticated principal.
5. `/v1/me/permissions` is rendered from server data; UI does not invent grants.
6. Logout clears auth-derived application state.
7. Expired/invalid tokens follow the re-acquire-once then session-expired path.
8. API errors cross the presentation boundary as `{ code, message }`.
9. Production API client path is used — no mock bypass.
10. Non-admin direct `GET /v1/admin/users` → `403 PERMISSION_DENIED`.
11. Admin presentation shows read-only list; no mutation controls.
12. No authenticated server data survives principal change.

---

## 11. Ops

- Add the Vite origin (e.g. `http://localhost:5173`) to Neon Auth trusted origins
  so cross-origin `authClient.token()` can succeed.
- Ensure API `CORS_ORIGIN` matches that origin (Phase 3 default already does).

---

## 12. Success definition

Phase 4A is done when the criteria in §10 pass against a running `dev:api` +
`npm run dev` pair with real Neon Auth (invite-only app user for happy path).
Then freeze the shell and move to employee-master import — not more SPA
infrastructure.
