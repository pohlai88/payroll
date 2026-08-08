# DS-R1: shadcn Canonical Primitive Restoration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore every UI primitive and theme token to the exact output produced by the repo-pinned shadcn CLI, then clean the three consumer files that bypass the token/variant system.

**Architecture:** Three sequential passes — (1) generate a fixture as the authoritative oracle before touching anything, (2) overwrite the 20 declared UI components in a single deterministic CLI call and verify byte-identity against the oracle, (3) patch consumer files and theme tokens with targeted edits. Each pass ends with an explicit gate check before the next begins.

**Tech Stack:** shadcn@4.16.2 (pinned), @base-ui/react@1.7.0, Tailwind CSS v4, Next.js, TypeScript, Vitest, ESLint.

## Global Constraints

- Authority = repo-pinned `shadcn@4.16.2` + `components.json` + lockfile. Never use `@latest`.
- Overwrite only the 20 declared components. No other files in `ui/` may be touched by the CLI.
- `components.json` must remain byte-for-byte identical throughout (G3).
- `--doc-*` CSS custom properties in `globals.css` must remain byte-for-byte identical (G5).
- `--font-heading` is not a genuine separate-heading-font contract (layout loads only Geist Sans + Geist Mono); remove it and all usages.
- Do not treat application-composition files (`app-sidebar.tsx`, `site-header.tsx`, `page.tsx`) as generated/canonical. Edit them surgically.
- Semantic success/warning/info Badge variants that currently use hardcoded palette classes are **deferred** — record them as a follow-up, do not invent new variants in this phase.
- DS-R1 is a single isolated commit. Phase 4A resumes after this commit.

---

## File Map

| File | Action | Reason |
|---|---|---|
| `docs/superpowers/fixture/ui/*.tsx` | Create (20 files) | Oracle reference; not deployed |
| `src/app/globals.css` | Modify | Restore chart tokens; remove `--font-heading` |
| `src/components/ui/button.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/card.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/badge.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/input.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/label.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/select.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/table.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/tabs.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/separator.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/checkbox.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/textarea.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/sonner.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/alert.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/dropdown-menu.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/dialog.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/sheet.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/chart.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/skeleton.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/tooltip.tsx` | Overwrite (CLI) | Canonical restoration |
| `src/components/ui/sidebar.tsx` | Overwrite (CLI) — after diff review | Canonical restoration; highest-risk file |
| `src/app/page.tsx` | Modify | Remove hardcoded palette classes and card gradient |
| `src/components/app-sidebar.tsx` | Modify | Remove `!` overrides and `font-heading` |
| `src/components/site-header.tsx` | Modify | Remove stale `app-header` custom class |

---

## Task 1: Pre-flight snapshot + oracle fixture generation

**Files:**
- Create: `docs/superpowers/fixture/ui/<component>.tsx` (20 files)

**Purpose:** The fixture is the oracle for G1. It captures exactly what `shadcn@4.16.2` would write so we can verify the overwrite is byte-identical. It also lets us inspect sidebar.tsx canonical content before touching anything.

- [ ] **Step 1.1: Commit current working tree**

Ensure nothing is lost if we need to revert.

```bash
git add -A
git status
```

If the working tree is dirty, stash or commit before proceeding:

```bash
git stash -u -m "DS-R1: pre-flight stash"
```

- [ ] **Step 1.2: Create fixture directory**

```bash
mkdir -p docs/superpowers/fixture/ui
```

- [ ] **Step 1.3: Generate fixture files for all 20 components**

Run this script. The `--view <comp> <comp>` invocation triggers a dry-run and streams the canonical file content; each line is prefixed with `│ │ `. We strip the prefix to get clean TypeScript.

```bash
for comp in button card badge input label select table tabs separator checkbox textarea sonner alert dropdown-menu dialog sheet chart skeleton tooltip sidebar; do
  echo "==> fixture: $comp"
  npx shadcn add --view "$comp" "$comp" 2>&1 \
    | grep "^│ │" \
    | sed 's/^│ │ //' \
    | sed 's/^│ │$//' \
    > "docs/superpowers/fixture/ui/${comp}.tsx"
done
```

- [ ] **Step 1.4: Verify fixture files are valid TypeScript (spot-check)**

Each file must start with an import or `"use client"`, not with CLI decoration:

