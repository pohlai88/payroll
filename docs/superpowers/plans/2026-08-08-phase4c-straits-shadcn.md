# Phase 4C — Straits / shadcn Vite foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install Studio-selected shadcn primitives via a pinned CLI on the existing Vite SPA, project the Straits token contract into CSS, and restyle only shipped 4A/4B surfaces — presentation only.

**Architecture:** Studio selects what to install; `npx shadcn@<exact>` installs into `src/components/ui` + Tailwind v4; Straits doctrine owns `:root` / `.dark` / `--doc-*` values; `@theme inline` only re-exports semantics; `src/web` remains the consumer. No product chrome, no auth/import behaviour changes.

**Tech Stack:** Vite 6, React 19, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn CLI (pinned exact version at Task 1), shadcn Studio MCP, Ultracite/Biome, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-08-phase4c-straits-shadcn-design.md`](../specs/2026-08-08-phase4c-straits-shadcn-design.md) (ACCEPTED / FROZEN)

## Global Constraints

- Studio selects; pinned CLI installs; Straits decides what may remain; repo owns accepted source.
- Studio and shadcn are generation inputs, not continuing runtime authorities.
- Straits precedence: `docs/palette/README.md` → `straits-document-palette.json` → app CSS → generated component styles.
- No `@latest` after pin; every install uses `npx shadcn@<PINNED_VERSION>`.
- Oversized generation vs inspected proposal = **stop**, not cleanup.
- `shadcn apply` / broad theme rewrite = reviewed migration step, not casual install.
- No discretionary visual/refactor edits to generated primitives; only attributable integration (compile / Vite / a11y / Straits map).
- No raw hex or Tailwind palette utilities in `src/web/**` or repo-owned edits under `src/components/ui/**` (token CSS may hold Straits literals).
- `--doc-*`: emit only canonical print values; reserve undocumented names; never invent placeholders; never redefine under `.dark`.
- Behavior-diff guard: auth/API/import contracts unchanged unless strictly required for presentation and individually justified.
- No `/cui` shell/chrome, Storybook, token TS package, theme-provider architecture, component registry, or visual snapshot suite.
- Hard gates: Section 3 thirteen-point gate + `npm run typecheck` + `npm test` + `npm run check` + `npm run build`.
- Do not invent UI solely to demonstrate unused tokens (section tints may be registered unused).

---

## File map

| Path | Role |
|---|---|
| `docs/superpowers/evidence/2026-08-08-phase4c-cli.md` | Pinned CLI version, Studio selection, inspect evidence |
| `components.json` | shadcn aliases (`@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`) |
| `vite.config.ts` | Add `@tailwindcss/vite` plugin (keep `@` → `src`) |
| `package.json` / lockfile | Tailwind v4, `@tailwindcss/vite`, class-variance-authority, clsx, tailwind-merge, lucide-react, `@base-ui/react` (or whatever pinned CLI installs) |
| `src/web/styles.css` | Tokenized entry: Tailwind imports + Straits `:root` / `.dark` / `--doc-*` / `@theme inline` |
| `src/lib/utils.ts` | `cn()` helper from shadcn |
| `src/components/ui/*` | Generated primitives only |
| `src/hooks/` | Alias root if CLI expects it (may be empty) |
| `src/web/app.tsx` | Presentation restyle + minimal light/dark class toggle |
| `src/web/employee-import-panel.tsx` | Presentation restyle |
| `src/web/main.tsx` | Keep CSS import; no behaviour change |
| `tests/domain/straits-tokens.test.ts` | Machine gate for token CSS contract |
| `tests/domain/web-palette-leak.test.ts` | No raw palette in `src/web` |
| `README.md` | Phase 4C foundation complete wording |
| Spec status line | Remains FROZEN until implementation marks Implemented |

---

### Task 1: Pin CLI, Studio selection, evidence file

**Files:**
- Create: `docs/superpowers/evidence/2026-08-08-phase4c-cli.md`
- Modify: none of runtime code yet

**Interfaces:**
- Consumes: shadcn Studio MCP (`get-create-instructions` / `get-refine-instructions` / `get-blocks-metadata` / `install-theme` / component meta tools as applicable)
- Produces: `PINNED_VERSION` string and approved install command list recorded in evidence file

- [ ] **Step 1: Confirm clean baseline for the design-system worktree area**

Run:

```bash
git status --short
```

Expected: note existing dirty tree if any; do **not** mix unrelated dirty files into 4C commits. Stage narrowly for every later commit.

- [ ] **Step 2: Authenticate / repair Studio MCP if tools fail**

If `user-shadcn-studio-mcp` is in error/`needsAuth`, authenticate via its `mcp_auth` tool and re-discover tools. **Stop** if Studio cannot list/select components — do not invent names.

- [ ] **Step 3: Resolve exact CLI version**

Run:

```bash
npm view shadcn version
```

Record the returned semver as `PINNED_VERSION` (example shape `x.y.z`). Do not use `@latest` in subsequent commands.

Also record:

```bash
npx shadcn@PINNED_VERSION --version
```

- [ ] **Step 4: Studio selection (primitives only — no `/cui` chrome)**

Using Studio MCP, select the **minimum** set required by shipped surfaces:

Required for 4A/4B markup:

- `button`
- `input`
- `label`
- `card`
- `alert`
- `table`
- `badge`

Optional only if Studio theme install mandates them as peers (record why): `separator`, `sonner` — otherwise skip.

Theme: prefer Studio theme/preset selection that yields CSS variables inspectable before write. If Studio suggests `shadcn apply`, treat as migration — record command separately and require human checkpoint before execution.

Write evidence file:

```markdown
# Phase 4C CLI / Studio evidence

## Pinned CLI

- Resolved from `npm view shadcn version` at <ISO-UTC>: `PINNED_VERSION=<x.y.z>`
- Verify command: `npx shadcn@<x.y.z> --version`

## Studio selection

- Theme/preset: <name or "none — tokens only via Straits">
- Components: button, input, label, card, alert, table, badge
- Rejected / deferred: sidebar, dashboard, /cui blocks

## Commands to execute later

```text
npx shadcn@<x.y.z> init ...
npx shadcn@<x.y.z> add button input label card alert table badge
```

## Inspect notes

- Proposal captured: <path or paste>
- Actual diff vs proposal: <filled in Task 3/4>
```

- [ ] **Step 5: Commit evidence scaffold**

```bash
git add docs/superpowers/evidence/2026-08-08-phase4c-cli.md
git commit -m "docs: record Phase 4C pinned shadcn CLI and Studio selection"
```

---

### Task 2: Tailwind v4 + shadcn init on existing Vite app

**Files:**
- Modify: `vite.config.ts`, `package.json`, `package-lock.json`, `src/web/styles.css` (temporary Tailwind import only — full Straits in Task 3)
- Create: `components.json`, `src/lib/utils.ts` (via CLI), possibly `src/components/ui` scaffolding

**Interfaces:**
- Consumes: `PINNED_VERSION` from evidence
- Produces: working Tailwind pipeline + `components.json` aliases matching `@/*` → `./src/*`

- [ ] **Step 1: Add Tailwind v4 Vite plugin deps**

Run:

```bash
npm install tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Wire Vite plugin**

Replace `vite.config.ts` with:

```ts
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    port: 5173,
  },
});
```

Confirm `tsconfig.json` already has `"paths": { "@/*": ["src/*"] }` (it does). Do not introduce `#` imports.

- [ ] **Step 3: Minimal CSS entry for Tailwind**

At the top of `src/web/styles.css`, add (keep temporary plain rules until Task 3 replaces them):

```css
@import "tailwindcss";
```

- [ ] **Step 4: Clean-diff checkpoint, then pinned init**

Run:

```bash
git status --short
```

Then inspect (use flags available on pinned CLI; if a flag is missing, capture `--help` and use the closest inspect mode):

```bash
npx shadcn@PINNED_VERSION init --help
```

Execute init for **existing** Vite project (non-interactive flags preferred). Align answers with:

- style: whatever Studio selected (record in evidence); prefer `base-nova` if Studio offers it and matches prior art
- base color: neutral (will be overwritten by Straits in Task 3)
- CSS file: `src/web/styles.css`
- aliases: `@/components`, `@/lib/utils`, `@/hooks`
- RSC: no

Example shape (adjust to actual pinned CLI flags after `--help`):

```bash
npx shadcn@PINNED_VERSION init -y
```

If interactive prompts remain, answer to match `components.json` targets:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "<studio-selected>",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/web/styles.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 5: Inspect actual init diff; stop if scope explodes**

Run:

```bash
git status --short
git diff --stat
```

Acceptable: `components.json`, `src/lib/utils.ts`, CSS imports (`tw-animate-css` / shadcn CSS / dark variant if generated), dependency adds.

**Stop** if init adds sidebar app shell, Next.js files, or rewrites `src/web/app.tsx` / API / auth modules.

Update evidence file with actual files touched.

- [ ] **Step 6: Verify build still resolves CSS**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both succeed (pages may still look plain).

- [ ] **Step 7: Commit toolchain**

```bash
git add components.json vite.config.ts package.json package-lock.json src/lib/utils.ts src/web/styles.css docs/superpowers/evidence/2026-08-08-phase4c-cli.md
git add src/hooks 2>nul
git commit -m "chore: bootstrap Tailwind v4 and pinned shadcn init for Phase 4C"
```

---

### Task 3: Straits token projection + machine-checkable gate tests

**Files:**
- Modify: `src/web/styles.css` (authoritative Straits projection)
- Create: `tests/domain/straits-tokens.test.ts`
- Create: `docs/palette/doc-tokens-reserved.md` (only if any reserved names need listing; otherwise a short reserved list in the test file comments is enough)

**Interfaces:**
- Consumes: `docs/palette/straits-document-palette.json`, `docs/palette/printing.md`, palette README dark surfaces
- Produces: CSS custom properties consumed by `@theme inline` and later components

- [ ] **Step 1: Write failing gate tests**

Create `tests/domain/straits-tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cssPath = resolve("src/web/styles.css");
const css = () => readFileSync(cssPath, "utf8");

const APP_TOKENS = [
  "--background",
  "--foreground",
  "--card",
  "--popover",
  "--primary",
  "--ring",
  "--accent",
  "--destructive",
  "--border",
  "--input",
  "--muted",
  "--secondary",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
] as const;

const STATUS = ["ok", "info", "warn", "bad", "neutral"] as const;
const SECTIONS = ["earning", "deduction", "employer", "summary"] as const;

const DOC_EMITTED = [
  "--doc-ink",
  "--doc-ink-secondary",
  "--doc-ink-heading",
  "--doc-ink-brand",
  "--doc-ink-disabled",
  "--doc-rule-hairline",
  "--doc-rule-standard",
  "--doc-rule-emphasis",
  "--doc-rule-total",
  "--doc-fill-header",
  "--doc-fill-zebra",
  "--doc-fill-subtotal",
  "--doc-section-earning-fill",
  "--doc-section-earning-ink",
  "--doc-section-deduction-fill",
  "--doc-section-deduction-ink",
  "--doc-section-employer-fill",
  "--doc-section-employer-ink",
  "--doc-section-summary-fill",
  "--doc-section-summary-ink",
] as const;

/** grand_total fill is null in JSON — must not be fabricated */
const DOC_RESERVED_FORBIDDEN = ["--doc-fill-grand-total"] as const;

