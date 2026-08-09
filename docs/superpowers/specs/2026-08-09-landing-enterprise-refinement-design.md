# Landing Page Enterprise Refinement — Design

**Date:** 2026-08-09  
**Status:** Approved for autonomous implementation  
**Scope:** `landing.html`, `src/marketing/**`, and marketing tests. The payroll SPA remains unchanged.

## Objective

Refine the implemented marketing page from a technically accurate governance dossier into an enterprise-quality product narrative for payroll managers.

The page must answer the operator's first question:

> **What blocks the next payroll decision, and what must I resolve before the run moves forward?**

Governance, provenance, and statutory authority remain essential, but they support that decision rather than lead the page.

## Runtime-derived doctrine

Marketing may claim only behavior that exists in the runtime product.

1. A capability must exist in `src/`.
2. Monetary illustrations must use governed values from `content.ts`.
3. CI and test controls must never be represented as runtime controls.
4. Authority claims require both governance eligibility and temporal applicability.
5. Operator-facing claims must distinguish stored engine provenance from UI behavior the operator can currently access.

### Claims supported by the runtime

- Control views and dialogs show server-evaluated gate issues before a run advances.
- Findings are scanned, assigned severities, acknowledged where permitted, and enforced at configured gates.
- Recalculation invalidates stale scan/review state.
- Approval requires the reviewed calculation revision to equal the current revision.
- Release preview returns line-level eligibility and exclusion reasons.
- Operators can hold, unhold, withdraw, release, settle, reconcile, distribute, and close.
- Runs pin rule-pack identity, content hash, engine version, and calculation/review/approval revisions.
- Payment Register, Statutory Summary, Exception Report, Annual Remuneration Summary, and bilingual payslips exist.

### Claims prohibited or narrowed

- Do not claim that recursive derivation drill-down is currently exposed in the SPA.
- Do not claim that release verifies complete explainability for every figure.
- Do not claim that all four gates are certified. Review and Approval are certified; Release and Close are evaluated.
- Do not present the illustrative rule-change table as a runtime workflow that names the causing authority.
- Do not imply one persisted “release ready” state.
- Do not imply statutory filing, authority transmission, bank submission or acceptance, automated PCB calculation, filing calendars, or submission-ready statutory formats.
- Do not present the golden master as a runtime control.

## Selected direction: Operational Control

Two alternatives were rejected:

- **Institutional Assurance:** credible, but repeats the current problem by asking operators to absorb governance architecture before receiving practical value.
- **Product Workflow:** concrete, but screenshots and UI simulations age quickly and can imply unsupported interaction.

Operational Control leads with server-evaluated decisions and uses governance evidence to establish why those decisions can be trusted.

## Narrative structure

Seven movements replace the current twelve-section dossier. Components may remain separated internally for maintainability, but the page should read as seven coherent visual movements.

### 1. Navigation

- Quiet, 64px sticky bar.
- Wordmark left.
- Links: Control, Proof, Authority, Reports.
- Primary CTA: “Open the app”.
- No oversized button or promotional announcement bar.

### 2. Hero — the operator decision

Primary headline:

> **Know what blocks payroll before it moves forward.**

Supporting copy:

> Server-evaluated findings and gate reasons show what needs attention before review, approval, release, and close. Approval stays bound to the calculation that was actually reviewed.

The visual companion is a control rail, not a dashboard screenshot:

`DRAFT → Review → REVIEWED → Approval → APPROVED → Release / Close → CLOSED`

Below the rail, three supported control statements:

- Gate issues are evaluated on the server.
- Recalculation invalidates stale review state.
- Release preview explains line-level exclusions.

The hero must not mention derivation drill-down or claim a universal release-readiness state.

### 3. Decision control — what the operator sees

Three asymmetric evidence bands replace the 2×2 pastel process grid:

1. **Find the blocker** — findings, severity, gate issues.
2. **Protect the decision** — reviewed revision must equal current calculation revision.
3. **Control the release** — eligible and excluded payment lines are returned by server preview.

These are product truths, not illustrative metrics. No fabricated counts or customer data.

### 4. Proof — one governed employee-month

Keep the verified RM6,500 illustrative employee-month and sen reconciliation.

Replace the five equal tiny cards with a two-column composition:

- Left: scenario, gross pay, and net pay.
- Right: a vertical deduction ledger with authority, amount, and concise rule note.

The hierarchy is:

1. Net result.
2. Deduction amount.
3. Deduction label.
4. Authority/reference.
5. Rule note.

SOCSO and EIS use amber only because the ceiling genuinely binds. SKBBK states “Opted in”. PCB uses a dashed boundary and `EXTERNAL VERIFIED`; it must say Clarity does not independently calculate PCB.

Reconciliation remains printed and tested:

`650,000 − (71,500 + 2,975 + 4,465 + 1,190 + 31,250) = 538,620 sen`

The section proves the content model and arithmetic. It does not imply that the current SPA exposes recursive drill-down.

### 5. Authority — why the controls can be trusted

Compress the current source register and authority lifecycle into one movement.

Primary public lifecycle:

`Source → Verify → Approve → Apply → Preserve`

Primary statement:

> Rules are sourced and approved before use, selected by payroll date, and preserved after replacement so historical calculations retain their authority identity.

Two concise invariants:

- Approval does not override effective dating.
- Effective means applicable to the payroll date, not newest.

The eight source records and exact internal status enum move into native `<details>` disclosures. They remain accessible and printable without dominating the narrative.

Use “retains its authority identity” rather than “can always be reproduced exactly on demand”, because the current SPA does not expose a reproduction workflow.