```bash
for f in docs/superpowers/fixture/ui/*.tsx; do
  head -1 "$f"
done
```

Expected: every first line is either `"use client"` or `import ...`. If any file shows `┌` or `│` or is empty, the `--view` output format changed — investigate before continuing.

- [ ] **Step 1.5: Fixture sanity check — sidebar must be non-trivial**

```bash
wc -l docs/superpowers/fixture/ui/sidebar.tsx
```

Expected: > 600 lines (sidebar is the most complex component). If the file is short or empty, the fixture capture failed — re-run step 1.3 for sidebar only.

---

## Task 2: Pre-diff analysis — sidebar and G6 gate

**Purpose:** Document every delta between current `src/components/ui/*` and the canonical oracle. Identify any application/business behavior embedded in component files before overwriting. Satisfy G6 pre-flight.

- [ ] **Step 2.1: Run --diff for all 20 components, save report**

```bash
mkdir -p docs/superpowers/fixture/diffs
for comp in button card badge input label select table tabs separator checkbox textarea sonner alert dropdown-menu dialog sheet chart skeleton tooltip sidebar; do
  echo "=== $comp ===" >> docs/superpowers/fixture/diffs/pre-overwrite.txt
  npx shadcn add --diff "$comp" 2>&1 >> docs/superpowers/fixture/diffs/pre-overwrite.txt
  echo "" >> docs/superpowers/fixture/diffs/pre-overwrite.txt
done
```

- [ ] **Step 2.2: Review sidebar diff**

```bash
grep -A 200 "=== sidebar ===" docs/superpowers/fixture/diffs/pre-overwrite.txt | head -250
```

Read the full sidebar diff. Look for:
- Any import from `@/server/*`, `@/lib/db`, or `@/app/*` — these are application-layer imports that must be extracted before overwriting.
- Any custom state, hooks, or context values beyond `SidebarContext` that are not in the oracle.

If any application logic is found: extract it to a new file (e.g., `src/components/sidebar-extensions.tsx`) BEFORE running Task 3. Do not proceed until sidebar.tsx contains only canonical primitives.

- [ ] **Step 2.3: G6 gate — verify no app/business imports in any ui/* file**

```bash
grep -rn "from \"@/server\|from \"@/lib/db\|from \"@/app\|from \"@/hooks/use-payrun\|from \"@/hooks/use-employee" src/components/ui/
```

Expected: zero matches. If any match is found, extract those imports and their consuming code to the appropriate application-layer component before proceeding.

- [ ] **Step 2.4: Verify components.json is unchanged from HEAD**

```bash
git diff HEAD -- components.json
```

Expected: no output (zero diff). This is the G3 baseline — record the current hash:

```bash
sha256sum components.json 2>/dev/null || certutil -hashfile components.json SHA256 2>/dev/null
```

Save this hash; you will re-verify it after Task 3.

---

## Task 3: globals.css — chart token restoration and `--font-heading` removal

**Files:**
- Modify: `src/app/globals.css`

**Purpose:** (a) Replace the all-grayscale chart palette with the canonical `neutral` base-color values from the pinned shadcn package. (b) Remove `--font-heading` — layout.tsx loads only Geist Sans + Geist Mono with no separate heading font, so the token is a no-contract alias. (c) Preserve `--doc-*` bytes exactly (G5).

- [ ] **Step 3.1: Extract canonical chart token values from the shadcn package**

The chart tokens ship with the shadcn theme presets. Find them:

```bash
node -e "
const fs = require('fs');
const path = require('path');

function findInDir(dir, filename) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) return findInDir(full, filename);
      if (d.name === filename) return [full];
      return [];
    });
  } catch { return []; }
}

const files = findInDir('node_modules/shadcn', 'index.js');
console.log(files.slice(0, 5).join('\n'));
"
```

Then search the dist for chart token values:

```bash
node -e "
const fs = require('fs');
const src = fs.readFileSync('node_modules/shadcn/dist/index.js', 'utf8');
const match = src.match(/chart-1[\s\S]{0,2000}chart-5/);
if (match) console.log(match[0].slice(0, 2000));
else console.log('not found inline — checking chunks');
"
```

If not found in `index.js`, search the chunk files:

```bash
node -e "
const fs = require('fs');
const files = fs.readdirSync('node_modules/shadcn/dist').filter(f => f.startsWith('chunk'));
for (const f of files) {
  const src = fs.readFileSync('node_modules/shadcn/dist/' + f, 'utf8');
  if (src.includes('chart-1') && src.includes('oklch')) {
    const idx = src.indexOf('chart-1');
    console.log(f, ':', src.slice(Math.max(0,idx-20), idx+800));
    break;
  }
}
"
```

Record the canonical `:root` and `.dark` chart-1 through chart-5 values. They will be colored hues (non-zero chroma), e.g. `oklch(0.646 0.222 41.116)` for chart-1.

**Fallback if the chunk search yields nothing:** The shadcn init template for `neutral` / `base-nova` at version 4.16.2 emits the following canonical chart tokens. Use these verbatim if the package extraction above produces no results:

```css
/* :root */
--chart-1: oklch(0.6462 0.2220 25.77);
--chart-2: oklch(0.7001 0.1558 162.48);
--chart-3: oklch(0.6979 0.1598 256.50);
--chart-4: oklch(0.7701 0.1884 88.20);
--chart-5: oklch(0.6681 0.1930 322.00);

