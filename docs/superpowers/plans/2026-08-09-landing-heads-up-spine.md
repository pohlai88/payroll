# Landing Heads-Up Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the marketing landing narrative with the approved heads-up spine: Director Control Proof Hero, then Asks → Failure → Proof → Authority → Next/Act, without carrying obsolete golden-master or finding-vs-gate mismatches.

**Architecture:** Content-first rewrite in `src/marketing/content.ts`, then section recomposition under `src/marketing/sections/**`, wired by `landing.tsx`. Prefer rename/recompose over parallel files. Delete unreferenced sections.

**Tech Stack:** Vite + React marketing entry (`landing.html`), existing marketing CSS tokens, Vitest + Testing Library, Ultracite/Biome.

**Spec:** `docs/superpowers/specs/2026-08-09-landing-heads-up-spine-design.md`

## Global Constraints

- Scope: `landing.html` + `src/marketing/**` + `tests/marketing/**` only
- Primary CTA always `#asks`; skip link always `#main-content` ↔ `<main id="main-content">`
- Revision mismatch is a **gate prerequisite**, never called a “finding”
- Money via `formatSen` (canonical); `formatRinggit` may stay as `RM`+NBSP wrapper only
- PCB: approved HASiL method or verified source; unresolved ≠ zero
- Preserve existing mobile nav behavior (horizontal-scroll rail); do not add a hamburger for this redesign
- Narrative replacement: remove obsolete rendered claims, do not leave them “elsewhere on the page”
- No Inter; use Bricolage / Archivo / Plex Mono
- Amber only for the blocked control state / true ceiling binds

---

### Task 0: Current-code reconciliation matrix

**Files:**
- Create: `docs/superpowers/plans/2026-08-09-landing-heads-up-spine-reconciliation.md` (temporary working note; commit with Task 0)
- Read: all of `src/marketing/**`, `tests/marketing/**`

**Interfaces:**
- Consumes: approved design spec
- Produces: delete / retain / rename / rewrite table for every section file and every exported content symbol used in render

- [ ] **Step 1: Inventory sections and landing order**

List current `src/marketing/sections/*` and the order in `landing.tsx`. At plan authoring time the tree is already:

```text
Hero → DecisionControl → ProofLedger → AuthorityEvidence → RunEvidence → Closing
```

Confirm on disk; if any legacy Ledger/Method/Provenance/DrillDown files remain, mark **delete** once unreferenced.

- [ ] **Step 2: Inventory content exports**

For each export in `content.ts`, mark: retain / rewrite / remove-from-render / delete. Explicitly flag:

- `HERO` → rewrite
- `DECISION_CONTROLS` → retain shape; reconcile wording against runtime
- `RELEASE_EVIDENCE` golden-master sentence → keep only if secondary and clearly build-gate; remove from any primary/hero path
- Any roots/node-kind tallies if still exported → remove from render
- `PCB_NOTE` → retain (already matches HASiL-method boundary)
- `NAV_LINKS` → rewrite to spine anchors

- [ ] **Step 3: Write the reconciliation table**

Document format:

```markdown
| Path / symbol | Treatment | Destination movement |
|---|---|---|
| sections/hero.tsx | rewrite | 1 |
| ... | ... | ... |
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-09-landing-heads-up-spine-reconciliation.md
git commit -m "docs: marketing heads-up reconciliation matrix"
```

---

### Task 1: Content model for hero control proof + nav

**Files:**
- Modify: `src/marketing/content.ts`
- Modify: `tests/marketing/content-gates.test.ts`
- Modify: `tests/marketing/landing.test.tsx` (headline expectation only if you prefer failing-first here; otherwise Task 2)

**Interfaces:**
- Produces:
  - `HERO` with locked eyebrow/title/body
  - `CONTROL_PROOF` object for the hero vignette
  - `HERO_ASSURANCE` readonly string[] (three chips)
  - `NAV_LINKS` → `#control` `#asks` `#failure` `#proof` `#authority` `#next`

- [ ] **Step 1: Write failing content assertions**

Add to `tests/marketing/content-gates.test.ts`:

```ts
it("locks the heads-up enforcement headline", () => {
  expect(HERO.title).toBe(
    "Payroll does not move until the controls clear."
  );
  expect(HERO.body).toContain("revision checks");
  expect(HERO.body).toContain("unresolved findings");
});

it("models revision mismatch as a control, not a finding", () => {
  expect(CONTROL_PROOF.title).toBe("Approval cannot proceed.");
  expect(CONTROL_PROOF.kicker).toBe("Approval gate · revision control");
  expect(CONTROL_PROOF.invariant).toBe("reviewedRevision ≠ calcRevision");
  expect(CONTROL_PROOF.title.toLowerCase()).not.toContain("finding");
  expect(CONTROL_PROOF.body.toLowerCase()).not.toMatch(/\bfinding\b/);
});

it("points nav at the heads-up spine anchors", () => {
  expect(NAV_LINKS.map((l) => l.href)).toEqual([
    "#control",
    "#asks",
    "#failure",
    "#proof",
    "#authority",
    "#next",
  ]);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/marketing/content-gates.test.ts
```

