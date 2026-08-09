# Developer Login

One-click Neon Auth sign-in for local development. Production must not set
`VITE_DEV_EMAIL` / `VITE_DEV_PASSWORD`.

## Setup (end-to-end)

Requires `.env.local` with `DATABASE_URL`, `NEON_AUTH_BASE_URL`, and Vite auth
URLs (see `.env.example`). Register `http://localhost:5173` as a Neon Auth
trusted origin.

```bash
npx tsx scripts/setup-dev-user.ts \
  --email dev@example.com \
  --name "Dev User" \
  --password 'dev123456' \
  --system-admin
```

This:

1. Creates (or verifies) the Neon Auth email/password user
2. Invites the matching app `users` row and assigns `SYSTEM_ADMIN`
3. Prints the `VITE_DEV_*` lines to paste into `.env.local`

Neon Auth rejects passwords shorter than **8** characters (Better Auth default).
A short password surfaces as `Invalid email or password`.

Then restart Vite (`npm run dev`) and run the API (`npm run dev:api`).

Smoke the IdP → JWT → `/v1/me` path:

```bash
npx tsx scripts/smoke-auth.ts
```

## Usage

1. Open `http://localhost:5173`
2. Click **Developer Login** (only shown when both `VITE_DEV_*` vars are set)

## Invite-only app gate

Neon Auth proving identity is not enough. The Hono API resolves invite-only via
`users.auth_subject` / email (see Phase 3 design). Uninvited Neon accounts get
`403 INVITE_REQUIRED` on `/v1/me`. Day-to-day invites:

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
| `INVITE_REQUIRED` | Neon Auth ok, but no app `users` row for that email — run invite/setup |
| Developer Login button missing | `VITE_DEV_EMAIL` / `VITE_DEV_PASSWORD` unset (intentional) |
| `AUTH_SUBJECT_CONFLICT` | Same email linked to a different Neon Auth `sub` |

## Security

- Local development only
- Do not commit `.env.local`
- Do not ship `VITE_DEV_*` to production builds
