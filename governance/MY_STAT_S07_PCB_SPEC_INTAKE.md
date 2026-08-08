# MY-STAT-S07 — PCB/MTD LHDN Specification Intake

**Status:** **Decision B-v2** — Full computerized formula set (Normal, Additional,
REP, Knowledge Worker, C-Suite, non-resident 30%). Dual path: compute-first with
evidenced override.  
**Amendment ref:** §8 of
[`docs/superpowers/specs/2026-08-08-statutory-authority-amendment.md`](../docs/superpowers/specs/2026-08-08-statutory-authority-amendment.md).  
**Design:** [`docs/superpowers/specs/2026-08-08-pcb-normal-engine-design.md`](../docs/superpowers/specs/2026-08-08-pcb-normal-engine-design.md).

## Decision

**Option B-v2 — Compute all five resident computerized formulas + non-resident 30%.**

- Formula authority: `P-SPEC-2026` (hashed)
- Parity / override oracle: `P-CALC-2026`
  ([full calculator URL](https://calcpcbplus.hasil.gov.my/HITS_CE/x2026?PRV_YEAR=true&FRS_REC=true))
- Testing questions: `P-TEST-2026` (hashed; no published answer key)
- Vectors: EXHIBIT 5 Normal + Additional in CI
- `LHDN_VERIFIED`: still a human IRBM gate — not claimed by this slice

## Fetch record (unchanged)

| Field | Value |
|---|---|
| ref | `P-SPEC-2026` |
| sha256 | `a1618051c858393d92d868c9975c183309d3d07e48f0e4f0cdef589f45f5800c` |
| byteLength | `1375535` |
| retrievedAt | `2026-08-08` |

| Field | Value |
|---|---|
| ref | `P-CALC-2026` |
| url | `https://calcpcbplus.hasil.gov.my/HITS_CE/x2026?PRV_YEAR=true&FRS_REC=true` |
| sha256 | null (living portal) |

## Intake checklist

| Item | Status |
|---|---|
| Spec PDF hashed | **Done** |
| Spec year/version | **2026** / **2026-01-01** |
| Official test vectors | **EXHIBIT 5** (Normal) transcribed; **P-TEST-2026** fetched/hashed (Q1–Q5 are C-Suite / Additional / REP / expatriate / KW — deferred) |
| Decision | **B-v2 / S07c wired** |
| LHDN submission owner | **TBD — compliance owner** |

### P-TEST-2026 fetch record

| Field | Value |
|---|---|
| ref | `P-TEST-2026` |
| url | `https://www.hasil.gov.my/wp-content/uploads/mtd-testing-question-2026.pdf` |
| sha256 | `d6523266b8b23daca956be0f61ec52879eab364736a9feb5668d7f039ae33517` |
| byteLength | `200396` |
| retrievedAt | `2026-08-08` |
| local path | `db/evidence/mtd-testing-question-2026.pdf` |
| note | `/media/kdspkhrf/mtd-testing-question-2026.pdf` returned 404; wp-content URL OK |

## TP1 catalog correction (2026-08-08)

`pcb-tp1.ts` now enforces the Form TP1 relief schedule (items a–q of
`P-SPEC-2026`) including the four combined envelopes:

| Group | Spec item | Combined cap |
|---|---|---|
| `EPF_LIFE_INSURANCE` | h | RM7,000 (EPF ≤ RM4,000 + life/takaful ≤ RM3,000) |
| `LIFESTYLE_CORE` | l | RM2,500 |
| `LIFESTYLE_SPORT` | o | RM1,000 |
| `LIFESTYLE_ECO` | p | RM2,500 |

Also added missing codes: `SOCSO_CONTRIBUTION`, `BREASTFEEDING_EQUIPMENT`,
`EV_CHARGING_FACILITY`, `HOUSING_LOAN_INTEREST_HIGH_VALUE_HOME`. Authority is
the already-hashed `P-SPEC-2026` — no new source fetch.

## Table 2 / Table 3 primary-source verification (2026-08-08)

`P-SPEC-2026` downloaded to local evidence (`db/evidence/pcb-spec-2026.pdf`,
sha256 re-verified byte-identical to the fetch record above). Read directly
from the PDF:

- **Table 2** (REP, p.15) and **Table 3** (Knowledge Worker, p.16) are
  byte-for-byte identical: P ≤ RM35,000 → R=15%, T=RM400 (category 1 & 3) /
  RM800 (category 2); P > RM35,000 → R=15%, T=0.
- `flat15RebateTSen` (`pcb-core.ts`) sharing one function for REP and
  Knowledge Worker is therefore **confirmed correct against the primary
  source**, not an unverified assumption or a shortcut.
- **Table 1** (p.9) matches `db/seed/pcb-table1-2026.json` /
  `pcb-tables.ts` row-for-row (checked every `M`, `R`, `B` value).
- **Table 4** (C-Suite, p.18) has no `T` column at all — confirms
  `computeFlat15(..., withRebate: false)` for C-Suite is correct, not a
  missing rebate.

## Explicit non-goals

- Runtime scrape/call of the HTML calculator
- Claiming `LHDN_VERIFIED`
- Auto-claiming pass of `P-TEST-2026` without IRBM answer verification
