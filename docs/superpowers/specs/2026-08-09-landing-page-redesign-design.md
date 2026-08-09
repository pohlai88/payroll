# Landing Page Redesign — Design

**Date:** 2026-08-09
**Status:** Revised after second review — awaiting final approval
**Scope:** `landing.html` and `src/marketing/**` only. The payroll SPA (`index.html`, `src/web/**`) is untouched.

## Doctrine

> **Every statutory claim, figure, citation and capability on the marketing page must be derived from the same effective-dated rule-pack evidence and the same surfaces the engine actually implements. Marketing must never become a second source of statutory truth, and must never assert a capability the product does not have.**

### Implementation gates

Three hard checks, each of which has already caught a real defect in this design:

1. **No marketing claim may describe a test-harness control as a production runtime control.** The golden master lives in `tests/`; it is a development and CI control, not a release gate.
2. **No capability may be claimed unless it exists in `src/`.** Grep before writing. "EA Form" and "CP8D" were claimed and exist nowhere.
3. **No hand-authored statutory figures.** All money and band values import from `src/marketing/content.ts`, which reads the shipped rule pack. If the page needs a value the pack lacks, the design changes — not the figure.

Plus one semantic rule: **amber never dramatises a condition that did not occur.** A ceiling may only be shown as applied where the wage genuinely exceeds it.

## Purpose

Replace the marketing surface with a page that reads as a governance and assurance briefing. It makes one argument: every payroll figure Clarity presents carries a reason, an authority and evidence — and a run whose figures cannot be accounted for cannot progress.

## Corrections log

Eleven content defects have been found and fixed across two review rounds. They are recorded because the failure mode is the subject of the page.

| # | Defect | Correction |
|---|---|---|
| 1 | Chain totalled RM3,667.85 but claimed net RM3,658.85 — RM9.00 unexplained | Uses `LEDGER_EMPLOYEE` from the rule pack; reconciles exactly |
| 2 | "EPF employee relief" conflated a payroll deduction with tax treatment | **EPF employee contribution** |
| 3 | Cited an invented "Act 4, First Schedule" | Uses source ref **S2** as the pack records it |
| 4 | Showed a PCB table lookup Clarity does not perform | PCB is an `EXTERNAL_VERIFIED` fact; wording revised (below) |
| 5 | Claimed a RM6,000 ceiling applied to a RM4,500 wage | Example uses the pack's **RM6,500.00** wage, where the ceiling binds |
| 6 | Claimed "EA Form" and "CP8D" outputs | Neither exists in `src/`; replaced with the four implemented reports |
| 7 | Invented rule pack "2026.03, effective 1 January 2026" | Real pack **`MY-STATUTORY-2026-06`, effective 1 June 2026** |
| 8 | Omitted SKBBK entirely | Included, with participation status stated |
| 9 | **Described the golden master as a runtime release gate** | Golden master is test-harness only. Replaced with the real gate model from `src/service/gates.ts` |
| 10 | **Invented a five-stage run lifecycle** (Draft → Computed → Verified → Approved → Released) | Real statuses are `DRAFT / REVIEWED / APPROVED / CLOSED`; real gates are `REVIEW / APPROVAL / RELEASE / CLOSE` |
| 11 | "Enforced by database triggers" as primary copy | Demoted to secondary technical evidence |

## Visual language

Sampled from the DLBB / Singapore Share Sale briefing decks. Cool, restrained, teal-led.

### Color

| Role | Value | Usage |
|---|---|---|
| Navy | `#13303f` | Hero panel, closing, table headers, headline ink |
| Navy 2 | `#1a4053` | Gradient partner for navy surfaces |
| Teal | `#2f7d70` | Brand accent: top rule, act labels, citation chips |
| Teal lift | `#6fb9a9` | Accent on navy where `#2f7d70` lacks contrast |
| Blue fill / line / ink | `#e9f0f8` / `#9db8d4` / `#1c4a63` | First card family |
| Mint fill / line / ink | `#e7f1ee` / `#a9c9c0` / `#2a7266` | Alternating card family |
| Amber fill / line / ink | `#fce4b8` / `#c8901f` / `#8a5a12` | **Reserved** — four positions only |
| Slate | `#2c3e4a` | Body copy |
| Meta | `#5c6d7a` | Secondary copy — darkened from `#6b7c8a` (4.31:1, below AA) to 5.35:1 |
| Hairline | `#dfe4e8` | Borders, dividers |