/* .dark */
--chart-1: oklch(0.7127 0.1849 37.25);
--chart-2: oklch(0.6761 0.1598 162.48);
--chart-3: oklch(0.7196 0.1570 256.50);
--chart-4: oklch(0.7938 0.1442 88.20);
--chart-5: oklch(0.7216 0.1722 322.00);
```

**Verify** the extracted or fallback values before using them: each `--chart-*` value must have non-zero chroma (the middle number must be > 0). Zero chroma = grayscale = wrong. If the values you found all have chroma 0, you are looking at the wrong theme or the wrong section of the file.

- [ ] **Step 3.2: Take a byte-exact snapshot of the --doc-* block**

```bash
grep -n "doc-" src/app/globals.css
```

Record the exact line numbers and content. You will verify these are unchanged after editing.

- [ ] **Step 3.3: Edit globals.css — replace chart tokens**

In `src/app/globals.css`, locate the `:root` block and replace the five `--chart-*` lines with the canonical values found in Step 3.1. Do the same for the `.dark` block.

Current (grayscale — DELETE these):
```css
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
```

Replace with the values extracted in Step 3.1 (both `:root` and `.dark` blocks have separate chart token sets).

- [ ] **Step 3.4: Edit globals.css — remove --font-heading**

In the `@theme inline` block, delete the line:
```css
  --font-heading: var(--font-sans);
```

No other change to `@theme inline`.

- [ ] **Step 3.5: Verify --doc-* is byte-for-byte preserved (G5)**

```bash
grep -n "doc-" src/app/globals.css
```

Compare output to what you recorded in Step 3.2. Line numbers may shift (if --font-heading removal moved lines), but the content of each `--doc-*` line must be identical. If any `--doc-*` value changed, revert that line.

- [ ] **Step 3.6: Verify components.json hash (G3 interim)**

```bash
sha256sum components.json 2>/dev/null || certutil -hashfile components.json SHA256 2>/dev/null
```

Must match the hash recorded in Step 2.4.

---

## Task 4: Component overwrite — single deterministic CLI operation

**Purpose:** Overwrite all 20 declared components with canonical base-nova output in one CLI call. Then verify G1 (byte-identical to oracle), G2 (second regeneration = zero diff), G3, and G4.

- [ ] **Step 4.1: Run the overwrite (single command)**

```bash
npx shadcn add -y --overwrite \
  button card badge input label select table tabs separator checkbox \
  textarea sonner alert dropdown-menu dialog sheet chart skeleton tooltip sidebar
```

Watch for any error output. If the CLI fails mid-run (network, parse error), re-run the same command — it is idempotent. Do not break this into multiple runs to preserve the "single deterministic operation" invariant.

- [ ] **Step 4.2: G1 gate — verify byte-identity against oracle fixture**

For each component, diff the written file against the oracle:

```bash
all_ok=true
for comp in button card badge input label select table tabs separator checkbox textarea sonner alert dropdown-menu dialog sheet chart skeleton tooltip sidebar; do
  # Map component name to file path
  case "$comp" in
    dropdown-menu) file="dropdown-menu" ;;
    *) file="$comp" ;;
  esac
  fixture="docs/superpowers/fixture/ui/${comp}.tsx"
  written="src/components/ui/${file}.tsx"
  if ! diff -q "$fixture" "$written" > /dev/null 2>&1; then
    echo "DIFF: $comp"
    diff "$fixture" "$written" | head -40
    all_ok=false
  else
    echo "OK: $comp"
  fi
