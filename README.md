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
| Active plans | recent `docs/superpowers/plans/` for unfinished work | Phase 8 reports / bilingual payslip / run-diff UI and Phase 9 Vercel deploy are open; 4C, 5B, and 6–7 plans are complete |
| Historical / archive | Plan1 control-foundation plans & handoff; `c:\JackProject\_payroll-v1-backup` | Prior SQLite/Next rebuild — not current authority |
| Design system (Phase 4+) | `docs/palette/` + `src/web/styles.css` | Straits colour/grid/print contracts; 4C projects tokens into the Vite SPA |

| Phase | State |
|---|---|
| 0 · Scaffold + carried engine, golden master green | done |
| 1 · Derivation graph engine | done |
| 2 · Neon Postgres schema, plpgsql triggers, seed, Docker | done |
| 3 · Hono API + Neon Auth (auth platform) | done |
| 4 · Vite SPA shell | 4A auth + 4B import + 4C design-system foundation done |
| 5 · Payroll UI + derivation drawer | 5A mutation envelope done; **5B payroll workspace SPA done** — company scope shell, pay-run list, workspace (totals strip, employee grid, slide-over, print preview), employees page, read-facade routes |
| 6 · Findings, gates, approval | done (API/service; SPA wiring Phase 6+) |
| 7 · Release, payments, closure, R2 artifacts | done (backend + Hono; SPA wiring later) |
| 8 · Import, reports, bilingual payslip, run diff | create-only import done (4B); reports / bilingual payslip / run-diff UI pending |
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

Pay-run business HTTP (Neon Auth + `PAY_RUN`): create/recompute/review/approve
and related control routes. Mutation success bodies use the Phase 5A
`PayRunMutationEnvelope` (run snapshot + findings/gate counters; no line roots).
Specs: `docs/superpowers/specs/2026-08-08-pay-run-http-api-design.md`,
`docs/superpowers/specs/2026-08-08-phase5a-mutation-envelope-design.md`.

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
Auth-consuming shell under `src/web/`: Neon Auth → Bearer → `/v1/me` +
permissions + conditional read-only admin users.

Phase 4B: auth-gated create-only employee import —
`GET/POST /v1/employee-import*` (`EMPLOYMENT`/`CREATE`) and a thin SPA panel.
Spec: `docs/superpowers/specs/2026-08-08-phase4b-employee-import-api-design.md`.
CLI import/template scripts remain available.

Phase 4C: Straits / shadcn design-system foundation on the Vite SPA —
Tailwind v4, Studio-selected primitives under `src/components/ui`, Straits
tokens in `src/web/styles.css`, restyled 4A/4B surfaces only. No product chrome
or Phase 5 payroll UI. Spec:
`docs/superpowers/specs/2026-08-08-phase4c-straits-shadcn-design.md`.

Phase 5B: full payroll workspace SPA. Preflight plan added the missing server
read-facade routes (`GET /v1/pay-runs`, `GET /v1/pay-runs/:id/workspace`,
`GET /v1/employees`, `GET /v1/me` extended with `companies[]`). SPA plan built
the complete product UI: company-first scope shell (sidebar + top bar +
⌘K command palette), pay-run list, workspace screen (totals strip with
server-computed variance, employee grid with Earning/Deduction/Employer/Summary
section tints, employee slide-over with Line / Derivation / Payslip-preview
tabs), and the employees roster page with import panel. All money flows through
`MoneyCell`; variance through server-owned `VarianceDto` rendered by `DeltaBadge`
with neutral directional ink; action buttons gated by server-returned
`actionAvailability`; PCB read-only. Specs:
`docs/superpowers/specs/2026-08-08-phase5b-payroll-ui-shell-workspace-design.md`,
`docs/superpowers/plans/2026-08-08-phase5b-preflight.md`,
`docs/superpowers/plans/2026-08-08-phase5b-spa.md`.

Phase 6: findings, gates, and `DRAFT → REVIEWED → APPROVED` control layer
(API/service only). Spec:
`docs/superpowers/specs/2026-08-08-phase6-findings-gates-approval-design.md`.

Phase 7: payments, release, distribution, reconciliation, closure manifest, and
R2 artifact store over Hono (`PAY_RUN`). No SPA. Spec:
`docs/superpowers/specs/2026-08-08-phase6-7-control-backend-design.md`.

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