Amber's four sanctioned positions: the rule-pack-in-force note; the SOCSO and EIS ceiling rows in the proof tree (legitimate only because the example wage exceeds RM6,000); blocking findings at a gate; changed-figure deltas in the rule-change diff. Anywhere else is a review-blocking defect.

### Typography

- **Display:** Bricolage Grotesque — headings and figures, mixed case
- **Body:** Archivo
- **Mono:** IBM Plex Mono — money, statutory refs, dates, digests, revisions

All money uses `font-variant-numeric: tabular-nums`. Fraunces and Geist are dropped from this surface.

### Geometry

6–8px radii. Soft radial teal glows behind navy surfaces. Dividers fade at their ends. White `#ffffff` ground — no grain, no paper tint.

## Narrative structure — four acts

Eleven components in four acts, so the page reads as one argument rather than a documentation index. Act labels are typographic only.

### Act I — The claim

**`site-nav`** — wordmark, act links, "Open the App".

**`hero`** — split: navy claim panel left, white process grid right.

Thesis, revised so it does not conflict with Clarity not calculating PCB:

> **Every payroll figure has a reason, an authority and evidence.**

The hero states the two-track model explicitly, because it is the architecture:

| Track | Path |
|---|---|
| **Derived** | Amount → calculation → rule → authority → evidence |
| **Externally verified** | Amount → approved method or source → verification → evidence |

Process grid, 2×2 alternating blue/mint: **Compute → Trace → Verify → Release**. "File" is rejected: Clarity transmits nothing to any authority.

Amber note: `MY-STATUTORY-2026-06 · effective 1 June 2026`, from `RULE_PACK`.

**`assurance-strip`** — three qualitative assurances, no absolute numeric guarantees:

| Label | Statement |
|---|---|
| Sen-precise | Integer sen end to end; rounding happens in exactly one function |
| Source-bound | Every derived figure retains its calculation and its source evidence |
| Effective-dated | Each run records the rule-pack version that applied when it was calculated |

Rejected: "0 sen unaccounted for" (reads as a universal financial guarantee), "100% figures traceable" (absolute), "18 tables kept current" (implementation count that ages badly).

### Act II — Prove one number

**`proof-tree`** — the centrepiece. A tree, not a chain: the deductions are independently governed siblings of one payroll fact, not sequential transformations of each other.

The illustrative scenario must be stated in full, so every deduction is *explainable* and not merely arithmetically correct:

```
Illustrative employee-month
Malaysian employee · under 60 · EPF Part A · category 1
LINDUNG 24 JAM: opted in
Monthly wage: RM 6,500.00
Rule pack: MY-STATUTORY-2026-06 · effective 1 June 2026
```

The LINDUNG 24 JAM line is required: participation is voluntary for local employees, so a SKBBK deduction on a Malaysian employee is unexplained without it. These scenario properties are added to `content.ts` as explicit fields rather than left implicit in prose.

Figures, all from `LEDGER_EMPLOYEE`:

| Branch | Amount | Ref | Note (verbatim from the pack) |
|---|---|---|---|
| EPF employee contribution | 715.00 | S1 | Third Schedule Part A, band 6,400.01–6,500.00 |
| SOCSO employee | 29.75 | S2 | Act 4 first category, above the RM6,000 ceiling — **amber** |
| SKBBK employee | 44.65 | S2A | Employee-borne during Phase 1, Jun 2026 – May 2028 · participation: opted in |
| EIS employee | 11.90 | S3 | Act 800, capped at the RM6,000 ceiling — **amber** |
| PCB | 312.50 | S4 | Externally verified — not calculated by Clarity |

