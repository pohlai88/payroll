# MY-STAT-S04 — Employment-Law Threshold Intake

**Status:** Values **proposed from official JTKSM/MOHR PDFs** (2026-08-08
research). Pack `MY-EMPLOYMENT-LAW-2026` remains `SOURCE_CAPTURED` until a
**named human reviewer** signs the table below and implementation populates
`employment_law_rules`.  
**Not an approval.** This intake records evidence for that review; it does not
authorise payroll use of these figures.

## Why this gate exists

Authority rule: executable statutory truth comes only from official Malaysian
sources, verified by a named reviewer. Secondary summaries cannot independently
approve a rule. AGC `lom.agc.gov.my` pages for Act 265 / P.U.(A) 376 are
index-only; body text was read from **JTKSM / MOHR-hosted official PDFs**.

[`db/seed/employment-law-sources.json`](../db/seed/employment-law-sources.json)
registers the instruments. No values are loaded into `employment_law_rules`
until human sign-off + S04 implementation.

## Proposed values (official PDF research)

| Target key | Instrument (seed ref) | Value | Unit | Provision | Page | Confidence | Verified by | Verified at |
|---|---|---|---|---|---|---|---|---|
| `MAX_WEEKLY_HOURS` | L-EA265 — Employment Act 1955 (as amended A1651) | **45** | HOURS | s.60A(1)(d) | ~p.56 JTKSM 2023-11 reprint | HIGH | _pending human_ | |
| `OT_MULTIPLIER_WORKDAY` | L-EA265 | **1.5** | MULTIPLIER | s.60A(3)(a) | ~p.58 | HIGH | _pending human_ | |
| `OT_MULTIPLIER_REST_DAY` | L-EA265 | **2.0** | MULTIPLIER | s.60(3)(c) | ~p.55 | HIGH† | _pending human_ | |
| `OT_MULTIPLIER_PUBLIC_HOLIDAY` | L-EA265 | **3.0** | MULTIPLIER | s.60D(3)(aa) | ~pp.62–63 | HIGH† | _pending human_ | |
| `EA_ENTITLEMENT_WAGE_CEILING` | L-EA265 / P.U.(A) 262/2022 + 273/2022 | **400000** | SEN | First Sch. para 1A | gazette + reprint | HIGH‡ | _pending human_ | |
| `OT_MAX_HOURS_MONTH` | L-OT1980 — Overtime Limitation Regs 1980 | **104** | HOURS | reg. 2 | single-page PDF | HIGH | _pending human_ | |
| `MIN_WAGE` | L-MWO2024 — P.U.(A) 376/2024 | **170000** | SEN | paras 3 & 5 (nationwide from 2025-08-01) | gazette tables | HIGH | _pending human_ | |

† OT multipliers above are for **excess hours** on that day type. Base rest-day /
public-holiday day rates (s.60(3)(a)–(b), s.60D(3)(a)) are separate findings
rules — do not overload these keys.  
‡ Ceiling is wages that **exceed** RM4,000/month. Human must confirm interaction
of First Schedule para 1A with para 2 (manual labour still entitled).

### Official URLs used for research

| Instrument | Official PDF / portal |
|---|---|
| EA 1955 reprint (2023-11) | https://jtksm.mohr.gov.my/sites/default/files/2023-11/Akta%20Kerja%201955%20(Akta%20265).pdf |
| Employment (Amendment) Act A1651 | https://jtksm.mohr.gov.my/sites/default/files/2023-03/1.%20Employment%20%28Amendment%29%20Act%20A1651%20BI%20%281%29.pdf |
| First Schedule amendment P.U.(A) 262/2022 | https://jtksm.mohr.gov.my/sites/default/files/2023-03/57.%20P.U.%20%28A%29%202022_262%20Perintah%20Kerja%20%28Pindaan%20Jadual%20Pertama%29%202022.pdf |
| OT Limitation Regs 1980 | https://jtksm.mohr.gov.my/sites/default/files/2023-03/7.%20EMPLOYMENT%20(LIMITATION%20OF%20OVERTIME%20WORK)%20REGULATIONS%201980_0.pdf |
| Minimum Wages Order 2024 | https://gajiminimum.mohr.gov.my/wp-content/uploads/PUA%20376.pdf |

### Source conflicts the human must resolve

1. **Weekly hours 48 vs 45:** older JTKSM English reprint (~2022-11) still shows
   48; current law is **45** (A1651 + 2023-11 reprint). Use post-amendment text.
2. **MIN_WAGE staging:** P.U.(A) 376/2024: RM1,700 from 2025-02-01 for ≥5
   employees / MASCO; RM1,500 interim then RM1,700 from 2025-08-01 for &lt;5.
   For pack `effectiveFrom` **2026-01-01**, **170000 sen** is the correct floor.
3. **Rest-day / PH keys:** confirm product meaning is excess-hours OT only.

## Human sign-off

```
verification_method: HUMAN_REVIEW_OF_OFFICIAL_PDF
verified_by: __________________
verified_at: __________________
notes: ________________________
```

Until signed, do **not** approve `MY-EMPLOYMENT-LAW-2026` and do **not** load
these figures into `employment_law_rules` as production truth.

## Explicit non-goals until signed off

- Do not invent rates from memory, blogs, or prior payroll software
- Do not approve `MY-EMPLOYMENT-LAW-2026` empty or on agent research alone
- Do not silently fold this work into S05/S06/S07 or a UI slice

## Unblocks

Once a human fills **Verified by / Verified at**, S04 implementation can start:
populate `employment_law_rules`, advance the pack
`SOURCE_CAPTURED → VERIFIED → APPROVED`, and add tests that the findings engine
reads the approved values only. Wiring `resolveRule()` into pay-run creation
remains a separate S01 deferred task.
