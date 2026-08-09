# Clarity Payroll

A Malaysian payroll system where **every figure explains itself**. Any number on any
screen drills recursively to the exact statutory table row that produced it, with the
issuing document, its URL and its SHA-256 — ending only at a raw input (with who
entered it and when) or a cited source. Nothing is hidden.

## Status

Rebuilt from scratch. Documentation roles:

| Kind | Where | Role |
|---|---|---|
| Authoritative doctrine / current architecture | `docs/architecture/` (`payroll-architecture.md`, `presentation-facade.md`, payslip docs) | What exists in `src/` / `db/` and what the UI may rely on |
| Living implementation / status | this README; approved specs under `docs/superpowers/specs/` for shipped slices | Phase table, how to run, feature contracts |
| Active plans | recent `docs/superpowers/plans/` for unfinished work | **Phase 9 Vercel deploy is the only open item.** All prior phases (4C, 5B, 5C, 6–7, 8A, 8B, 8C, deferred cleanup, marketing landing redesign) are complete. |
| Historical / archive | Plan1 control-foundation plans & handoff; `c:\JackProject\_payroll-v1-backup` | Prior SQLite/Next rebuild — not current authority |
| Design system (Phase 4+) | stock `src/web/shadcn.css` + `payslip-print.css` | Default shadcn theme; `--doc-*` light print tokens only |

| Phase | State |
|---|---|
| 0 · Scaffold + carried engine, golden master green | done |
| 1 · Derivation graph engine | done |
| 2 · Neon Postgres schema, plpgsql triggers, seed, Docker | done |
| 3 · Hono API + Neon Auth (auth platform) | done |
| 4 · Vite SPA shell | done |
| 5 · Payroll UI + derivation drawer | done |
| 6 · Findings, gates, approval | done |
| 7 · Release, payments, closure, R2 artifacts | done |
| 8 · Import, reports, bilingual payslip, run diff | done |
| — · Marketing landing page | done |
| 9 · Vercel deploy | **pending** — `src/` is production-ready; Phase 9 wires environment variables, sets `vercel.json` build/output config, and ships to Vercel |

Phase 9 — Vercel deploy: remaining work is `vercel.json` output config, environment variable
wiring (`DATABASE_URL`, `NEON_AUTH_*`, `VITE_NEON_AUTH_URL`, `VITE_API_BASE`, `R2_*`,
`TSA_URL`), Hono server entry-point for Vercel Functions, and a smoke-test deploy.
All application code in `src/` is production-ready.

## The closure chain

`closeRun` seals a `manifest.json` carrying every artifact's SHA-256, then — in
the same transaction, so a CLOSED run without one is unreachable — issues a
**closure seal**: a SHA-256 over the manifest hash, the revisions, who closed
the run and when, and the seal hash of the previous closure *in the same
company*. Nobody outside this system signs it. What it buys is detectability:
revising a closed run's facts means reissuing its seal and every seal closed
after it, and `closure_seals` refuses UPDATE and DELETE outright (migration
0024).

`verifyClosureChain()` walks a company's chain and re-derives everything rather
than trusting the row: each seal is recomputed from its own columns, each link
is checked against its predecessor, and the run and manifest artifact are
re-read and compared. Drift is reported per seal in plain words — "closedBy on
the run differs from the seal" — because a chain that only says "broken" tells
an auditor nothing. The canonical form is pinned byte-for-byte by
`tests/domain/closure-seal.test.ts`; the chain and the append-only guarantee by
`tests/db/closure-seal.test.ts`.

The SPA surfaces this: the workspace has a **Closure seal** panel with both
verdicts kept apart (this seal recomputes / the chain is intact), the artifacts
panel shows each SHA-256 with copy-to-clipboard, the closure dialog reports the
seal it just issued, and `/control` badges closed runs with their chain
position.

### Optional third-party countersignature (RFC 3161)

Off unless a client asks for it. When `TSA_URL` is set, the manifest's own
SHA-256 is also sent to a Time Stamp Authority and the whole reply is stored as
a `TIMESTAMP_TOKEN` artifact (`manifest.json.tsr`), with the authority, its
`genTime`, the token serial and the stamped hash written to `audit_events` as
`TIMESTAMP_MANIFEST`. Verify a stored token with
`openssl ts -verify -data manifest.json -in manifest.json.tsr`. The seal panel
shows the setting and what to set it to when it is off.

Deliberate properties, all covered by `tests/db/manifest-timestamp.test.ts`:

- **Never blocks closure.** An unreachable authority leaves the run CLOSED and
  unstamped; `timestampClosureManifest()` is the idempotent retry.
- **Off by default.** No `TSA_URL`, no network call — tests and local work never
  reach a third party.
- **One carve-out in the freeze.** Migration 0023 lets a `TIMESTAMP_TOKEN`
  INSERT land on a CLOSED run, because a token attests to already-frozen bytes
  and may have to be obtained later. Every other artifact write stays refused.
- **Not signature verification.** `src/domain/timestamp/` builds the request and
  reads the reply, checking the imprint and nonce are ours. It does not verify
  the authority's signature or chain; the stored bytes are what a verifier reads.

