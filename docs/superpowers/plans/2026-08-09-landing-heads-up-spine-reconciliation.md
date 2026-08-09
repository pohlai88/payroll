# Landing Heads-Up Spine — Current-Code Reconciliation Matrix

**Date:** 2026-08-09  
**Branch:** `phase2-persistence`  
**Spec:** `docs/superpowers/specs/2026-08-09-landing-heads-up-spine-design.md`  
**Plan:** `docs/superpowers/plans/2026-08-09-landing-heads-up-spine.md`

This document maps every current marketing section file and every exported content symbol to **delete / retain / rename / rewrite / remove-from-render** before implementation begins. Destination movement numbers follow the approved spine (1 = Control Proof Hero … 6 = Next + Act).

---

## Step 1 — Section inventory and `landing.tsx` order

### Confirmed on disk (`src/marketing/sections/`)

| File | Exported component | Current section `id` | Render order in `landing.tsx` |
|---|---|---|---|
| `hero.tsx` | `Hero` | *(none)* | 1 |
| `decision-control.tsx` | `DecisionControl` | `control` | 2 |
| `proof-ledger.tsx` | `ProofLedger` | `proof` | 3 |
| `authority-evidence.tsx` | `AuthorityEvidence` | `authority` | 4 |
| `run-evidence.tsx` | `RunEvidence` | `evidence` | 5 |
| `closing.tsx` | `Closing` | *(none)* | 6 |
| `site-nav.tsx` | `SiteNav` | — | *(before `<main>`)* |
| `site-footer.tsx` | `SiteFooter` | — | *(after `</main>`)* |

**Confirmed render sequence:**

```text
SiteNav → Hero → DecisionControl → ProofLedger → AuthorityEvidence → RunEvidence → Closing → SiteFooter
```

**Legacy section files:** No `Ledger`, `Method`, `Provenance`, or `DrillDown` section files remain on disk. Nothing to delete for legacy filenames.

**Spine gap:** Movement 3 (`#failure`) has no section file yet. `landing.tsx` must gain a failure section between DecisionControl and ProofLedger.

**Id drift vs spine (current → target):**

| Current anchor | Target anchor | Notes |
|---|---|---|
| *(hero has no id)* | `#control` on hero | `DecisionControl` currently owns `id="control"` — must move to hero |
| `#control` on DecisionControl | `#asks` | Primary CTA will target `#asks` |
| *(missing)* | `#failure` | New section required |
| `#proof` | `#proof` | Already correct |
| `#authority` | `#authority` | Already correct |
| `#evidence` on RunEvidence | `#next` | Nav label becomes “Next”; section id must follow |
| *(closing has no id)* | — | Closing remains final act inside Movement 6 narrative |

---

## Step 2 — Section and shell file treatments

| Path / symbol | Treatment | Destination movement |
|---|---|---|
| `sections/hero.tsx` | rewrite | 1 |
| `sections/decision-control.tsx` | rewrite | 2 |
| `sections/control-failure.tsx` | create | 3 |
| `sections/proof-ledger.tsx` | retain | 4 |
| `sections/authority-evidence.tsx` | retain | 5 |
| `sections/run-evidence.tsx` | rewrite | 6 |
| `sections/closing.tsx` | rewrite | 6 |
| `sections/site-nav.tsx` | rewrite | — |
| `sections/site-footer.tsx` | retain | — |
| `landing.tsx` | rewrite | — |
| `content.ts` | rewrite | — |
| `styles.css` | rewrite | 1 |
| `cta-link.tsx` | retain | — |
| `evidence-disclosure.tsx` | retain | 5 |
| `section-intro.tsx` | retain | 2–6 |
| `main.tsx` | retain | — |

### Section-level render changes (detail)

| File | What changes |
|---|---|
| `hero.tsx` | Replace split hero + RUN_FLOW rail + DECISION_CONTROLS trust strip with Director Control Proof Hero; add `id="control"`; primary CTA → `#asks`; proof board from new `CONTROL_PROOF`; assurance chips from new `HERO_ASSURANCE` |
| `decision-control.tsx` | Change `id="control"` → `id="asks"`; reconcile section intro copy to enforcement spine; keep three-band layout |
| `control-failure.tsx` | **New.** Issue-first failure beat with illustrative finding vignette (distinct from Movement 1 revision gate) |
| `proof-ledger.tsx` | Keep ledger composition; minor intro copy alignment only |
| `authority-evidence.tsx` | Keep lifecycle + disclosures; no structural change |
| `run-evidence.tsx` | Rename section id `evidence` → `next`; trim any primary-path residue; gates/severities/diff/reports stay |
| `closing.tsx` | Heads-up restatement; primary CTA Open the app; secondary → `#asks` |
| `site-nav.tsx` | Consume rewritten `NAV_LINKS` (six spine anchors) |