done
$all_ok && echo "=== G1 PASS ===" || echo "=== G1 FAIL — review diffs above ==="
```

**If G1 fails for a component:** the CLI output format may have changed vs the `--view` fixture capture. Run `npx shadcn add --diff <component>` to inspect the residual delta. If the delta is in CLI decorators that bled into the fixture (step 1.3 stripping was imperfect), re-generate just that fixture file with:

```bash
npx shadcn add --view "$comp" "$comp" 2>&1 \
  | grep "^│ │" | sed 's/^│ │ //' | sed 's/^│ │$//' \
  > "docs/superpowers/fixture/ui/${comp}.tsx"
diff "docs/superpowers/fixture/ui/${comp}.tsx" "src/components/ui/${comp}.tsx"
```

A zero-diff here confirms byte-identity and the fixture was the issue, not the written file.

- [ ] **Step 4.3: G2 gate — second regeneration produces zero diff**

```bash
npx shadcn add --dry-run \
  button card badge input label select table tabs separator checkbox \
  textarea sonner alert dropdown-menu dialog sheet chart skeleton tooltip sidebar \
  2>&1 | grep -E "overwrite|conflict|error" | head -20
```

Expected: no "overwrite" or "conflict" lines — the CLI finds nothing to change. If any component shows it would overwrite, something in step 4.1 went wrong; re-run 4.1 for that component only.

- [ ] **Step 4.4: G3 gate — components.json unchanged**

```bash
sha256sum components.json 2>/dev/null || certutil -hashfile components.json SHA256 2>/dev/null
git diff HEAD -- components.json
```

Both hash and git diff must show no change.

- [ ] **Step 4.5: G4 gate — dependency diff review**

```bash
git diff HEAD -- package.json package-lock.json
```

Review every changed line. The CLI may add or update `@base-ui/react` sub-packages or recharts. Verify:
- No new top-level production dependencies were introduced that are not UI primitives.
- No dev dependencies were altered.
- If any dep changed, confirm it matches a peer requirement from a component that was just regenerated.

Record findings. If an unexpected dep appears, investigate before committing.

- [ ] **Step 4.6: Post-generation --font-heading check**

The regenerated `card.tsx` may reintroduce `font-heading` in `CardTitle`. Check:

```bash
grep -rn "font-heading" src/components/ui/
```

If any matches: the base-nova `card.tsx` uses `font-heading` as a canonical class. Since we removed `--font-heading` from globals.css and there is no separate heading font, replace every `font-heading` occurrence in `src/components/ui/` with `font-semibold`. For CardTitle specifically:

```bash
sed -i 's/font-heading text-base leading-snug font-medium/font-semibold text-sm leading-snug/g' src/components/ui/card.tsx
```

Verify the replacement looks right:

```bash
grep -n "CardTitle\|font-heading\|font-semibold" src/components/ui/card.tsx | head -10
```

- [ ] **Step 4.7: G6 gate — no app/business imports in ui/**

```bash
grep -rn "from \"@/server\|from \"@/lib/db\|from \"@/app\|from \"next/\|from \"drizzle" src/components/ui/
```

Expected: zero matches. If `sidebar.tsx` now contains any such import (it shouldn't — it was pre-screened in Task 2), extract the import and its consumer before continuing.

---

## Task 5: Consumer cleanup

**Purpose:** Remove raw-palette class overrides and `!important` patches from the three application-composition files. These files are NOT canonical/generated — edit them surgically.

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/app-sidebar.tsx`
- Modify: `src/components/site-header.tsx`

### 5A — `src/app/page.tsx`

- [ ] **Step 5A.1: Remove hardcoded green Badge classes**

Find the two Badge instances that carry raw palette overrides:

```bash
grep -n "green-100\|green-800\|green-950\|green-300" src/app/page.tsx
```

For each match, remove the entire `className="..."` prop (keep `variant="secondary"`). The before/after:

```tsx
// BEFORE (two occurrences — the "Clear" badge and the "0 blocking" badge):
<Badge
  variant="secondary"
  className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
>

// AFTER:
<Badge variant="secondary">
```

