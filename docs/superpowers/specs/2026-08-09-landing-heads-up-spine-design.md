# Landing Heads-Up Spine — Design

**Date:** 2026-08-09  
**Status:** Design Approved — implementation plan required before code changes  
**Scope:** `landing.html` and `src/marketing/**` only. Payroll SPA untouched.  
**Supersedes (for page narrative):** enterprise-refinement “seven movements” story order where it conflicts; claim gates from the landing redesign design remain in force.

## Objective

Give the marketing landing an unmistakable **heads-up** through the whole page: payroll does not move until controls clear. The first viewport must read as an **audit / control briefing**, not a SaaS incident banner and not a happy-path product tour.

## Problem

After prior redesign and polish passes, the landing still failed the “heads-up” test: visitors could not instantly feel that the product **deliberately stops** unsafe progress. Alert-like treatments risked looking like the product was broken. Revision-control failures were at risk of being mislabeled as findings. Older golden-master / ledger-first narratives may still linger in content or section copy and must not survive this redesign.

## Doctrine

1. **The control itself is the evidence.** Promise first; one compact, believable control-state proof immediately under it.
2. **Enforcement over visibility.** Prefer “payroll does not move until the controls clear” over “know what blocks payroll.”
3. **Never blur findings and gate prerequisites.** Revision mismatch is a **control / gate prerequisite**, not an anomaly finding.
4. **Claim gates unchanged** (from landing redesign design):
   - No capability claimed unless it exists in `src/`
   - No hand-authored statutory money; use the canonical marketing money formatter (`formatSen` today; `formatRinggit` may remain a thin `RM`+NBSP wrapper — do not invent a second money path) and pack-derived sen
   - No golden-master-as-runtime claims
   - Authority claims must prove governance eligibility and temporal applicability
   - Amber only for conditions that actually apply in the illustrative scenario
5. **Illustrative labels** on every control vignette and ledger example.
6. **Narrative replacement, not an additive layer.** Old golden-master stamps, roots/node-count engineering tallies, antiquarian-ledger framing, and absolute PCB claims that conflict with the revised doctrine must be **removed from rendered marketing content**, not left elsewhere on the page. PCB boundary remains: Clarity does not independently calculate PCB; it uses an approved HASiL calculation method or verified source; unresolved is never represented as zero.

## Approach

**Heads-up spine (Approach A)** with **Director Control Proof Hero** for Movement 1.

Page argument:

1. Enforcement — payroll stops  
2. Operator question — what must I resolve?  
3. Failure — what does a blocked condition look like?  
4. Arithmetic proof — are the numbers governed?  
5. Authority — why trust the rules?  
6. Progression — what clears controls and what happens next?

---

## Movement 1 — Control Proof Hero (LOCKED)

### Composition

Asymmetric director layout (not left-stack, not 50/50 equal split):

- Full-bleed navy hero
- Top teal rule
- Grid ~`1.08fr` / `0.92fr`, vertically centered
- Left: eyebrow, dominant headline, lede, CTAs
- Right: one compact proof board (supports, does not compete)
- Hero footer: **three assurance chips only** (no separate repeating footer note)
- Amber ≤ ~2–3% of the hero (Blocked chip / state only)
- No red; thin borders; minimal chrome; no dashboard widgets

Reference mock: `.superpowers/brainstorm/452-1786266878/content/control-proof-hero-locked.html` (ignore prototype-only cards and any duplicate footer note)

### Locked copy

| Element | Copy |
|---|---|
| Eyebrow | Payroll control |
| Headline | Payroll does not move until the controls clear. |
| Lede | Every run must clear its **current revision checks** and **unresolved findings** before it can move through review, approval or release. |
| Primary CTA | See how controls work → `#asks` |
| Secondary CTA | Open the app → `/` |
| Proof label | Control state |
| Proof state | Blocked |
| Proof kicker | Approval gate · revision control |
| Proof title | Approval cannot proceed. |
| Proof body | The calculation changed after review. The run must be reviewed again before approval can proceed. |
| Invariant | `reviewedRevision ≠ calcRevision` (`translate="no"`) |
| Stages | Review · Required again · Approval · Blocked · Release · Not yet available |
| Proof foot | Gate certification records the current calculation revision and statutory authority. · Illustrative control state |
| Assurance chips | Revision-bound review · Finding-led gates · Auditable control passage |

Do **not** ship a separate hero footer note that repeats the proof foot (“Control passage is recorded…”).

### Semantic rule (critical)

Do **not** say “1 finding prevents approval” for revision mismatch. That is a gate prerequisite, evaluated separately from OPEN findings in runtime. Calling it a finding recreates marketing-vs-runtime mismatch.

If a later section needs “1 finding prevents approval,” use a real finding scenario (e.g. `PCB_UNVERIFIED`) there—not in Movement 1.

### Typography / tokens on ship

Use marketing identity: Bricolage display, Archivo body, IBM Plex Mono for invariants. Do not ship Inter from the preview HTML. Keep existing navy / teal / amber token system.

### Out of production

- Prototype cards (“Why this beats equal split,” etc.)
- Lock / tweak buttons
- Design-note sentence “Governance shown as product behavior…”

---

## Movements 2–6 (APPROVED STRUCTURE)