Gross RM6,500.00 → net **RM5,386.20**. Reconciliation printed on the page: 650,000 − (71,500 + 2,975 + 4,465 + 1,190 + 31,250) = 538,620 sen.

Each derived branch exposes amount, rule, authority, effective date, evidence. The PCB branch instead exposes amount, source/method, verification, evidence.

**The PCB branch is the strongest single element on the page** and is rendered visually distinct from the derived branches. Its copy:

> **Clarity does not independently calculate PCB.** The amount is obtained through an approved HASiL calculation method or verified source and carried into the run as an externally verified fact. If the required PCB fact is absent, the affected result remains unresolved rather than silently defaulting to zero.

"Never computes" is rejected as a permanent product promise that would become awkward if a HASiL-approved computerised method is implemented later. "e-PCB" is rejected as too narrow — HASiL permits the computerised calculation method or the prescribed schedule, with several submission mechanisms.

A payroll product volunteering what it declines to calculate is more credible than one implying it calculates everything. This must not be softened to look like the other branches.

**`source-register`** — the eight documents from `SOURCES`, as a control register. Columns: Ref · Issuer · Instrument · Retrieved · Evidence. Coverage/percentage bars are rejected — they imply partial compliance, resemble SaaS telemetry, and were fabricated (no such field exists).

S4 (HASiL) and S5 (HRD Corp) carry `digest: null` and are shown as "method ref · no digest" rather than given a reassuring checkmark.

The register also carries the rule-pack authority ladder from `rulePackStatus`, which is real and directly supports the effective-dating claim:

`DRAFT → SOURCE_CAPTURED → VERIFIED → APPROVED → EFFECTIVE → SUPERSEDED`

Only `APPROVED` and `EFFECTIVE` packs may reach a payroll run. `SUPERSEDED` packs are retained unchanged, so a run calculated under one stays reproducible.

### Act III — Govern the run

**`run-lifecycle`** — the real model from `src/service/gates.ts` and `runStatus`. Four statuses, four gates:

`DRAFT` → **REVIEW** → `REVIEWED` → **APPROVAL** → `APPROVED` → **RELEASE** → **CLOSE** → `CLOSED`

Payment state is deliberately line-level (`READY / HOLD / RELEASED / PAID / FAILED_RETURNED`), not a run status. The page must not imply a run is "paid".

The gate conditions are the substance, and all are real:

- **Findings must be scanned against the current calculation.** If a run is recalculated, its scan is stale and every gate fails (`SCAN_INCOMPLETE`: `findingsScannedRevision` must equal `calcRevision`).
- **What is approved must be what was reviewed** (`REVISION_MISMATCH`: `reviewedRevision` must equal `calcRevision`).
- **Findings carry severities that decide gate behaviour:** `BLOCKING` blocks the gate; `WARNING` and `REVIEW` require explicit acknowledgement; `INFO` never blocks. Each finding declares which gates it blocks.
- **Every gate passage is certified**, stamped with the calculation revision, the statutory pack id, the anomaly pack version and the actor, and written to the audit log.

Primary buyer-facing statement, replacing the golden-master claim:

> **Verification is a release gate. Required payroll invariants must pass before a run can progress, and approval locks the authoritative calculation against subsequent mutation.**

Secondary technical evidence, available but not leading: those invariants are held by database triggers rather than application code, so they hold regardless of which client writes.

The golden master may appear only as a **development and CI control**, explicitly labelled as such — 37 verified employees pinning the engine in the test suite, where a failure stops the build. It must never be presented as a runtime gate.

**`rule-change-diff`** — re-run a period against a new pack; the difference is itemised per employee and per line with the causing authority named. Unchanged rows stay visible, so silence is evidence. Deltas are the fourth sanctioned amber.

### Act IV — Produce evidence

**`audiences`** — blue/mint split: payroll officer vs auditor & authority.

**`outputs`** — headed **Evidence-ready payroll reports**, being the four that exist in `src/web/reports/`:

| Report | Purpose |
|---|---|
| Payment Register | Net pay instructions for the run |
| Statutory Summary | Contributions by statutory body |
| Exception Report | Figures requiring attention before release |
| Annual Remuneration Summary | Per-employee annual remuneration |

"Outputs ready for submission" is rejected: these are implemented reports, not artifacts warranted as accepted for submission by a bank, KWSP, PERKESO or HASiL. Each card states its purpose without implying accepted format.

**`closing`**

> **If a payroll figure cannot be explained, the run cannot be released.**
>
> Calculation. Rule. Authority. Effective date. Evidence.

Secondary: *"Nothing is hidden" is something the system verifies, not something this page asks you to believe.*

**`site-footer`** — rule pack line, professional-boundary disclaimer.

## Implementation constraints

Entry point unchanged: `landing.html` → `src/marketing/main.tsx` → `Landing` → sections. Static, no router. The marketing surface continues to share no styles with the SPA.

- All figures import from `content.ts`; no money literals in section components. `formatSen` stays the only money formatter.
- `content.ts` gains the proof-tree scenario fields (participation status, category, age band, wage) so they are data, not prose.
- Tokens as CSS custom properties in the marketing stylesheet; the SPA's Straits tokens untouched.
- Fonts via Fontsource, self-hosted, `font-display: swap`.
- Sections stay small and single-purpose. `SectionHeading` and the eight current section files are deleted, not adapted.
- Sample figures labelled as one illustrative employee-month from the rule pack, never as customer data.

### Accessibility and guideline compliance

- Semantic landmarks, skip link, hierarchical `h1`–`h4`, `scroll-margin-top` on anchor targets
- Navigation is `<a>`; no handlers on non-interactive elements
- `:focus-visible` outlines with offset on every interactive element
- Decorative glow layers `aria-hidden="true"`
- Statutory codes wrapped `translate="no"` (EPF, SOCSO, SKBBK, EIS, PCB, HRDF)
- Explicit transition properties; animate only `transform`/`opacity`; no `transition: all`
- `prefers-reduced-motion` disables entry animation and hover translation
- `text-wrap: balance` on headings, `pretty` on body; `…`, curly quotes, non-breaking spaces in paired tokens
- `touch-action: manipulation`
- Body-size text ≥ 4.5:1 — hence `--meta` at `#5c6d7a`
- Responsive: hero split and grids collapse below 768px; the proof tree reflows from horizontal tree to vertical stack retaining branch labels; the register scrolls inside its container

### Testing

- **Reconciliation test (mandatory):** proof-tree branches plus gross must equal displayed net, in sen. This is the test that catches the RM9.00 class of defect.
- **Provenance test:** every figure rendered in the proof tree and register is referentially equal to its `content.ts` constant, so literals cannot be reintroduced.
- **Capability test:** the outputs section's report names must match the report definitions in `src/web/reports/reports-page.tsx`, so an invented report fails the build.
- Per-section render tests for load-bearing content: source refs, the PCB "not calculated by Clarity" note, the participation line, gate names.
- Amber restriction and the three implementation gates are checked at review.
- Manual pass at 375px, 768px, 1280px, 1920px.

## Out of scope

- Any change to the payroll SPA, its routes, or its Straits tokens
- i18n of the marketing page
- Analytics, forms, lead capture
- Customer data or testimonials
- Any claim of electronic filing, statutory transmission, submission-accepted formats, or PCB calculation

## Resolved decisions

- **Palette source:** the supplied briefing decks, not the SPA's Straits tokens — the surfaces stay independent, consistent with the existing boundary in `vite.config.ts`.
- **Centrepiece:** proof tree, not a chain, and not a payslip. A payslip proves the software renders a document; a proof tree proves it can defend a number.
- **Background:** pure white. Warm paper and grain tried and rejected.
- **Hero:** no payslip, no dashboard screenshot, no floating widgets.
- **Verb:** Release, not File.
- **Run model:** the real four statuses and four gates, never an idealised lifecycle.
