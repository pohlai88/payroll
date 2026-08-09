# Developer Login

One-click Neon Auth sign-in for local development as **SYSTEM_ADMIN** (full
permissions). Production must not set `VITE_DEV_EMAIL` / `VITE_DEV_PASSWORD`.

## Setup (end-to-end)

Requires `.env.local` with `DATABASE_URL`, `NEON_AUTH_BASE_URL`, and Vite auth
URLs (see `.env.example`). Register `http://localhost:5173` as a Neon Auth
trusted origin.

**Order:** run `npm run db:seed` first so the `SYSTEM_ADMIN` role exists; then
`setup:dev-user` (invite fails if the role is missing).

```bash
# 1) Seed RBAC role (and catalog) — required before invite
npm run db:migrate   # if migrations are not yet applied
npm run db:seed

# 2) Explicit credentials (always assigns SYSTEM_ADMIN):
npm run setup:dev-user -- --email dev@example.com --name "Dev User" --password 'dev123456'

# Or, after VITE_DEV_* are already in .env.local, upgrade / re-bootstrap:
npm run setup:dev-user
```

This:

1. Creates (or verifies) the Neon Auth email/password user
2. Invites the matching app `users` row and **always** assigns `SYSTEM_ADMIN`
   (full RBAC bypass / full permission matrix)
3. Prints the `VITE_DEV_*` lines to paste into `.env.local`

`--system-admin` is accepted as a no-op for older docs/commands.

Neon Auth rejects passwords shorter than **8** characters (Better Auth default).
A short password surfaces as `Invalid email or password`.

Then restart Vite (`npm run dev`) and run the API (`npm run dev:api`).

Smoke the IdP → JWT → `/v1/me` → full `/v1/me/permissions` matrix:

```bash
npm run auth:smoke
```

## Usage

1. Open `http://localhost:5173`
2. Click **Developer Login** (only shown when both `VITE_DEV_*` vars are set)

## Invite-only app gate

Neon Auth proving identity is not enough. The Hono API resolves invite-only via
`users.auth_subject` / email (see Phase 3 design). Uninvited Neon accounts get
`403 INVITE_REQUIRED` on `/v1/me`. Day-to-day invites (ops; not auto-admin):

```bash
npx tsx scripts/invite-user.ts --email a@b.com --name "Ada" --system-admin
# or company-scoped:
npx tsx scripts/invite-user.ts --email a@b.com --name "Ada" --role PAYROLL_OPS --company-id <uuid>
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `VITE_NEON_AUTH_URL is not set` | Missing Vite env; copy `.env.example` → `.env.local` and restart Vite |
| `Invalid email or password` | Wrong password, password &lt; 8 chars, or Neon Auth user never created |
| `INVITE_REQUIRED` | Neon Auth ok, but no app `users` row for that email — run `npm run setup:dev-user` |
| `permissions incomplete` from smoke | App user exists but is not SYSTEM_ADMIN — re-run `npm run setup:dev-user` |
| Developer Login button missing | `VITE_DEV_EMAIL` / `VITE_DEV_PASSWORD` unset (intentional) |
| `AUTH_SUBJECT_CONFLICT` | Same email linked to a different Neon Auth `sub` |

## Security

- Local development only
- Do not commit `.env.local`
- Do not ship `VITE_DEV_*` to production builds