### 2 — What the alert asks (`#asks`)

Three operator controls: Find the blocker / Protect the decision / Control the release (or claim-safe equivalents). Answers the primary CTA (`#asks`).

Create or retain a `DECISION_CONTROLS` content model **only after reconciling each control with actual runtime behavior**. Do not invent copy merely to fill a three-band layout.

Visual: equal semantic bands with icons; evidence line per control.

### 3 — When a control fails (`#failure`)

Issue-first dramatic beat. Optional vignette may use a **real finding** (e.g. PCB unverified) to demonstrate the findings system—distinct from Movement 1’s revision gate. Must remain illustrative and labelled.

### 4 — Consequence in numbers (`#proof`)

One governed employee-month ledger. Reconciles to the sen. Participation stated. PCB boundary note retained (approved method / verified source; unresolved ≠ zero). Money only via the canonical marketing formatter path.

### 5 — Why trustworthy (`#authority`)

Compact authority lifecycle + statement. Source register and pack statuses stay in disclosures. No invented pack statuses.

### 6 — What happens next + Act (`#next` → closing)

Gate conditions, severities, illustrative effective-date comparison, implemented reports. Closing: restate heads-up → **Open the app** primary; secondary may return to `#asks`.

### Navigation

Anchors are deterministic:

| Label | Target |
|---|---|
| Control | `#control` (hero section id) |
| Asks | `#asks` |
| Failure | `#failure` |
| Proof | `#proof` |
| Authority | `#authority` |
| Next | `#next` |

Preserve the **existing** mobile navigation behavior. Do not introduce a new navigation interaction (e.g. a hamburger drawer) solely for this redesign. Shorten labels only if the sticky nav overcrowds.

### Skip link (frozen)

```tsx
<a href="#main-content">Skip to content</a>
<main id="main-content">
```

Both ends must remain exact. Do not point the skip link at a section id such as `#ledger` or `#asks`.

---

## Architecture / files

| Unit | Responsibility |
|---|---|
| `content.ts` | All marketing copy, vignette data, money/date formatters, claim-safe figures; purge obsolete narrative exports from render paths |
| `sections/hero.tsx` | Movement 1 director composition (`id="control"`) |
| `sections/decision-control.tsx` (or rename) | Movement 2 (`id="asks"`) |
| Failure section (new or recomposed) | Movement 3 (`id="failure"`) |
| `sections/proof-ledger.tsx` (or rename) | Movement 4 (`id="proof"`) |
| `sections/authority-evidence.tsx` (or rename) | Movement 5 (`id="authority"`) |
| `sections/run-evidence.tsx` + `closing.tsx` | Movement 6 (`id="next"` on the gates/outputs block; closing remains final act) |
| `landing.tsx` | Spine order + skip link contract |
| `styles.css` | Tokens + hero utilities; keep WIG a11y |
| `tests/marketing/*` | Content gates, landing render, capability claims |

### Migration requirement

**Implementation-plan requirement:** map each **current** marketing section and every **exported content claim** to delete / retain / rename / rewrite **before** editing. Prefer rename/recomposition over parallel replacement files; delete obsolete sections once unreferenced.

Illustrative mapping (exact treatment is an audit deliverable — names on disk may already differ after enterprise refinement):

```text
Hero                 → rewrite as Director Control Proof Hero
DecisionControl      → Movement 2 (#asks) after content reconciliation
(new / split)        → Movement 3 (#failure)
ProofLedger          → Movement 4 (#proof)
AuthorityEvidence    → Movement 5 (#authority)
RunEvidence+Closing  → Movement 6 (#next + act)
Legacy names if any
  (Ledger/Method/Provenance/DrillDown)
                     → map into the spine; do not leave parallel pages
```

---

## Testing

- Existing four content gates remain green
- Landing tests updated for new headline, CTA href `#asks`, and absence of “finding” language on the revision vignette
- Assert illustrative labelling on hero proof
- Assert skip link → `#main-content` and `main#main-content` exist
- No `RM` digit literals in section TSX
- Marketing suite + ultracite on touched files
- Grep rendered marketing for banned residues: golden-master-as-runtime, “1 finding” on revision vignette, absolute “never computes PCB” if it conflicts with the HASiL-method boundary wording

## Non-goals

- SPA / app heads-up UI
- Fake metrics, marquee logos, floating dashboards
- Dark-mode marketing theme
- Claiming Release/Close certified without gate evaluation
- Using Inter or preview-only chrome in production
- New mobile nav pattern solely for this redesign

## Success criteria

1. First viewport communicates enforcement (not “something broke”).
2. Revision mismatch is named as a control / gate, never a finding.
3. A visitor can recite: calculation changed → review invalid → approval blocked → release not yet available.
4. Rest of page continues the heads-up spine without generic SaaS feature grids.
5. Obsolete golden-master / tally / conflicting PCB narratives are gone from the rendered page.
6. Claim gates and WIG accessibility constraints hold.

## Implementation note

Produce an implementation plan under `docs/superpowers/plans/` and execute task-by-task. Do not implement from this document alone without the plan.

**The implementation plan must begin with a current-code reconciliation pass and identify delete / retain / rename / rewrite treatment for every existing marketing section and every exported content claim.**