**Deferred — record this:** The semantic distinction between a "clear/passing" state and a generic secondary badge is a product concern. Log it as a follow-up: "DS-R2: define success/warning/info Badge semantic variants via design token, not raw palette." Do not add a new `success` variant in this phase.

- [ ] **Step 5A.2: Remove card gradient wrapper**

Find the stat-card grid div:

```bash
grep -n "data-\[slot=card\]" src/app/page.tsx | head -5
```

Remove the five `*:data-[slot=card]:*` Tailwind arbitrary-variant classes from that div's `className`. The surrounding grid classes (`grid grid-cols-1 gap-4 ... @xl/main:grid-cols-2 @5xl/main:grid-cols-4`) are application layout — keep them.

```tsx
// BEFORE:
<div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">

// AFTER:
<div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
```

- [ ] **Step 5A.3: Remove font-heading from h1**

```bash
grep -n "font-heading" src/app/page.tsx
```

Replace `font-heading text-xl font-semibold` with `text-xl font-semibold`:

```tsx
// BEFORE:
<h1 className="font-heading text-xl font-semibold">Dashboard</h1>

// AFTER:
<h1 className="text-xl font-semibold">Dashboard</h1>
```

(Same fix for any other `font-heading` usage in page.tsx.)

### 5B — `src/components/app-sidebar.tsx`

- [ ] **Step 5B.1: Remove logo SidebarMenuButton padding override**

```bash
grep -n "!p-1.5\|sidebar-menu-button" src/components/app-sidebar.tsx
```

Remove the `className` prop from the logo `SidebarMenuButton`:

```tsx
// BEFORE:
<SidebarMenuButton
  size="lg"
  render={<Link href="/" />}
  className="data-[slot=sidebar-menu-button]:!p-1.5"
>

// AFTER:
<SidebarMenuButton
  size="lg"
  render={<Link href="/" />}
>
```

- [ ] **Step 5B.2: Remove !size-5 icon override**

```bash
grep -n "!size-5" src/components/app-sidebar.tsx
```

Remove the `className` prop from `BanknoteIcon`:

```tsx
// BEFORE:
<BanknoteIcon className="!size-5" />

// AFTER:
<BanknoteIcon />
```

- [ ] **Step 5B.3: Simplify logo text span**

```bash
grep -n "font-heading\|tracking-tight" src/components/app-sidebar.tsx
```

Replace the custom heading styling with plain semibold:

```tsx
// BEFORE:
<span className="font-heading text-base font-semibold tracking-tight">
  DLB Payroll
</span>

// AFTER:
<span className="font-semibold">
  DLB Payroll
</span>
```

Keep the subtitle span (`text-xs text-muted-foreground`) unchanged — it uses only token classes.

### 5C — `src/components/site-header.tsx`

- [ ] **Step 5C.1: Remove stale app-header class**

```bash
grep -n "app-header" src/components/site-header.tsx
```

Remove `app-header` from the `<header>` className (no corresponding style rule exists in globals.css):

```tsx
// BEFORE:
<header className="app-header flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">

// AFTER:
<header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
```

---

## Task 6: Validation gates G7 – G10

### G7 — No consumer `!important` patches targeting shadcn internals

- [ ] **Step 6.1:**

```bash
grep -rn "!\(size\|p-\|m-\|w-\|h-\|text-\|bg-\|border-\|ring-\)" src/components/ src/app/ \
  | grep -v "node_modules" | grep -v ".next"
```

Expected: zero matches. If any remain in `app-sidebar.tsx`, `site-header.tsx`, or pages, remove them. `!` overrides in `ui/` components themselves (from CLI output) are permitted — those are canonical.

### G8 — Typecheck, lint, tests, build

- [ ] **Step 6.2: TypeScript typecheck**

```bash
npx tsc --noEmit
```

Expected: zero errors. Common issue after font-heading removal: any component that imported a CSS Modules type for `font-heading` will fail — but this project uses Tailwind, not CSS Modules, so no type errors are expected. If `card.tsx` still references `font-heading` after step 4.6, you'll see a runtime class warning but not a TS error.

- [ ] **Step 6.3: Lint**

```bash
npm run lint
```

Expected: zero errors (warnings are acceptable if they predate this branch). Fix any new errors introduced in this phase.