DigiCert's free endpoint is audited but is **not** a recognised date/time stamp
service under the Digital Signature Act 1997. Only the MCMC's list (currently
Pos Digicert and MSC Trustgate) carries the s.62 presumption that a signature
existed before it was stamped. Moving to one is a `TSA_URL` change.

## Development

### Finding a feature slice (file headers)

Feature-owned files carry greppable `@feature` / `@layer` tags; API hubs add `@chain`. Spec: [`docs/superpowers/specs/2026-08-09-file-header-surface-envelope-design.md`](docs/superpowers/specs/2026-08-09-file-header-surface-envelope-design.md). Agent guide: [`.cursor/skills/vite-fullstack/references/file-headers.md`](.cursor/skills/vite-fullstack/references/file-headers.md).

```bash
rg "@feature companies" src tests   # vertical slice
rg "@feature marketing" src         # landing (hub: src/marketing/landing.tsx)
rg "@layer route" src/server/routes
rg "@chain" src                     # API hubs + marketing landing hub

# find files still missing tags (should be empty under src/tests/scripts)
rg -L --glob '*.ts' --glob '*.tsx' --glob '!**/vite-env.d.ts' '@feature ' src tests scripts
```

Inventory / orphans still live in the vite-fullstack [feature-surface-map](.cursor/skills/vite-fullstack/references/feature-surface-map.md).

### Developer Login

For quick access during development, the login page includes a "Developer Login" button
that uses pre-configured credentials from environment variables. The bootstrap always
assigns **SYSTEM_ADMIN** (full permissions). See
[docs/developer-login.md](docs/developer-login.md) for setup instructions.

Quick setup (order matters — seed the `SYSTEM_ADMIN` role before inviting the
developer user):

```bash
# 1) Migrations + seed (creates roles.SYSTEM_ADMIN among other seed data)
npm run db:migrate
npm run db:seed

# 2) Neon Auth user + app SYSTEM_ADMIN invite (password ≥ 8)
npm run setup:dev-user -- \
  --email dev@example.com --name "Dev User" --password 'dev123456'

# Paste printed VITE_DEV_* into .env.local, then:
npm run auth:smoke
npm run dev
npm run dev:api
```

## The golden master

`tests/golden/july-2026-afenda.test.ts` reproduces the verified July 2026 DLBB payroll
run — 37 real employees — and asserts every statutory figure **to the sen**:

| | |
|---|---|
| Gross | RM 176,930.00 |
| Net | RM 155,609.55 |
| EPF employee | RM 19,210.00 |
| SOCSO employee | RM 1,822.05 |
| EIS employee | RM 288.40 |

**If it fails, the engine changed behaviour — do not ship, and never update the
fixture to match.** It is the only proof the calculations are correct.

```bash
npm test
```

## Cloudflare R2 (artifacts)

Pay-run artifact bytes use R2 when all `R2_*` env vars are set; otherwise LocalFs
under `data/artifacts/` (local/dev only). `NODE_ENV=production` requires full
`R2_*` — the API refuses to start on LocalFs in production. Attached uploads are
capped at 10 MiB. Bucket + Wrangler config:

| | |
|---|---|
| Bucket | `clarity-payroll-artifacts` (APAC, Standard) |
| Config | `wrangler.jsonc` |
| Runtime | S3 API via `src/domain/artifacts/r2-store.ts` (Node Hono, not Workers) |

```bash
npm run r2:list
npm run r2:info
# Create (idempotent only if missing — already provisioned for this account):
# npm run r2:create
```

Then create an **R2 API token** (Object Read & Write on that bucket) in the
Cloudflare dashboard and paste `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` into
`.env.local` with the account id and endpoint from `.env.example`.

Five things survived the rebuild because they are *verified data*, not code:

- `src/domain/calc/` — the pure statutory engine (zero DB imports)
- `src/domain/money.ts` — the single authority on Malaysian rounding
- `src/domain/ic.ts` — NRIC → date-of-birth and age derivation
- `db/seed/` — EPF Third Schedule Parts A/C/E, SOCSO + SKBBK, EIS bands, and the
  rule pack's 8 official sources with issuer, URL, retrieval date and SHA-256
- `tests/golden/` — the fixture above

## Money

All money is **integer sen**. There are no floats and no decimals in storage.
Rounding lives in exactly one place, `src/domain/money.ts`:

- `roundHalfUpSen` — half up to the sen
- `mulDivSen` — proration, half up to the sen
- `pctRoundUpToRinggitSen` — KWSP above-ceiling rule: round **up** to the whole ringgit
- `roundBps` — basis-point variance: `(delta / previous) × 10 000`, null when previous is zero

## PCB / MTD is never calculated

Monthly tax deduction is a controlled external input, recorded with its source and
evidence reference. When it has not been entered, net pay is **unknown** — rendered
as an em dash, never as zero.

## Prior art

The previous implementation (Next.js + SQLite, 31 commits) is preserved at
`c:\JackProject\_payroll-v1-backup` as a git bundle and a tree archive.
