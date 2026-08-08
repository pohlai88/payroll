# PCB Computerized Engine (2026) — Design

**Date:** 2026-08-08 · **Status:** Implemented (v3.1) · **Slice:** MY-STAT-S07 → S07c

## Frozen sentence

> **Afenda computes PCB offline from the LHDN 2026 computerized specification
> (Normal, Additional, REP, Knowledge Worker, C-Suite, non-resident 30%); the
> HTML calculator is the parity oracle and evidenced override source — never a
> runtime dependency.**

## Scope

| In | Out |
|---|---|
| All five resident formulas + NR 30% | Claiming `LHDN_VERIFIED` |
| Employment tax profile + calendar-year YTD | IRBM filing pack (CP39 / EA) |
| Auto Y1/Yt from line items + `pcb_remuneration_class` | Published P-TEST-2026 answer keys |
| TP1 per-code + combined-envelope caps (items a–q) + child-unit helper | IRBM EA/PCB-II/CP39 filing pack |
| Dual path: compute-first + verified override | Scraping `calcpcbplus` |

S06 PCB pay-item taxonomy shipped in
[transfer-statutory-followups](./2026-08-08-transfer-statutory-followups-design.md)
(`pay_item_pcb_classes`). Still deferred: IRBM filing pack (CP39 text file / EA form).

## Persistence

| Table | Role |
|---|---|
| `employment_tax_profiles` | residence, category, regime, disabled, child units |
| `employment_pcb_ytd` | Y/K/X/Z/∑LP per employment × calendar year |
| `pcb_entries` | override amount + optional y1/yt/kt/lp1 month inputs |

## Dispatch

```
if NON_RESIDENT → 30% of (Y1+Yt)
else if formulaRegime = REP | KNOWLEDGE_WORKER → flat 15% + rebate T
else if formulaRegime = C_SUITE → flat 15% (no rebate)
else if yt/kt present → Additional Remuneration (steps 1–5)
else → Normal Remuneration
```

Payrun: `loadRunForCompute` attaches profile + YTD; compose auto-fills Y1/Yt/K1 when `y1_sen` is null.

## Module layout

- `pcb-core.ts` / `pcb-normal.ts` / `pcb-additional.ts` / `pcb-flat15.ts`
- `pcb-context.ts` / `pcb-children.ts` / `pcb-tp1.ts`
- `pcb.ts` — public API + dual-path resolve + enrich
- `db/seed/pcb-table1-2026.json`, `db/evidence/mtd-testing-question-2026.pdf`

## Verification

- EXHIBIT 5 Normal + Additional vectors in CI
- `P-TEST-2026` hashed; Q1–Q5 need IRBM answers before golden status
- `LHDN_VERIFIED` remains a human IRBM process
