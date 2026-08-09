# Landing Page Enterprise Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the marketing page around implemented payroll decision controls and raise its typography, hierarchy, spacing, and responsive layout to an enterprise-quality bar.

**Architecture:** Keep the isolated Vite marketing entry and governed `content.ts` data boundary. Replace the twelve-section dossier with eight focused React components that render seven visual movements. Tests enforce both factual claims and visual-system constraints before component work proceeds.

**Tech Stack:** React 19, TypeScript, Vite 6, Tailwind CSS 4, Fontsource, Vitest, Testing Library, Ultracite/Biome.

## Global Constraints

- Scope is limited to `landing.html`, `src/marketing/**`, marketing tests, and the landing design/plan documents.
- Do not modify `src/web/**` behavior or the payroll API.
- Primary promise: “Know what blocks payroll before it moves forward.”
- Do not claim recursive derivation drill-down, universal explainability release enforcement, certification of Release/Close, named-authority runtime diffs, statutory submission, bank acceptance, filing calendars, or automated PCB.
- Bricolage Grotesque is limited to major display text; Archivo handles operational headings/body; IBM Plex Mono handles data only.
- Supporting copy is at least 14px; metadata is at least 12px.
- Navy/white dominate; amber is restricted to actual blockers, bound ceilings, and changed values.
- Governed figures remain in `content.ts`; section components contain no monetary literals.
- Static evidence surfaces have no hover lift.
- Do not create a git commit unless the user explicitly requests one.

---

### Task 1: Correct the marketing claim model

**Files:**
- Modify: `src/marketing/content.ts`
- Modify: `tests/marketing/content-gates.test.ts`
- Modify: `tests/marketing/capability.test.ts`
- Modify: `tests/marketing/landing.test.tsx`

**Interfaces:**
- Consumes: existing governed `RULE_PACK`, `SCENARIO`, `LEDGER_EMPLOYEE`, gate/report data.
- Produces: `HERO`, `DECISION_CONTROLS`, corrected `RELEASE_STATEMENT`, `ILLUSTRATIVE_DIFF_NOTE`, and enterprise closing copy.

- [ ] **Step 1: Write failing claim-boundary tests**

Add assertions that the rendered/source marketing surface:

```ts
expect(marketing).not.toMatch(/keeps the derivation beside every figure/i);
expect(marketing).not.toMatch(/cannot be released.*explained/i);
expect(marketing).not.toMatch(/every passage certified/i);
expect(marketing).not.toMatch(/names the authority that caused/i);
expect(marketing).not.toMatch(/release ready/i);
```

Add positive assertions:

```ts
expect(HERO.title).toBe("Know what blocks payroll before it moves forward.");
expect(HERO.body).toContain("server-evaluated");
expect(HERO.body).toContain("calculation that was actually reviewed");
expect(ILLUSTRATIVE_DIFF_NOTE).toContain("Illustrative");
```

- [ ] **Step 2: Run the marketing tests and verify failure**

Run:

```bash
npx vitest run --project marketing
```

Expected: FAIL on the current hero, closing, certification, and diff wording.

- [ ] **Step 3: Replace unsupported content constants**

Create exact content structures:

```ts
export const HERO = {
  eyebrow: "Payroll decision control",
  title: "Know what blocks payroll before it moves forward.",
  body:
    "Server-evaluated findings and gate reasons show what needs attention before review, approval, release and close. Approval stays bound to the calculation that was actually reviewed.",
} as const;

export const DECISION_CONTROLS = [
  {
    index: "01",
    label: "Find the blocker",
    body: "Gate issues and findings show what must be resolved before the next decision.",
  },
  {
    index: "02",
    label: "Protect the decision",
    body: "Approval requires the reviewed revision to match the current calculation.",
  },
  {
    index: "03",
    label: "Control the release",
    body: "Release preview identifies eligible lines and explains every exclusion.",
  },
] as const;

export const ILLUSTRATIVE_DIFF_NOTE =
  "Illustrative effective-date comparison using governed values from the named rule pack. The current product compares linked runs; this example demonstrates how unchanged and changed rows remain visible.";

export const CLOSING = {
  headline:
    "Move payroll forward with the issues, revision and release conditions in view.",
  secondary:
    "Findings identify what needs attention. Revision checks protect what was reviewed. Release preview shows which payment lines can proceed.",
} as const;
```

Change run-control copy from “Every passage certified” to “Every decision evaluated server-side”. Limit certification language to Review and Approval.

- [ ] **Step 4: Run marketing tests**

Run:

```bash
npx vitest run --project marketing
```

Expected: existing content gates pass; new boundary assertions pass.

---

### Task 2: Establish the enterprise visual foundation