### 6. Run control and evidence outputs

Merge run lifecycle, illustrative diff, audiences, and report cards into one operational movement.

#### Gate behavior

- Show the four gates and their actual role.
- Say “evaluated server-side”, not “every passage certified”.
- Review and Approval may mention revision-bound certification.
- Severity treatments remain: BLOCKING, WARNING, REVIEW, INFO.

#### Change comparison

Label the table:

> **Illustrative effective-date comparison**

It may demonstrate that the SKBBK row changes while unchanged rows remain visible. It must not imply that the current runtime names the authority that caused every linked-run change.

#### Reports

Keep only the four implemented reports.

- Payment Register
- Statutory Summary
- Exception Report
- Annual Remuneration Summary

Present them as a restrained list with purpose labels, not four decorative cards and not submission artifacts.

### 7. Closing and footer

Replace the unsupported closing:

> “If a payroll figure cannot be explained, the run cannot be released.”

with:

> **Move payroll forward with the issues, revision, and release conditions in view.**

Secondary line:

> Findings identify what needs attention. Revision checks protect what was reviewed. Release preview shows which payment lines can proceed.

Footer retains the rule-pack identity and professional-boundary disclaimer.

## Visual system

### Color

Use an 80 / 15 / 5 distribution:

- 80% white, near-white, navy ink.
- 15% teal progression and authority accent.
- 5% amber for actual blockers, bound ceilings, and changed values.

Blue and mint are quiet section grounds only. Do not alternate them as card colors.

Remove repeated navy gradients. Use one flat navy hero surface and, at most, one restrained radial teal light.

### Typography

- **Major display:** Bricolage Grotesque, used only for H1, major H2s, and wordmark.
- **Operational headings and body:** Archivo.
- **Data:** IBM Plex Mono.

Rules:

- H1: 56–72px desktop, 40–46px mobile, weight 650–700, line height 0.98–1.04.
- Major H2: 40–52px desktop, 32–38px mobile.
- Body lead: 18px / 30px.
- Body: 16px / 26px.
- Supporting copy: minimum 14px.
- Metadata: minimum 12px.
- Remove 0.6rem and 0.7rem content text.
- Mono is for data, not explanatory sentences.
- Uppercase tracking is limited to short labels.

### Layout

- Maximum content width: 1280px.
- Standard horizontal padding: 24px mobile, 40px tablet, 56px desktop.
- Standard section rhythm: 88–120px desktop, 64–80px mobile.
- Use a 12-column desktop grid.
- Use intentional asymmetry: 7/5 or 5/7 splits.
- Avoid equal-card grids except where semantic equality is real.
- Tables use comfortable row heights and sticky/clear headers where useful.
- Mobile sequences follow decision order; they are not merely collapsed desktop grids.

### Geometry and depth

- Radius range: 6–10px.
- One-pixel hairlines.
- Shadows only for sticky navigation or genuinely elevated interactive surfaces.
- Evidence panels remain flat.
- Hover motion applies only to links and buttons, not static proof cards.

### Motion

- One restrained hero entrance.
- Optional section-rule reveal.
- No repeated card lift.
- Animate only opacity and transform.
- Respect `prefers-reduced-motion`.

## Accessibility

- WCAG AA contrast for normal text.
- Visible `:focus-visible` treatment.
- One H1 and ordered heading hierarchy.
- Skip link to the first decision/proof section.
- Native links and buttons.
- `translate="no"` for statutory identifiers.
- Table captions and row/column headers.
- Native `<details>/<summary>` for supporting evidence.
- No essential meaning carried by color alone.

## Component architecture

Target composition:

1. `SiteNav`
2. `Hero`
3. `DecisionControl`
4. `ProofLedger`
5. `AuthorityEvidence`
6. `RunEvidence`
7. `Closing`
8. `SiteFooter`

`content.ts` remains the only source for governed figures and claims. Layout components render data; they do not contain monetary literals.

Shared primitives should be limited to:

- `SectionIntro`
- `DataLabel`
- `AuthorityChip`
- `EvidenceDisclosure`

Avoid a generic Card component. The design depends on section-specific composition.

## Testing

Retain and update the existing marketing content gates:

- Sen reconciliation.
- Provenance refs exist.
- Only the real ceiling rows use amber.
- PCB remains externally verified.
- SKBBK opt-in status is explicit.
- Pack governance and date applicability.
- Implemented reports only.
- No monetary literals in section components.

Add claim tests:

- Hero contains no derivation-drill-down claim.
- Closing contains no universal explainability release claim.
- Gate copy distinguishes evaluation from certification.
- Rule-change comparison is labelled illustrative.
- No submission, bank-acceptance, or automated-PCB language.

Add visual-quality checks where practical:

- No content text classes below 12px.
- No static evidence component uses hover lift.
- Only sanctioned components use amber tokens.

Verify at 375px, 768px, 1280px, and 1536px.

## Success criteria

The refinement is successful when:

- A payroll manager can identify the product’s supported operational value within the first viewport.
- The page reads as an enterprise product, not an architecture document or compliance-themed card gallery.
- Every primary claim maps to current runtime behavior.
- Supporting governance evidence remains available without dominating the page.
- Typography remains readable at normal viewing distance.
- Mobile preserves the operator decision sequence.
- Existing marketing content-gate tests remain green and the new claim tests pass.

## Out of scope

- Changes to `src/web/**` product behavior.
- Implementing derivation drill-down.
- Adding a unified release-readiness state.
- Filing calendars or deadline alerts.
- Statutory or bank submission.
- New report types.
- Customer testimonials, invented metrics, or fabricated screenshots.