Expected: FAIL on missing `CONTROL_PROOF` / old `HERO.title`.

- [ ] **Step 3: Implement content**

```ts
export const HERO = {
  eyebrow: "Payroll control",
  title: "Payroll does not move until the controls clear.",
  body: "Every run must clear its current revision checks and unresolved findings before it can move through review, approval or release.",
} as const;

export const CONTROL_PROOF = {
  label: "Control state",
  state: "Blocked",
  kicker: "Approval gate · revision control",
  title: "Approval cannot proceed.",
  body: "The calculation changed after review. The run must be reviewed again before approval can proceed.",
  invariant: "reviewedRevision ≠ calcRevision",
  stages: [
    { name: "Review", value: "Required again", tone: "teal" },
    { name: "Approval", value: "Blocked", tone: "amber" },
    { name: "Release", value: "Not yet available", tone: "dim" },
  ],
  foot: "Gate certification records the current calculation revision and statutory authority.",
  illustrative: "Illustrative control state",
} as const;

export const HERO_ASSURANCE = [
  "Revision-bound review",
  "Finding-led gates",
  "Auditable control passage",
] as const;

export const NAV_LINKS = [
  { href: "#control", label: "Control" },
  { href: "#asks", label: "Asks" },
  { href: "#failure", label: "Failure" },
  { href: "#proof", label: "Proof" },
  { href: "#authority", label: "Authority" },
  { href: "#next", label: "Next" },
] as const;
```

Reconcile `DECISION_CONTROLS` against runtime (gate issues + findings, revision bind, release preview). Keep labels if still accurate; rewrite any unsupported claim.

- [ ] **Step 4: Run content-gates — expect PASS**

```bash
npx vitest run tests/marketing/content-gates.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/marketing/content.ts tests/marketing/content-gates.test.ts
git commit -m "feat(marketing): heads-up content model and spine nav"
```

---

### Task 2: Director Control Proof Hero

**Files:**
- Modify: `src/marketing/sections/hero.tsx`
- Modify: `src/marketing/styles.css` (hero utilities if needed)
- Modify: `tests/marketing/landing.test.tsx`

**Interfaces:**
- Consumes: `HERO`, `CONTROL_PROOF`, `HERO_ASSURANCE`, `CtaLink`
- Produces: `<section id="control">` with h1 + proof board; no decision-control trust strip duplication required

- [ ] **Step 1: Write failing landing assertions**

```ts
it("renders one h1, carrying the enforcement promise", () => {
  render(<Landing />);
  const headings = screen.getAllByRole("heading", { level: 1 });
  expect(headings).toHaveLength(1);
  expect(headings[0]?.textContent).toBe(
    "Payroll does not move until the controls clear."
  );
});

it("links See how controls work to #asks", () => {
  render(<Landing />);
  expect(
    screen.getByRole("link", { name: /see how controls work/i })
  ).toHaveAttribute("href", "#asks");
});

it("shows revision control proof without calling it a finding", () => {
  render(<Landing />);
  expect(screen.getByText("Approval cannot proceed.")).toBeDefined();
  expect(screen.getByText("Approval gate · revision control")).toBeDefined();
  expect(screen.getByText("reviewedRevision ≠ calcRevision")).toBeDefined();
  expect(screen.queryByText(/1 finding prevents approval/i)).toBeNull();
});
```

Update or remove the old trust-strip expectation that required decision labels twice in the hero.

- [ ] **Step 2: Run landing tests — expect FAIL**

```bash
npx vitest run tests/marketing/landing.test.tsx
```

- [ ] **Step 3: Rewrite `hero.tsx`**

Implement director composition from the locked spec:

- `id="control"`
- Left copy + primary `CtaLink` to `#asks` (“See how controls work”) + secondary to `/`
- Right proof board from `CONTROL_PROOF`
- Footer assurance chips from `HERO_ASSURANCE` only (no repeating footer note)
- Amber only on Blocked
- `translate="no"` on invariant

- [ ] **Step 4: Run landing tests — expect PASS for hero assertions**

```bash
npx vitest run tests/marketing/landing.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/marketing/sections/hero.tsx src/marketing/styles.css tests/marketing/landing.test.tsx
git commit -m "feat(marketing): director control proof hero"
```

---

### Task 3: Movement 2 — `#asks`