---

## Step 3 — Content export inventory

Every export from `src/marketing/content.ts`, with render usage as of this audit.

### Formatters and types

| Path / symbol | Treatment | Destination movement | Render today |
|---|---|---|---|
| `formatSen` | retain | 4, 6 | yes (`run-evidence`) |
| `formatRinggit` | retain | 4, 6 | yes (`proof-ledger`, `run-evidence`) |
| `formatIsoDate` | retain | 4, 5 | yes (`authority-evidence`) |
| `Source` (type) | retain | 5 | via `SOURCES` |
| `FigureKind` (type) | retain | 4 | via `LEDGER_EMPLOYEE` |
| `LedgerRow` (type) | retain | 4 | via `LEDGER_EMPLOYEE` |
| `DecisionControl` (type) | retain | 2 | via `DECISION_CONTROLS` |
| `Assurance` (type) | retain | 5 | via `AUTHORITY_CLAIMS` |
| `AuthorityStage` (type) | retain | 5 | via `AUTHORITY_STAGES` |
| `PackStatus` (type) | retain | 5 | via `PACK_STATUSES` |
| `GateCondition` (type) | retain | 6 | via `GATE_CONDITIONS` |
| `Severity` (type) | retain | 6 | via `SEVERITIES` |
| `DiffRow` (type) | retain | 6 | via `DIFF_ROWS` |
| `Report` (type) | retain | 6 | via `REPORTS` |

### Pack, scenario, and ledger data

| Path / symbol | Treatment | Destination movement | Render today |
|---|---|---|---|
| `RULE_PACK` | retain | 1, 4, footer | yes (`hero`, `proof-ledger`, `site-footer`) |
| `RESOLVABLE_PACK_STATUSES` | retain | — | **no** (test-only in `content-gates.test.ts`) |
| `SCENARIO` | retain | 4 | yes (`proof-ledger`) |
| `SOURCES` | retain | 5 | yes (`authority-evidence`) |
| `LEDGER_GROSS_SEN` | retain | 4 | yes (`proof-ledger`) |
| `LEDGER_NET_SEN` | retain | 4 | yes (`proof-ledger`) |
| `LEDGER_EMPLOYEE` | retain | 4, 6 | yes (`proof-ledger`; `DIFF_ROWS` derived) |
| `LEDGER_EMPLOYEE[].root` | remove-from-render | — | **no** (React `key` only; not a displayed roots/node-kind tally) |
| `PCB_NOTE` | retain | 4 | yes (`proof-ledger`) |

### Hero, controls, and navigation

| Path / symbol | Treatment | Destination movement | Render today |
|---|---|---|---|
| `HERO` | rewrite | 1 | yes (`hero`) — visibility/enforcement copy must become enforcement-first locked copy |
| `DECISION_CONTROLS` | retain (reconcile wording) | 2 | yes (`hero` trust strip **and** `decision-control`) — remove hero duplication |
| `NAV_LINKS` | rewrite | — | yes (`site-nav`) — four anchors today; spine requires six |
| `RUN_FLOW` | remove-from-render | — | yes (`hero` companion rail) — replaced by `CONTROL_PROOF` stages |
| `CONTROL_PROOF` | create | 1 | **no** (Task 1) |
| `HERO_ASSURANCE` | create | 1 | **no** (Task 1) |
| `CONTROL_FAILURE` | create | 3 | **no** (Task 4) |

### Authority and governance

| Path / symbol | Treatment | Destination movement | Render today |
|---|---|---|---|
| `AUTHORITY_STAGES` | retain | 5 | yes |
| `AUTHORITY_STATEMENT` | retain | 5 | yes |
| `AUTHORITY_CLAIMS` | retain | 5 | yes |
| `PACK_STATUSES` | retain | 5 | yes (disclosure) |
| `PACK_STATUS_NOTE` | retain | 5 | yes (disclosure) |

### Run evidence, closing, footer

