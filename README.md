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
| Active plans | recent `docs/superpowers/plans/` for unfinished work | Implementation task lists still in flight (Phase 2 closeout + employee master import plans are complete) |
| Historical / archive | Plan1 control-foundation plans & handoff; `c:\JackProject\_payroll-v1-backup` | Prior SQLite/Next rebuild — not current authority |
| Design system (Phase 4+) | `docs/palette/` | Colour, grid, print contracts — not runtime truth for Phase 3 |

| Phase | State |
|---|---|
| 0 · Scaffold + carried engine, golden master green | done |
| 1 · Derivation graph engine | done |
| 2 · Neon Postgres schema, plpgsql triggers, seed, Docker | done |
| 3 · Hono API + Neon Auth (auth platform) | done |
| 4 · Vite SPA shell | 4A auth + 4B import + 4C design-system foundation done; product chrome / Phase 5 payroll UI pending |
| 5 · Payroll UI + derivation drawer | pending |
| 6 · Findings, gates, approval | control layer landed — see `phase6-findings-gates-approval-design` |
| 7 · Release, payments, closure, R2 artifacts | backend done (R2 + Hono; SPA wiring later) |
| 8 · Import, reports, bilingual payslip, run diff | pending |
| 9 · Vercel deploy | pending |

Phase 2 closed: Docker/Neon Postgres via one `pg` driver, Drizzle schema and
plpgsql triggers, content-hashed seed, repository/service layers, golden
parity, statutory authority governance, RBAC, internal group transfer, and
create-only employee master import. See
`docs/superpowers/specs/2026-08-08-phase2-persistence-design.md` and
`docs/superpowers/plans/2026-08-08-phase2-persistence.md`.

Transfer / statutory follow-ups (artifacts evidence, §8.6 transfer findings,
S06 wage treatments + PCB Y1/Yt class):
`docs/superpowers/specs/2026-08-08-transfer-statutory-followups-design.md`.

Phase 3 auth platform is built: Hono verifies Neon Auth Bearer JWTs, invite-only
links `users.auth_subject`, exposes `/health`, `/v1/me*`, and SYSTEM_ADMIN
`/v1/admin/users*`. Design:
`docs/superpowers/specs/2026-08-08-hono-neon-auth-design.md`.
`dev:api` and `invite-user` load `.env.local` when present (see `.env.example`).

Pay-run business HTTP (Neon Auth + `PAY_RUN`): `POST /v1/pay-runs` (create) and
`POST /v1/pay-runs/:runId/recompute`. No SPA client in this slice. Spec:
`docs/superpowers/specs/2026-08-08-pay-run-http-api-design.md`.

```bash
# API (DATABASE_URL + NEON_AUTH_* from .env.local or the environment)
npm run dev:api

# Bootstrap first System Admin (no JWT)
npx tsx scripts/invite-user.ts --email you@example.com --name "You" --system-admin

# Phase 4A auth-consuming shell (needs VITE_NEON_AUTH_URL + VITE_API_BASE)
npm run dev
```

Phase 4A design:
`docs/superpowers/specs/2026-08-08-phase4a-auth-shell-design.md`.
Boring shell under `src/web/`: Neon Auth → Bearer → `/v1/me` + permissions +
conditional read-only admin users. Not the Straits/shadcn product UI.

Phase 4B: auth-gated create-only employee import —
`GET/POST /v1/employee-import*` (`EMPLOYMENT`/`CREATE`) and a thin SPA panel.
Spec: `docs/superpowers/specs/2026-08-08-phase4b-employee-import-api-design.md`.
CLI import/template scripts remain available.

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

## Carried assets

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

## PCB / MTD is never calculated

Monthly tax deduction is a controlled external input, recorded with its source and
evidence reference. When it has not been entered, net pay is **unknown** — rendered
as an em dash, never as zero.

## Prior art

The previous implementation (Next.js + SQLite, 31 commits) is preserved at
`c:\JackProject\_payroll-v1-backup` as a git bundle and a tree archive.