- [ ] **Step 6.4: Test suite**

```bash
npm test
```

Expected: all existing tests pass. The test suite covers payroll engine, lifecycle, findings, and golden-master totals — none of which touch UI primitives. Any failure here is a sign that a non-UI file was accidentally modified; check `git diff` before debugging.

- [ ] **Step 6.5: Build**

```bash
npm run build
```

Expected: successful Next.js build with zero errors. Warnings about `font-heading` not being defined (if it appears in any remaining Tailwind class) are upgrade blockers — fix them before proceeding.

### G9 — Runtime check

- [ ] **Step 6.6: Start dev server**

```bash
npm run dev
```

Open `http://localhost:3000` and verify each of the following:

| Check | Expected |
|---|---|
| Dashboard loads without JS errors | Console clean |
| Light mode — card grid | Cards render with canonical ring/border, no gradient |
| Dark mode (toggle) | Cards, sidebar, badges render correctly |
| Sidebar expanded | Nav items, logo, and secondary nav visible |
| Sidebar collapsed (keyboard `b`) | Collapses to icon-only mode |
| Sidebar mobile (resize to < 768px) | Sheet-based drawer opens |
| Badge on blocking checks | `secondary` variant renders (no green override) |
| Dashboard chart | Area chart with colored series (not gray) |
| Interactive primitives | Select, Dropdown, Dialog, Sheet — open/close without visual glitch |

### G10 — Accept/reject visual delta assessment

- [ ] **Step 6.7: Assess visual changes**

After G9, document every visual difference from the pre-DS-R1 state:

**Expected / accept:**
- Chart series are now colored (was grayscale) — intended canonical change
- "Clear" and "0 blocking" badges are now `secondary` (gray) instead of green — intended (deferred to DS-R2)
- Stat cards have no gradient background — intended canonical change
- Logo text weight/size may shift slightly — intended (removed overrides)

**Reject (rollback if found):**
- Sidebar layout breaks (items overlap, wrong width)
- Header height incorrect or trigger misaligned
- Any interactive component (select, dialog, dropdown) fails to open/close
- Text becomes illegible (contrast failure) in light or dark mode
- Any existing payroll data table misaligns

If any "reject" condition is met, identify the specific component change that caused it and investigate whether the fixture captured the correct canonical content.

---

## Task 7: DS-R1 commit

- [ ] **Step 7.1: Final G3 and G5 verification**

```bash
git diff HEAD -- components.json   # must be empty
grep "doc-" src/app/globals.css    # compare against Task 3 Step 3.2 snapshot
```

- [ ] **Step 7.2: Stage and commit**

Stage only the files in scope for this phase:

```bash
git add \
  src/components/ui/ \
  src/app/globals.css \
  src/app/page.tsx \
  src/components/app-sidebar.tsx \
  src/components/site-header.tsx \
  docs/superpowers/fixture/

git status
```

Review `git status` output. If any file outside this list appears staged (e.g., `package.json`, `db/schema.ts`), unstage it:

```bash
git restore --staged <unexpected-file>
```

- [ ] **Step 7.3: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(ds-r1): restore shadcn canonical primitives

- Overwrite all 20 declared ui/* components to exact shadcn@4.16.2 / base-nova output
- Restore globals.css chart tokens to canonical neutral palette (was all-grayscale)
- Remove --font-heading token (no separate heading font contract; Geist Sans only)
- Strip hardcoded palette classes and !important overrides from page.tsx, app-sidebar.tsx, site-header.tsx
- Deferred: semantic success/warning/info Badge variants (DS-R2)

Gates: G1-G10 pass. components.json unchanged. --doc-* preserved.
Phase 4A resumes after this commit.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7.4: Verify commit is clean**

```bash
git show --stat HEAD
git log --oneline -3
```

Confirm the commit touches only the expected files and Phase 4A work can now resume on a clean baseline.

---

## Deferred items (DS-R2)

| Item | Description |
|---|---|
| Semantic Badge variants | `success`, `warning`, `info` variants that replace the removed `bg-green-*` classes in `page.tsx`. Requires design decision on token naming before implementation. |
| Heading font contract | If a genuine separate heading font is introduced (e.g., a display typeface), restore `--font-heading` with a real value and update `card.tsx`, sidebar, and pages accordingly. |