**Files:**
- Modify: `src/marketing/sections/decision-control.tsx`
- Modify: `tests/marketing/landing.test.tsx` if needed

**Interfaces:**
- Consumes: `DECISION_CONTROLS`
- Produces: `<section id="asks">` (replace current `id="control"`)

- [ ] **Step 1: Failing test for `#asks`**

```ts
it("exposes the asks section for the primary CTA", () => {
  const { container } = render(<Landing />);
  expect(container.querySelector("#asks")).not.toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL if id still `control` on decision section**

- [ ] **Step 3: Set `id="asks"`, keep three-band layout, ensure copy still claim-safe**

- [ ] **Step 4: Run tests PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(marketing): decision control section as #asks"
```

---

### Task 4: Movement 3 — `#failure`

**Files:**
- Create: `src/marketing/sections/control-failure.tsx` (preferred) **or** carve from `run-evidence.tsx` if smaller
- Modify: `src/marketing/content.ts` — `CONTROL_FAILURE` vignette (finding-based, e.g. PCB unverified)
- Modify: `src/marketing/landing.tsx` — insert after DecisionControl
- Modify: tests

**Interfaces:**
- Produces: illustrative finding vignette; must use finding language here (allowed), never for revision mismatch

- [ ] **Step 1: Failing test**

```ts
it("shows a labelled illustrative control-failure beat", () => {
  render(<Landing />);
  expect(document.getElementById("failure")).not.toBeNull();
  expect(screen.getByText(/illustrative/i)).toBeDefined();
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement section + content**

Example content shape:

```ts
export const CONTROL_FAILURE = {
  eyebrow: "When a control fails",
  title: "Payroll stops at the gate that failed.",
  findingTitle: "1 blocking finding prevents approval.",
  code: "PCB_UNVERIFIED · BLOCKING · APPROVAL",
  body: "PCB has not been verified against an approved calculation method or verified source.",
  illustrative: "Illustrative finding · not customer data",
} as const;
```

Verify `PCB_UNVERIFIED` (or chosen code) exists in runtime findings vocabulary before shipping the string.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(marketing): control failure movement"
```

---

### Task 5: Movements 4–6 + closing

**Files:**
- Modify: `proof-ledger.tsx` → ensure `id="proof"`
- Modify: `authority-evidence.tsx` → `id="authority"`
- Modify: `run-evidence.tsx` → wrap or set `id="next"` on the section
- Modify: `closing.tsx` — heads-up restatement; Open the app primary; secondary `#asks`
- Modify: content `CLOSING` if needed
- Purge any primary-path golden-master / tally residue from rendered sections

- [ ] **Step 1: Tests for ids and closing CTA**

```ts
it("keeps every spine target present", () => {
  const { container } = render(<Landing />);
  for (const id of ["control", "asks", "failure", "proof", "authority", "next"]) {
    expect(container.querySelector(`#${id}`)).not.toBeNull();
  }
});

it("keeps skip link bound to main content", () => {
  render(<Landing />);
  expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
    "href",
    "#main-content"
  );
  expect(document.getElementById("main-content")).not.toBeNull();
});
```

- [ ] **Step 2: Implement id + closing updates; remove obsolete rendered claims**

- [ ] **Step 3: Residue grep (must be clean for primary narrative)**

```bash
rg -n "Every ringgit|37 verified|19 roots|11 node|1 finding prevents approval" src/marketing
```

Expected: no hits in section TSX / hero; golden master only if retained in explicitly secondary build-gate evidence and still accurate.

- [ ] **Step 4: Full marketing suite**

```bash
npx vitest run tests/marketing
npx ultracite check src/marketing tests/marketing
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(marketing): complete heads-up spine movements 4-6"
```

---

### Task 6: Final verification + landing

**Files:** none new

- [ ] **Step 1: Run marketing + typecheck**

```bash
npx vitest run tests/marketing
npx tsc --noEmit
```

- [ ] **Step 2: Manual smoke**

Open `/landing.html` — confirm director hero, `#asks` CTA, no finding language on revision proof, all nav anchors land below sticky nav (`scroll-margin`).

- [ ] **Step 3: Final commit if any fixups**

```bash
git commit -m "fix(marketing): heads-up spine verification follow-ups"
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Reconciliation pass first | Task 0 |
| Director hero + locked copy | Tasks 1–2 |
| `#asks` CTA / nav | Tasks 1–3 |
| Skip link contract | Task 5 |
| Failure finding vignette | Task 4 |
| Proof / authority / next | Task 5 |
| Narrative purge | Tasks 0, 5 |
| Claim gates / tests | Tasks 1–6 |

## Placeholder scan

None intentional. Failure finding code must be verified against runtime in Task 4 Step 3 before commit.
