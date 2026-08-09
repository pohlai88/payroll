# Landing Heads-Up Spine — Design

**Date:** 2026-08-09  
**Status:** Design — awaiting user review before implementation plan  
**Scope:** `landing.html` and `src/marketing/**` only. Payroll SPA untouched.  
**Supersedes (for page narrative):** enterprise-refinement “seven movements” story order where it conflicts; claim gates from the landing redesign design remain in force.

## Objective

Give the marketing landing an unmistakable **heads-up** through the whole page: payroll does not move until controls clear. The first viewport must read as an **audit / control briefing**, not a SaaS incident banner and not a happy-path product tour.

## Problem

After prior redesign and polish passes, the landing still failed the “heads-up” test: visitors could not instantly feel that the product **deliberately stops** unsafe progress. Alert-like treatments risked looking like the product was broken. Revision-control failures were at risk of being mislabeled as findings.

## Doctrine

1. **The control itself is the evidence.** Promise first; one compact, believable control-state proof immediately under it.
2. **Enforcement over visibility.** Prefer “payroll does not move until the controls clear” over “know what blocks payroll.”
3. **Never blur findings and gate prerequisites.** Revision mismatch is a **control / gate prerequisite**, not an anomaly finding.
4. **Claim gates unchanged** (from landing redesign design):
   - No capability claimed unless it exists in `src/`
   - No hand-authored statutory money; use `formatRinggit` / pack-derived sen
   - No golden-master-as-runtime claims
   - Authority claims must prove governance eligibility and temporal applicability
   - Amber only for conditions that actually apply in the illustrative scenario
5. **Illustrative labels** on every control vignette and ledger example.

## Approach

**Heads-up spine (Approach A)** with **Director Control Proof Hero** for Movement 1.

Page argument: Alert → why it matters → what fails look like → proof in numbers → why trustworthy → what happens next → act.

---

## Movement 1 — Control Proof Hero (LOCKED)

### Composition

Asymmetric director layout (not left-stack, not 50/50 equal split):

- Full-bleed navy hero
- Top teal rule
- Grid ~`1.08fr` / `0.92fr`, vertically centered
- Left: eyebrow, dominant headline, lede, CTAs
- Right: one compact proof board (supports, does not compete)
- Hero footer: three assurance chips + one buyer-value note
- Amber ≤ ~2–3% of the hero (Blocked chip / state only)
- No red; thin borders; minimal chrome; no dashboard widgets

Reference mock: `.superpowers/brainstorm/452-1786266878/content/control-proof-hero-locked.html`

### Locked copy

| Element | Copy |
|---|---|
| Eyebrow | Payroll control |
| Headline | Payroll does not move until the controls clear. |
| Lede | Every run must clear its **current revision checks** and **unresolved findings** before it can move through review, approval or release. |
| Primary CTA | See how controls work → `#asks` (or equivalent) |
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
| Footer note | Control passage is recorded with the calculation revision and authority used. |

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

Three operator controls: Find the blocker / Protect the decision / Release control. Answers the primary CTA. Keep claim-safe copy from `DECISION_CONTROLS` (or tighten wording without inventing capabilities). Visual: equal semantic bands with icons; evidence line per control.

### 3 — When a control fails (`#failure`)

Issue-first dramatic beat (former option C energy). Optional vignette may use a **real finding** (e.g. PCB unverified) to demonstrate the findings system—distinct from Movement 1’s revision gate. Must remain illustrative and labelled.

### 4 — Consequence in numbers (`#proof`)

One governed employee-month ledger. Reconciles to the sen. Participation stated. PCB boundary note retained. Money only via content helpers.

### 5 — Why trustworthy (`#authority`)

Compact authority lifecycle + statement. Source register and pack statuses stay in disclosures. No invented pack statuses.

### 6 — What happens next + Act (`#next` → closing)

Gate conditions, severities, illustrative effective-date comparison, implemented reports. Closing: restate heads-up → **Open the app** primary; secondary may return to `#asks`.

### Navigation

Retarget anchors to the spine, e.g.:

| Label | Target |
|---|---|
| Control | `#control` / hero |
| Asks | `#asks` |
| Failure | `#failure` |
| Proof | `#proof` |
| Authority | `#authority` |
| Next | `#next` |

Shorten labels if the sticky nav overcrowds on mobile (horizontal scroll already exists).

---

## Architecture / files

| Unit | Responsibility |
|---|---|
| `content.ts` | All marketing copy, vignette data, `formatRinggit` / `formatIsoDate`, claim-safe figures |
| `sections/hero.tsx` | Movement 1 director composition |
| `sections/decision-control.tsx` | Movement 2 |
| New or renamed failure section | Movement 3 |
| `sections/proof-ledger.tsx` | Movement 4 |
| `sections/authority-evidence.tsx` | Movement 5 |
| `sections/run-evidence.tsx` + `closing.tsx` | Movement 6 |
| `landing.tsx` | Order + skip link to `#main-content` |
| `styles.css` | Tokens, hero-specific utilities if needed; keep WIG a11y (focus-visible, safe-area, reduced motion) |
| `tests/marketing/*` | Content gates, landing render, capability claims |

Prefer editing existing sections over proliferating files. Add a dedicated failure section only if Movement 3 cannot fit cleanly into run-evidence.

---

## Testing

- Existing four content gates remain green
- Landing tests updated for new headline, CTA order, and absence of “finding” language on the revision vignette
- Assert illustrative labelling on hero proof
- No `RM` digit literals in section TSX
- Marketing suite + ultracite on touched files

## Non-goals

- SPA / app heads-up UI
- Fake metrics, marquee logos, floating dashboards
- Dark-mode marketing theme
- Claiming Release/Close certified without gate evaluation
- Using Inter or preview-only chrome in production

## Success criteria

1. First viewport communicates enforcement (not “something broke”).
2. Revision mismatch is named as a control / gate, never a finding.
3. A visitor can recite the miniature story: calculation changed → review invalid → approval blocked → release not yet available.
4. Rest of page continues the heads-up spine without reverting to generic SaaS feature grids.
5. Claim gates and WIG accessibility constraints hold.

## Implementation note

After this spec is approved, produce an implementation plan under `docs/superpowers/plans/` and execute task-by-task. Do not implement from this document alone without the plan.