| Path / symbol | Treatment | Destination movement | Render today |
|---|---|---|---|
| `GATE_CONDITIONS` | retain | 6 | yes (`run-evidence`) |
| `SEVERITIES` | retain | 6 | yes (`run-evidence`) |
| `RELEASE_STATEMENT` | retain | 6 | yes (`run-evidence`) |
| `RELEASE_EVIDENCE` | retain (secondary only) | — | **no** — golden-master sentence stays in `content.ts` for `capability.test.ts` gate 3; must not enter hero or any primary section render |
| `DIFF_ROWS` | retain | 6 | yes (`run-evidence`) |
| `ILLUSTRATIVE_DIFF_NOTE` | retain | 6 | yes (`run-evidence`) |
| `REPORTS` | retain | 6 | yes (`run-evidence`) |
| `CLOSING` | rewrite | 6 | yes (`closing`) — heads-up restatement; secondary CTA → `#asks` |
| `FOOTER_NOTE` | retain | — | yes (`site-footer`) |

---

## Explicit flags (from Task 0 brief)

| Item | Audit result |
|---|---|
| `HERO` → rewrite | Current title is visibility-first (“Know what blocks payroll…”). Must become enforcement-first locked copy per spec. |
| `DECISION_CONTROLS` → retain shape; reconcile wording | Three labels match runtime controls. Re-read `body` / `evidence` strings against gate evaluation, revision bind, and release preview before ship. Remove duplicate render from hero. |
| `RELEASE_EVIDENCE` golden-master sentence | **Not rendered today.** Retain in `content.ts` as secondary build-gate evidence for tests. Do not surface on hero or primary narrative path. |
| Roots / node-kind tallies | **No exported tally symbols** (e.g. “19 roots”, “11 node kinds”) in current `content.ts`. `LedgerRow.root` is an internal derivation key only — keep in data model; do not promote to rendered marketing copy. |
| `PCB_NOTE` → retain | Wording already matches HASiL-method boundary; no “never computes” / single-portal overclaim. |
| `NAV_LINKS` → rewrite | Current: `#control`, `#proof`, `#authority`, `#evidence`. Target: `#control`, `#asks`, `#failure`, `#proof`, `#authority`, `#next`. |

---

## Obsolete narrative residue (grep baseline)

Searched `src/marketing/**` at audit time:

| Pattern | Present in rendered sections? |
|---|---|
| Golden master | **No** in section TSX (only in `RELEASE_EVIDENCE` constant, not rendered) |
| “37 verified employees” / engineering tallies | **No** |
| “1 finding prevents approval” on revision vignette | **No** (revision proof does not exist yet) |
| Absolute “never computes PCB” | **No** (`PCB_NOTE` uses approved-method boundary) |
| Hero DECISION_CONTROLS duplication | **Yes** — trust strip repeats Movement 2 labels; remove with hero rewrite |
| RUN_FLOW “Evaluated” companion rail | **Yes** — remove with hero rewrite |

Post-implementation grep target (from plan Task 5):

```bash
rg -n "Every ringgit|37 verified|19 roots|11 node|1 finding prevents approval" src/marketing
```

---

## Target spine after implementation

```text
Movement 1  Hero (#control)              ← rewrite hero.tsx
Movement 2  DecisionControl (#asks)      ← id + copy
Movement 3  ControlFailure (#failure)    ← new section + CONTROL_FAILURE
Movement 4  ProofLedger (#proof)         ← retain
Movement 5  AuthorityEvidence (#authority) ← retain
Movement 6  RunEvidence (#next) + Closing ← id + closing rewrite
```

`landing.tsx` target order:

```text
Hero → DecisionControl → ControlFailure → ProofLedger → AuthorityEvidence → RunEvidence → Closing
```

Skip link contract (frozen): `<a href="#main-content">` ↔ `<main id="main-content">`.

---

## Test files touched by downstream tasks

| File | Expected updates |
|---|---|
| `tests/marketing/content-gates.test.ts` | New hero/control-proof/nav assertions; DECISION_CONTROLS reconciliation |
| `tests/marketing/landing.test.tsx` | Headline, `#asks` CTA, spine ids, revision-proof language, remove hero trust-strip expectation |
| `tests/marketing/capability.test.ts` | `landing.html` meta copy; golden-master gate unchanged if `RELEASE_EVIDENCE` stays non-rendered |

---

## Summary counts

| Treatment | Section/shell files | Content symbols |
|---|---|---|
| rewrite | 7 | 4 (`HERO`, `NAV_LINKS`, `CLOSING`, `content.ts` shell) |
| retain | 6 | 28 |
| create | 1 section + 3 symbols | 3 |
| remove-from-render | — | 2 (`RUN_FLOW`, hero-side `DECISION_CONTROLS`) |
| delete | 0 | 0 |

No files are marked **delete** at this stage; prefer rename/recompose over parallel replacements. Revisit **delete** only if a file becomes unreferenced after Tasks 2–5.