**Files:**
- Modify: `src/marketing/styles.css`
- Replace: `src/marketing/act-heading.tsx`
- Create: `src/marketing/section-intro.tsx`
- Create: `src/marketing/evidence-disclosure.tsx`
- Modify: `tests/marketing/capability.test.ts`

**Interfaces:**
- Produces: `SectionIntro`, `EvidenceDisclosure`, global marketing tokens/utilities.
- Consumers: all section components in Tasks 3–5.

- [ ] **Step 1: Add visual-system source tests**

Read all `src/marketing/**/*.tsx` sources and assert:

```ts
expect(marketing).not.toMatch(/text-\[0\.(6|7)rem\]/);
expect(marketing).not.toContain("lift");
```

Read `styles.css` and assert:

```ts
expect(styles).toContain("--content-max: 80rem");
expect(styles).toContain("--section-block:");
expect(styles).not.toContain("@utility lift");
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npx vitest run --project marketing
```

Expected: FAIL because the current page contains 0.6rem/0.7rem text and the `lift` utility.

- [ ] **Step 3: Rewrite visual tokens and base utilities**

In `styles.css`:

```css
:root {
  --navy: #13303f;
  --navy-2: #1a4053;
  --teal: #2f7d70;
  --teal-lift: #76bcae;
  --amber-fill: #fff3db;
  --amber-line: #c8901f;
  --amber-ink: #74480c;
  --slate: #2c3e4a;
  --meta: #5c6d7a;
  --hair: #dfe4e8;
  --ground: #ffffff;
  --ground-2: #f7f9fa;
  --blue-fill: #edf3f8;
  --mint-fill: #edf5f2;
  --content-max: 80rem;
  --section-block: clamp(4rem, 8vw, 7.5rem);
  --page-inline: clamp(1.5rem, 4vw, 3.5rem);
}

@utility page-shell {
  width: min(100%, var(--content-max));
  margin-inline: auto;
  padding-inline: var(--page-inline);
}

@utility section-space {
  padding-block: var(--section-block);
}
```

Remove `@utility lift`. Limit animation to one hero entrance and optional rule draw. Add `touch-action: manipulation` to links/buttons.

- [ ] **Step 4: Create shared primitives**

`SectionIntro`:

```tsx
interface SectionIntroProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly body?: string;
  readonly align?: "left" | "split";
}
```

It renders an Archivo eyebrow at 12px, a Bricolage H2 at responsive 40–52px, and an optional 16–18px body.

`EvidenceDisclosure`:

```tsx
interface EvidenceDisclosureProps {
  readonly label: string;
  readonly children: ReactNode;
}
```

It renders native `<details>`/`<summary>` with visible focus, a plus/minus marker, and printable expanded content.

- [ ] **Step 5: Remove `act-heading.tsx` and migrate imports**

Delete `src/marketing/act-heading.tsx` after all consumers use `SectionIntro`.

- [ ] **Step 6: Run tests and lint**

Run:

```bash
npx vitest run --project marketing
npx ultracite check src/marketing tests/marketing
```

Expected: PASS; no content text under 12px and no static lift utility.

---

### Task 3: Build navigation, hero, and decision-control movement

**Files:**
- Modify: `src/marketing/sections/site-nav.tsx`
- Modify: `src/marketing/sections/hero.tsx`
- Create: `src/marketing/sections/decision-control.tsx`
- Modify: `src/marketing/landing.tsx`
- Modify: `tests/marketing/landing.test.tsx`

**Interfaces:**
- Consumes: `HERO`, `RUN_FLOW`, `DECISION_CONTROLS`, `NAV_LINKS`.
- Produces: first-viewport operational narrative and `#control` target.

- [ ] **Step 1: Write failing render tests**

```tsx
render(<Landing />);
expect(
  screen.getByRole("heading", {
    level: 1,
    name: "Know what blocks payroll before it moves forward.",
  })
).toBeDefined();
expect(screen.getByText("Find the blocker")).toBeDefined();
expect(screen.getByText("Protect the decision")).toBeDefined();
expect(screen.getByText("Control the release")).toBeDefined();
expect(screen.getByRole("link", { name: "Control" }).getAttribute("href")).toBe(
  "#control"
);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npx vitest run --project marketing tests/marketing/landing.test.tsx
```

Expected: FAIL on the old hero and missing DecisionControl section.

- [ ] **Step 3: Rebuild `SiteNav`**

- 64px height.
- `page-shell` width.
- Archivo navigation labels; no mono rubric.
- Links: Control, Proof, Authority, Reports.
- Maintain keyboard focus and “Open the app” CTA.

- [ ] **Step 4: Rebuild `Hero`**

Use a 12-column layout:

```tsx
<section className="bg-navy text-white">
  <div className="page-shell grid min-h-[42rem] items-center gap-12 py-20 lg:grid-cols-12">
    <div className="lg:col-span-7">{/* eyebrow, H1, body, CTAs */}</div>
    <div className="lg:col-span-5">{/* runtime control rail */}</div>
  </div>
</section>
```

Render the real `RUN_FLOW`. Label Release and Close as evaluated gates; do not call them certified.

- [ ] **Step 5: Add `DecisionControl`**

Use three horizontal evidence bands, not equal cards. Alternate 5/7 and 7/5 text/data placement. Each band includes one index, one operator question, one supported answer, and one restrained evidence line.

- [ ] **Step 6: Wire `Landing`**

Order:

```tsx
<SiteNav />
<Hero />
<DecisionControl />
```

then Tasks 4–5 sections.

- [ ] **Step 7: Run tests and lint**

Run:

```bash
npx vitest run --project marketing
npx ultracite check src/marketing tests/marketing
```

Expected: PASS.

---

### Task 4: Recompose proof and authority evidence

**Files:**
- Replace: `src/marketing/sections/proof-tree.tsx` with `src/marketing/sections/proof-ledger.tsx`
- Replace: `src/marketing/sections/authority-lifecycle.tsx` with `src/marketing/sections/authority-evidence.tsx`
- Delete: `src/marketing/sections/assurance-strip.tsx`
- Delete: `src/marketing/sections/source-register.tsx`
- Modify: `src/marketing/landing.tsx`
- Modify: `tests/marketing/landing.test.tsx`

**Interfaces:**
- Consumes: governed scenario, ledger rows, PCB note, authority stages/claims/statuses/sources.
- Produces: `ProofLedger` and `AuthorityEvidence`.

- [ ] **Step 1: Extend render tests**

Assert:

```tsx
expect(screen.getByText("Illustrative employee-month")).toBeDefined();
expect(screen.getByText("LINDUNG 24 JAM")).toBeDefined();
expect(screen.getAllByText(/Opted in/i).length).toBeGreaterThan(0);
expect(screen.getByText(PCB_NOTE)).toBeDefined();
expect(screen.getByText(/= 538,620 sen/)).toBeDefined();
expect(screen.getByText("Source records and evidence")).toBeDefined();
expect(screen.getByText("Implementation statuses")).toBeDefined();
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
npx vitest run --project marketing tests/marketing/landing.test.tsx
```

Expected: FAIL on new disclosure labels and component composition.

- [ ] **Step 3: Build `ProofLedger`**

Desktop 5/7 split:

- Left: scenario metadata, gross, net, reconciliation.
- Right: five stacked ledger rows.

Each row:

```tsx
<li className="grid grid-cols-[1fr_auto] gap-x-6 border-b py-5">
  <div>{/* label, authority, rule note */}</div>
  <data className="font-mono tabular-nums">{/* amount */}</data>
</li>
```

Use amber borders/labels only for `ceilingBinds`. Use a dashed outline and explicit `External verified` label for PCB. No hover effects.

- [ ] **Step 4: Build `AuthorityEvidence`**

- Render `Source → Verify → Approve → Apply → Preserve` as one horizontal/vertical progression.
- Render the two date/governance invariants as large text, not cards.
- Put the source table in `EvidenceDisclosure` labelled “Source records and evidence”.
- Put status enum and note in `EvidenceDisclosure` labelled “Implementation statuses”.
- Replace “reproduced exactly” with “retains its authority identity”.

- [ ] **Step 5: Delete superseded components and update imports**

Remove `AssuranceStrip`, `SourceRegister`, `ProofTree`, and `AuthorityLifecycle` from `landing.tsx`.

- [ ] **Step 6: Run tests and lint**

Run:

```bash
npx vitest run --project marketing
npx ultracite check src/marketing tests/marketing
```

Expected: PASS.

---

### Task 5: Consolidate run evidence, reports, closing, and footer

**Files:**
- Replace: `src/marketing/sections/run-lifecycle.tsx` with `src/marketing/sections/run-evidence.tsx`
- Delete: `src/marketing/sections/rule-change-diff.tsx`
- Delete: `src/marketing/sections/audiences.tsx`
- Delete: `src/marketing/sections/outputs.tsx`
- Modify: `src/marketing/sections/closing.tsx`
- Modify: `src/marketing/sections/site-footer.tsx`
- Modify: `src/marketing/landing.tsx`
- Modify: `landing.html`
- Modify: `tests/marketing/landing.test.tsx`

**Interfaces:**
- Consumes: gate conditions, severities, illustrative diff rows, reports, corrected closing and footer copy.
- Produces: `RunEvidence`, corrected closing, final page metadata.

- [ ] **Step 1: Write failing render/metadata tests**

Assert:

```tsx
expect(screen.getByText("Every decision evaluated server-side.")).toBeDefined();
expect(
  screen.getByText("Illustrative effective-date comparison")
).toBeDefined();
for (const report of REPORTS) {
  expect(screen.getByText(report.title)).toBeDefined();
}
expect(
  screen.getByRole("heading", {
    name: "Move payroll forward with the issues, revision and release conditions in view.",
  })
).toBeDefined();
```

Read `landing.html` and assert its title/description contain the supported blocker/revision promise and no derivation claim.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npx vitest run --project marketing
```

Expected: FAIL on the old run, closing, and metadata copy.

- [ ] **Step 3: Build `RunEvidence`**

Use three internal subsections:

1. Gate evaluation and severities.
2. Illustrative effective-date comparison.
3. Implemented report list.

Gate heading:

```tsx
<h2>Every decision evaluated server-side.</h2>
```

Certification note:

```tsx
<p>
  Review and Approval record revision-bound certifications. Release and Close
  evaluate their applicable gate and checklist conditions.
</p>
```

The diff heading must include “Illustrative”. Remove any claim that runtime identifies the causing authority.

Render reports as one ruled list with purpose on the right, stacking on mobile.

- [ ] **Step 4: Rebuild closing and footer**

Use the corrected `CLOSING` constants. Flat navy, no repeated gradient. Keep one teal rule and one CTA.

Footer includes:

- Pack ID and effective date.
- No professional-advice substitution.
- No filing/transmission claim.
- Illustration disclosure.

- [ ] **Step 5: Update page metadata**

Title:

```html
<title>Clarity Payroll — know what blocks payroll before it moves forward</title>
```

Description:

```html
<meta
  name="description"
  content="Server-evaluated findings, revision-bound approval and line-level release controls for Malaysian payroll."
>
```

- [ ] **Step 6: Delete superseded components and update `Landing`**

Final order:

```tsx
<SiteNav />
<main>
  <Hero />
  <DecisionControl />
  <ProofLedger />
  <AuthorityEvidence />
  <RunEvidence />
  <Closing />
</main>
<SiteFooter />
```

- [ ] **Step 7: Run tests and lint**

Run:

```bash
npx vitest run --project marketing
npx ultracite check src/marketing tests/marketing landing.html
```

Expected: PASS.

---

### Task 6: Responsive, accessibility, and regression verification

**Files:**
- Modify as needed: `src/marketing/styles.css`
- Modify as needed: `src/marketing/**/*.tsx`
- Modify: `tests/marketing/landing.test.tsx`

**Interfaces:**
- Consumes: final page.
- Produces: verified enterprise-quality implementation.

- [ ] **Step 1: Add structural accessibility tests**

```tsx
expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
  "href",
  "#control"
);
expect(screen.getAllByRole("table")).toHaveLength(2);
expect(screen.getAllByRole("group").length).toBeGreaterThanOrEqual(2);
```

Use DOM APIs already available in the test project if `toHaveAttribute` matchers are not configured.

- [ ] **Step 2: Run all marketing tests**

Run:

```bash
npx vitest run --project marketing
```

Expected: PASS.

- [ ] **Step 3: Run targeted lint and typecheck**

Run:

```bash
npx ultracite check src/marketing tests/marketing landing.html
npx tsc --noEmit
```

Expected: no marketing diagnostics. If unrelated in-flight files fail typecheck, record their exact paths and separately run:

```bash
npx tsc --noEmit 2>&1 | rg "marketing|landing"
```

Expected: no matching marketing error.

- [ ] **Step 4: Build Vite entries**

Run:

```bash
npx vite build
```

Expected: both `index.html` and `landing.html` bundle successfully.

- [ ] **Step 5: Run non-database regression suites**

Run:

```bash
npx vitest run --project domain --project web --project marketing
```

Expected: all suites pass.

- [ ] **Step 6: Perform responsive review**

Inspect at:

- 375 × 812
- 768 × 1024
- 1280 × 800
- 1536 × 960

Check:

- Hero title does not orphan the final word.
- Control rail remains legible.
- Ledger amounts align and do not wrap.
- `<details>` summaries are keyboard-operable.
- Tables scroll within their containers on narrow screens.
- No explanatory text renders below 14px.
- Amber appears only on sanctioned evidence.
- Navigation CTA and skip link remain reachable.

- [ ] **Step 7: Review the final diff**

Run:

```bash
git diff -- landing.html src/marketing tests/marketing \
  docs/superpowers/specs/2026-08-09-landing-enterprise-refinement-design.md \
  docs/superpowers/plans/2026-08-09-landing-enterprise-refinement.md
```

Expected: only the approved marketing refinement, tests, and documentation.

Do not commit unless the user explicitly requests it.