describe("Straits token CSS contract", () => {
  it("declares app semantic tokens on :root", () => {
    const text = css();
    for (const token of APP_TOKENS) {
      expect(text, token).toMatch(new RegExp(`${token}\\s*:`));
    }
  });

  it("declares status and section families", () => {
    const text = css();
    for (const tone of STATUS) {
      expect(text).toMatch(new RegExp(`--status-${tone}-ink\\s*:`));
      expect(text).toMatch(new RegExp(`--status-${tone}-fill\\s*:`));
    }
    for (const section of SECTIONS) {
      expect(text).toMatch(new RegExp(`--section-${section}-fill\\s*:`));
      expect(text).toMatch(new RegExp(`--section-${section}-ink\\s*:`));
    }
  });

  it("emits only canonical --doc-* tokens", () => {
    const text = css();
    for (const token of DOC_EMITTED) {
      expect(text, token).toMatch(new RegExp(`${token}\\s*:`));
    }
    for (const token of DOC_RESERVED_FORBIDDEN) {
      expect(text.includes(`${token}:`), token).toBe(false);
    }
  });

  it("does not redefine --doc-* under .dark", () => {
    const text = css();
    const darkBlocks = [...text.matchAll(/\.dark\s*\{([\s\S]*?)\}/g)].map(
      (match) => match[1] ?? ""
    );
    expect(darkBlocks.length).toBeGreaterThan(0);
    for (const block of darkBlocks) {
      expect(block.includes("--doc-")).toBe(false);
    }
  });

  it("maps @theme inline colours through var() aliases", () => {
    const text = css();
    expect(text).toMatch(/@theme\s+inline/);
    expect(text).toMatch(/--color-background\s*:\s*var\(--background\)/);
    expect(text).toMatch(/--color-primary\s*:\s*var\(--primary\)/);
    // no duplicated brand hex inside @theme for primary
    const theme = text.split("@theme")[1] ?? "";
    expect(theme.toLowerCase()).not.toMatch(/#14324a/);
  });

  it("projects known Straits literals for primary and doc-ink", () => {
    const text = css();
    expect(text).toMatch(/--primary\s*:\s*#14324a/i);
    expect(text).toMatch(/--doc-ink\s*:\s*#26333d/i);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- tests/domain/straits-tokens.test.ts
```

Expected: FAIL (tokens not projected yet).

- [ ] **Step 3: Project Straits into `src/web/styles.css`**

Replace the Phase 4A Georgia demo theme. Keep generated support imports from Task 2 (`@import "tailwindcss"`, animate/shadcn/dark variant as required). Then add Straits values.

**Light `:root` (authoritative):**

| Token | Value |
|---|---|
| `--background` | `#ffffff` |
| `--foreground` | `#26333d` |
| `--card`, `--popover` | `#fbfcfd` |
| `--primary` | `#14324a` |
| `--primary-foreground` | `#fbfcfd` |
| `--ring`, `--accent` | `#2e7d7a` |
| `--accent-foreground` | `#fbfcfd` |
| `--destructive` | `#a34141` |
| `--border`, `--input` | `#d7dee5` |
| `--muted`, `--secondary` | `#f3f5f7` (`screen_reference.subtotal_row`) |
| `--muted-foreground` | `#66737e` |
| `--chart-1..5` | `#00736f`, `#bc671f`, `#36397b`, `#676f2d`, `#7d8ea1` |
| `--section-earning-fill/ink` | `#eaf1f7` / `#114a65` |
| `--section-deduction-fill/ink` | `#f7e7c6` / `#7c4e01` |
| `--section-employer-fill/ink` | `#e4efee` / `#1f5a58` |
| `--section-summary-fill/ink` | `#e6ebf0` / `#14324a` |
| `--status-ok-ink/fill` | `#27603e` / `#d8e5db` |
| `--status-info-ink/fill` | `#114a65` / `#d2e4ee` |
| `--status-warn-ink/fill` | `#7c4e01` / `#f2e0b9` |
| `--status-bad-ink/fill` | `#8b3334` / `#f2dcdd` |
| `--status-neutral-ink/fill` | `#66737e` / `#eff2f6` |

**Dark `.dark` (semantic remap only — from palette README surfaces):**

| Token | Value |
|---|---|
| `--background` | `#10181f` |
| `--card`, `--popover` | `#16212b` |
| `--foreground` | `#fbfcfd` |
| `--primary` | `#8eb4c9` (lightened navy family for contrast on dark) |
| `--ring`, `--accent` | `#4aa8a4` (lightened teal) |
| `--destructive` | `#d17a7a` (lightened clay) |
| `--border`, `--input` | `#2a3844` |
| `--muted`, `--secondary` | `#1a2430` |
| `--muted-foreground` | `#a8b3bd` |
| status fills/inks | lighten fills slightly; keep ink distinguishable on `#10181f` — record final hexes in CSS comments citing “Straits dark remap” |

**`--doc-*` (print values from `printing.md` / JSON — light-only, outside `.dark`):**

Emit exactly `DOC_EMITTED` from Step 1. Values:

| Token | Hex |
|---|---|
| `--doc-ink` | `#26333d` |
| `--doc-ink-secondary` | `#66737e` |
| `--doc-ink-heading` | `#14324a` |
| `--doc-ink-brand` | `#2e7d7a` |
| `--doc-ink-disabled` | `#8b959e` |
| `--doc-rule-hairline` | `#d7dee5` |
| `--doc-rule-standard` | `#c3ccd5` |
| `--doc-rule-emphasis` | `#b8c1ca` |
| `--doc-rule-total` | `#14324a` |
| `--doc-fill-header` | `#d1dae1` |
| `--doc-fill-zebra` | `#eff2f6` |
| `--doc-fill-subtotal` | `#e0e6eb` |
| `--doc-section-*-fill` | JSON `section_tints.*.print` |
| `--doc-section-*-ink` | JSON `section_tints.*.ink` |

Reserved (document in CSS comment, do **not** emit):

```css
/* RESERVED (no canonical value): --doc-fill-grand-total — JSON fills.grand_total_row.hex is null */
```

**`@theme inline`:** only `var(--…)` aliases for colours/status/section utilities — no hex literals.

If CLI left conflicting shadcn theme variables, **overwrite** with Straits values (gate #10).

- [ ] **Step 4: Run token tests — expect PASS**

```bash
npm test -- tests/domain/straits-tokens.test.ts
```

- [ ] **Step 5: Commit tokens**

```bash
git add src/web/styles.css tests/domain/straits-tokens.test.ts
git commit -m "feat: project Straits semantic and document tokens into Vite CSS"
```

---

### Task 4: Install Studio-selected primitives (pinned CLI)

**Files:**
- Create/overwrite: `src/components/ui/{button,input,label,card,alert,table,badge}.tsx` (exact set from evidence)
- Possibly modify: `src/web/styles.css`, `package.json` (peer deps)
- Modify: `docs/superpowers/evidence/2026-08-08-phase4c-cli.md`

**Interfaces:**
- Consumes: pinned CLI + Studio list from Task 1
- Produces: importable `@/components/ui/*` primitives

- [ ] **Step 1: Baseline checkpoint**

```bash
git status --short
```

- [ ] **Step 2: Inspect proposal**

```bash
npx shadcn@PINNED_VERSION add button input label card alert table badge --dry-run
```

If `--dry-run` unsupported:

```bash
npx shadcn@PINNED_VERSION add button --diff
```

Save summary into evidence under “Inspect notes”.

- [ ] **Step 3: Execute pinned add**

```bash
npx shadcn@PINNED_VERSION add button input label card alert table badge
```

- [ ] **Step 4: Diff vs proposal — stop on scope breach**

```bash
git status --short
git diff --stat
```

**Stop** if sidebar, navigation chrome, or unrelated components appear.

- [ ] **Step 5: Straits reconcile after generation**

Re-open `src/web/styles.css`. If `add` rewrote theme hexes away from Straits, restore Task 3 values. Re-run:

```bash
npm test -- tests/domain/straits-tokens.test.ts
```

Minimal integration edits to primitives only if compile/Vite/a11y/token-class breakage — note each edit in evidence with reason.

Badge/Alert: if variants lack `success` | `warning` | `info`, add only those variants mapped to `status-ok-*` / `status-warn-*` / `status-info-*`. **Do not** add success/warning/info to Button.

- [ ] **Step 6: Build + typecheck**

```bash
npm run typecheck
npm run build
```

- [ ] **Step 7: Commit primitives**

```bash
git add src/components/ui package.json package-lock.json src/web/styles.css docs/superpowers/evidence/2026-08-08-phase4c-cli.md
git commit -m "feat: add Studio-selected shadcn primitives via pinned CLI"
```

---

### Task 5: Restyle shipped 4A/4B surfaces (presentation only)

**Files:**
- Modify: `src/web/app.tsx`, `src/web/employee-import-panel.tsx`
- Create: `tests/domain/web-palette-leak.test.ts`
- Do **not** modify: `src/web/api/*`, `src/web/auth/*`, `src/server/**`, `src/service/**` unless a compile break forces a type-only import path fix (justify in commit body)

**Interfaces:**
- Consumes: `@/components/ui/{button,input,label,card,alert,table,badge}`
- Produces: same behaviour, semantic-token presentation; `document.documentElement.classList` light/dark toggle for smoke

- [ ] **Step 1: Write palette-leak test**

Create `tests/domain/web-palette-leak.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...walk(path));
    } else if (/\.(tsx|ts|css)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

const webRoot = resolve("src/web");
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const PALETTE_UTIL =
  /\b(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

describe("src/web palette leak guard", () => {
  it("does not use raw hex or Tailwind palette utilities outside styles.css token file", () => {
    const files = walk(webRoot).filter((path) => !path.endsWith("styles.css"));
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (HEX.test(text) || PALETTE_UTIL.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

Run — may PASS already; keep as regression lock.

```bash
npm test -- tests/domain/web-palette-leak.test.ts
```

- [ ] **Step 2: Restyle `src/web/app.tsx`**

Rules:

- Replace `<button>` → `Button`, `<input>` → `Input`, labels → `Label`, banners → `Alert` (destructive for errors; default/info pattern for info with glyph/text e.g. `i` / `!` prefix in `AlertTitle` or visible text — **not colour alone**).
- Wrap signed-in sections in `Card` / `CardHeader` / `CardContent` as needed for existing container layout only.
- Admin users: `Table` / `TableHeader` / `TableBody` / `TableRow` / `TableCell`.
- User `status` cell: `Badge` + glyph/text (`me.status` string remains; prefix glyph from status map when rendering badge children, e.g. `◦ active` style using doctrine glyphs where a mapping exists; for unknown status use neutral `⊘` or plain text — never colour-only).
- Add minimal theme control (not nav chrome):

```tsx
function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        const next = !dark;
        document.documentElement.classList.toggle("dark", next);
        setDark(next);
      }}
    >
      {dark ? "Dark" : "Light"}
    </Button>
  );
}
```

Place beside Sign out / on signed-out form footer. This is verification affordance only — not a theme provider package.

- Preserve all handlers, API calls, permission gates, import panel props.

- [ ] **Step 3: Restyle `src/web/employee-import-panel.tsx`**

Same primitive swap for buttons/inputs/file control styling. Keep `payrollApi` calls identical. Report summary may use `Alert` + plain text; no new endpoints.

- [ ] **Step 4: Run guards + full automated suite**

```bash
npm test -- tests/domain/straits-tokens.test.ts tests/domain/web-palette-leak.test.ts
npm test
npm run typecheck
npm run check
npm run build
```

Expected: all green. If `check` flags className formatting, fix with `npm run fix` narrowly.

- [ ] **Step 5: Behavior-diff review (manual file list)**

```bash
git diff --name-only
```

Expected names ⊆ `src/web/app.tsx`, `src/web/employee-import-panel.tsx`, `src/web/styles.css`, `src/components/ui/**`, tests, evidence, README (Task 6), lockfile/deps. **Stop** if `src/web/api`, `src/web/auth`, `src/server`, `src/service` change without a written justification in the commit body.

- [ ] **Step 6: Commit consumer restyle**

```bash
git add src/web/app.tsx src/web/employee-import-panel.tsx tests/domain/web-palette-leak.test.ts
git commit -m "feat: restyle Phase 4A/4B surfaces with Straits shadcn primitives"
```

---

### Task 6: Verification closeout + README

**Files:**
- Modify: `README.md` (Phase 4 row)
- Modify: `docs/superpowers/specs/2026-08-08-phase4c-straits-shadcn-design.md` status → `Implemented` only after gates pass
- Modify: evidence file with final checklist

- [ ] **Step 1: Complete evidence checklist**

Append to evidence:

```markdown
## Final gates

- [x] Inspected proposal vs actual diff recorded
- [x] Straits 13-point gate (tests + manual review)
- [x] typecheck / test / check / build
- [x] Behavior-diff guard passed
- [ ] Manual smoke (operator): sign-in, me/permissions, admin, import, error states, light/dark, focus, narrow viewport
```

- [ ] **Step 2: Manual smoke (operator)**

With `npm run dev:api` and `npm run dev`:

1. Sign in
2. me + permissions reload
3. Admin users if System Admin
4. Employee template download + import path (permission permitting)
5. Trigger/observe loading, forbidden, expired, API error banners (glyph/text present)
6. Toggle Light/Dark — surfaces remapped; `--doc-*` unused but CSS unchanged under `.dark`
7. Tab through controls — focus ring visible (`ring` token)
8. Narrow viewport — no obvious horizontal overflow on main form/table

- [ ] **Step 3: README phase line**

Update the Phase 4 row to wording equivalent to:

```text
| 4 · Vite SPA shell | 4A auth + 4B import + 4C design-system foundation done; product chrome / Phase 5 payroll UI pending |
```

Do **not** claim dashboard/chrome/Phase 5 complete.

- [ ] **Step 4: Mark spec Implemented**

Change spec header Status from `ACCEPTED / FROZEN` to `Implemented` (keep frozen decisions; status reflects shipping).

- [ ] **Step 5: Final automated gate**

```bash
npm run typecheck
npm test
npm run check
npm run build
```

- [ ] **Step 6: Commit closeout**

```bash
git add README.md docs/superpowers/specs/2026-08-08-phase4c-straits-shadcn-design.md docs/superpowers/evidence/2026-08-08-phase4c-cli.md
git commit -m "docs: mark Phase 4C Straits/shadcn foundation complete"
```

---

## Spec coverage checklist (plan self-review)

| Spec requirement | Task |
|---|---|
| Studio selects / pinned CLI / evidence | 1, 4 |
| Tailwind v4 + `@` TS+Vite + `components.json` | 2 |
| Install loop + stop on oversized diff | 1–4 |
| Straits app tokens + status/section/chart | 3 |
| `--doc-*` emit vs reserve; no `.dark` mutation | 3 |
| `@theme inline` aliases only | 3 |
| No raw palette in web / ui integration | 3–5 tests |
| Badge/Alert variants; no semantic Button colours | 4 |
| Restyle only shipped surfaces; no product chrome | 5 |
| Behavior-diff guard | 5 |
| typecheck/test/check/**build** | 2, 4, 5, 6 |
| Manual light/dark/focus/smoke | 6 |
| README 4C foundation wording | 6 |
| No Storybook / token package / `/cui` | Global + Tasks |

## Placeholder scan

None intentional. `PINNED_VERSION` and Studio theme name are resolved at Task 1 execution time and written into evidence (allowed by frozen spec).
