# Phase 5B — Clarity Payroll Product UI Shell + Pay-Run Workspace

**Date:** 2026-08-08 · **Status:** Approved for planning · **Scope:** Application shell (sidebar + scope bar + ⌘K), pay-run workspace (totals strip + column-grouped grid + employee slide-over), individual payslip preview — built with Studio-inspired shadcn blocks on the Straits token system.

Companions:
- [presentation-facade.md](../../architecture/presentation-facade.md) — facade rules the UI must obey
- [palette README](../../palette/README.md) — Straits colour doctrine
- [phase4c-straits-shadcn-design](./2026-08-08-phase4c-straits-shadcn-design.md) — token foundation (frozen)
- [phase5a-mutation-envelope-design](./2026-08-08-phase5a-mutation-envelope-design.md) — API mutation response shape

---

## Invariant

> The browser never becomes the authority. It reads persisted values and derivation graphs, collects user intent, and fires API mutations. It never recalculates a statutory figure, formats money by hand, or resolves citations from a hardcoded map. All of presentation-facade.md §5 applies unchanged.

---

## 1. Design Principles

These are the user's stated requirements, locked as constraints — not preferences:

1. **Ambient authority.** Any critical action (recompute, approve, PCB entry, payslip preview, employee line edit, finding review) is reachable from the current screen without navigating away. Context menus and slide-overs, never redirects.
2. **History-first comparison.** Every aggregate shows Δ vs the previous run. Changed employee rows are flagged. The slide-over shows current and previous figures side-by-side. The derivation drawer shows `GraphDiff` entries explained in plain language.
3. **Individual payslip preview.** Available on every employee row as a first-class action — not a batch report, not a separate screen. Opens instantly in a slide-over.
4. **Multi-company scope.** A persistent scope bar at the top of every screen lets the user select "All Companies" or any subset. Every list and aggregate respects the active scope. The period picker is secondary — scoped inside the workspace, not the primary nav axis.
5. **Colour-encoded column groups.** Section tints (Straits doctrine) identify Earning / Deduction / Employer / Summary column groups at a glance. Full header-row fill, not a stripe.

---

## 2. Architecture

### 2.1 File layout

```
src/web/
  app.tsx                    ← existing; replace single-screen with routed shell
  main.tsx                   ← unchanged
  shell/
    layout.tsx               ← SidebarProvider + top bar + content slot
    top-bar.tsx              ← company multi-select + period picker + ⌘K trigger + user avatar
    sidebar-nav.tsx          ← Sidebar with Collapsible nav groups
    command-palette.tsx      ← CommandDialog overlay (⌘K)
  payrun/
    workspace.tsx            ← orchestrates zone A–D
    run-header.tsx           ← run title + status badge + action buttons + tabs
    totals-strip.tsx         ← 5-tile statistics row
    employee-grid.tsx        ← column-grouped table + pagination
    employee-slide-over.tsx  ← Sheet with Line / Payslip / Derivation tabs
    payslip-preview.tsx      ← live payslip view (read from roots)
    derivation-drawer.tsx    ← drill-down tree renderer
  employees/
    employees-page.tsx       ← employee list + import panel (existing, restyled)
  reports/
    reports-page.tsx         ← placeholder for Phase 8
  control/
    control-page.tsx         ← findings + gates (existing API, no SPA yet → placeholder)
  admin/
    admin-page.tsx           ← admin users (existing, restyled)

src/components/ui/           ← existing 4C primitives + net-new installs
src/components/payroll/      ← domain presenters (MoneyCell, StatusBadge, DeltaBadge, NodePanel)
```

### 2.2 Routing

Client-side routing via `wouter` (lightweight, no React Router overhead). **Not yet installed — add via `npm install wouter`.** Routes:

| Path | Screen |
|---|---|
| `/` | redirects to `/pay-runs` |
| `/pay-runs` | pay-run list → select a run → workspace |
| `/pay-runs/:runId` | pay-run workspace |
| `/employees` | employee list + import |
| `/reports` | reports placeholder |
| `/control` | findings + gates placeholder |
| `/admin` | admin users (SYSTEM_ADMIN only) |

### 2.3 State

No global state library. React context for:
- `ScopeContext` — active companies + active period (URL-synced)
- `AuthContext` — me, permissions, sign-out (lifted from current app.tsx)

Workspace data: local `useState` per page, fetched on mount and on scope change. No optimistic updates in Phase 5B — mutations await the API, then refetch.

---

## 3. Application Shell

### 3.1 Top Bar (`top-bar.tsx`)

Full-width, sticky, `bg-primary` (executive navy `#14324a`), `text-primary-foreground`.

Left to right:
- **Logo / wordmark** — "Clarity Payroll" in `font-heading font-semibold`, `text-primary-foreground`
- **Company multi-select** — `Popover` + `Command` checklist. Shows "All Companies" pill when all/none selected; shows comma-separated company short names when selective. Max 3 names shown, then "+N more" badge. Selection stored in `ScopeContext`.
- **Period picker** — `Popover` + month/year grid (custom, no external date library). Shows "Aug 2026". Defaults to current month.
- **⌘K trigger** — ghost `Button` with `SearchIcon` + "Search or jump…" placeholder text + `Badge` showing `⌘K`. Opens `CommandDialog`.
- **User avatar** — `Avatar` with fallback initials + status dot. Click → `DropdownMenu` (profile info, theme toggle, invite user if SYSTEM_ADMIN, sign out).

### 3.2 Sidebar Nav (`sidebar-nav.tsx`)

`SidebarProvider` + `Sidebar`. Collapsible to icon-only. `bg-card`, `border-r border-border`.

Nav groups (each a `Collapsible` section):

| Icon | Label | Route | Condition |
|---|---|---|---|
| `ReceiptTextIcon` | Pay Runs | `/pay-runs` | always |
| `UsersIcon` | Employees | `/employees` | always |
| `FileTextIcon` | Reports | `/reports` | always |
| `ShieldCheckIcon` | Control | `/control` | always |
| `SettingsIcon` | Admin | `/admin` | SYSTEM_ADMIN only |

Active item: `border-l-2 border-accent bg-accent/10 text-accent` (governance teal).
Inactive item: `text-muted-foreground hover:bg-muted hover:text-foreground`.

Sidebar footer: `Avatar` + name + email + `Badge` (status glyph + tone) + `LogOutIcon` button.

### 3.3 Command Palette (`command-palette.tsx`)

`CommandDialog` triggered by ⌘K or the top-bar button. Groups:

- **Navigate** — Pay Runs, Employees, Reports, Control, Admin
- **Pay Runs** — recent runs by name/period/company, fuzzy-searched
- **Employees** — employee name or code, fuzzy-searched
- **Actions** — Create pay run, Import employees, Switch company, Toggle theme

Keyboard: `↑↓` navigate, `Enter` activate, `Esc` close.

---

## 4. Pay-Run Workspace

### 4.1 Run Header (`run-header.tsx`)

`bg-card`, full-width, `border-b`, `px-6 py-4`.

```
[Company name]  [Period]  ◦ DRAFT         [Recompute]  [Review]  [Approve]
                          status badge     (role-gated buttons)
─────────────────────────────────────────────────────────────────────────────
[This Run]  [Compare ↔ Prev]  [History]
            Tabs
```

Status badge: Straits status mapping — `DRAFT`→neutral ◦, `REVIEWED`→warn ◔, `APPROVED`→ok ✓, `CLOSED`→posted ✓. Badge uses `variant="secondary"` reskinned with status tokens.

Buttons: `Button variant="outline"` for Recompute; `Button variant="outline"` for Review; `Button` (default, primary) for Approve. Disabled when not applicable by run status or permissions.

Findings summary: if findings exist, a compact `Alert variant="warning"` row below the header showing `N blocking · M warnings`. Click → Control screen filtered to this run.

### 4.2 Totals Strip (`totals-strip.tsx`)

Horizontal scroll on narrow viewports. 5 tiles in `grid grid-cols-5`.

Each tile is a `Card` (`bg-card`, `ring-1 ring-foreground/10`):

```
┌──────────────────────────────┐
│ Gross Pay          ↑ +2.1%   │  ← title + DeltaBadge
│ RM 176,930.00                │  ← MoneyCell (tabular-nums, font-semibold)
│ ▁▂▃▄▅▆▇ (sparkline)          │  ← AreaChart, chart-1 colour
│ prev: RM 173,230.00          │  ← secondary ink
└──────────────────────────────┘
```

Tiles: **Gross Pay** (chart-1 teal) · **Net Pay** (chart-2 orange) · **EPF Employee** (chart-3 indigo) · **SOCSO Employee** (chart-4 olive) · **EIS Employee** (chart-5 steel).

`DeltaBadge`: `ArrowUpIcon` + percentage in `bg-status-ok-fill text-status-ok-ink` (positive) or `ArrowDownIcon` + `bg-status-bad-fill text-status-bad-ink` (negative) or `—` in `text-muted-foreground` (no prior run).

Clicking a tile filters the employee grid to show only the columns for that statutory group.

### 4.3 Employee Grid (`employee-grid.tsx`)

Horizontally scrollable `Table`. Sticky first two columns (checkbox + employee name/code).

**Column group headers (row 1):**

| Group | Background | Ink | Columns |
|---|---|---|---|
| — | `bg-muted` | `text-muted-foreground` | ☐ · Employee |
| EARNING | `bg-[hsl(var(--section-earning-fill))]` | `text-[hsl(var(--section-earning-ink))]` | Salary · OT · Allowance |
| DEDUCTION | `bg-[hsl(var(--section-deduction-fill))]` | `text-[hsl(var(--section-deduction-ink))]` | EPF · SOCSO · EIS · PCB |
| EMPLOYER | `bg-[hsl(var(--section-employer-fill))]` | `text-[hsl(var(--section-employer-ink))]` | Co.EPF · Co.SOCSO · Co.EIS · HRDF |
| NET PAY | `bg-[hsl(var(--section-summary-fill))]` | `text-[hsl(var(--section-summary-ink))]` | Net |

**Column sub-headers (row 2):** individual field names in `text-xs text-muted-foreground`.

**Employee rows:**

- `Checkbox` for bulk selection
- Employee cell: code (monospace xs) + name + `DeltaBadge` if any figure changed vs previous run
- Money cells: `MoneyCell` component — `tabular-nums text-right`; `SEN_UNKNOWN` → em dash in `text-muted-foreground`; `NOT_APPLICABLE` → "—" in `text-muted-foreground` with `Tooltip` "Not applicable by statute"
- PCB cell: click to enter inline `Input` (number, ringgit display); save on Enter or blur; cancel on Escape
- Changed cells: subtle `bg-status-warn-fill/20` background
- Row hover: `bg-muted/50`
- Row right-click / `⋮` button → `DropdownMenu`:
  - `EyeIcon` View payslip preview
  - `PencilIcon` Edit line (full slide-over)
  - `GitBranchIcon` View derivation
  - `AlertCircleIcon` View findings (if any)
  - `ReceiptIcon` Copy to clipboard (JSON)

**Footer:** `Pagination` + "Showing N of M employees" + bulk action bar when rows selected (Recalculate selected, Export selected).

### 4.4 Employee Slide-Over (`employee-slide-over.tsx`)

`Sheet` (side="right", max-w-2xl). Opens from row action. Persists while grid is visible behind it.

Header: employee name + code + company + `Badge` run status.

Three `Tabs`:

**Tab 1 — Line**
Two-column layout: Current run (left) · Previous run (right, read-only, `text-muted-foreground`).
Groups: Earning section · Deduction section · Employer section.
Each field: `Label` + `MoneyCell` current + `MoneyCell` previous + `DeltaBadge`.
Editable fields (PCB, manual override): `Input` with save/cancel inline.
Footer: `Button` "Save changes" (primary) + `Button variant="outline"` "Discard".

**Tab 2 — Payslip Preview** (`payslip-preview.tsx`)
Live read from run line roots. Malay/English toggle (`Tabs` or `Select`).
Payslip structured per [payslip.md](../../architecture/payslip.md) legal requirements.
Footer: `Button` "Print / Download PDF" (uses browser print).
`SEN_UNKNOWN` renders as "—" (em dash) never as 0.00.

**Tab 3 — Derivation** (`derivation-drawer.tsx`)
Root selector: `Select` with the 19 root names.
Tree of nodes rendered recursively. Each node: icon by kind + label (rendered from message key + params) + value + `Badge` for flags (REVIEW_REQUIRED, UNVERIFIED, NOT_ENTERED).
`TABLE_LOOKUP` nodes: highlights the matched band row, shows neighbours.
`NOT_APPLICABLE` nodes: citation badge, never blank.
In Compare mode (`compare-prev` tab active): `GraphDiff` entries shown first — VALUE / STRUCTURE / CITATION changes highlighted in `bg-status-warn-fill/30`.

---

## 5. Employees Screen

Restyled existing 4B surfaces:
- Employee list table (read from `/v1/employees` — API to be added) above existing import panel
- `EmptyState` when no employees
- `UploadDropZone` import (already shipped in Block 4)
- Filters: company (respects ScopeContext), search by name/code

---

## 6. Placeholders (in scope for spec, not for Phase 5B implementation)

| Screen | Placeholder content |
|---|---|
| Reports | `EmptyState` "Reports coming in Phase 8" + link to payslip preview |
| Control | `EmptyState` "Findings and gates — backend complete, UI in Phase 6+" |

---

## 7. New shadcn primitives required

Install via `npx shadcn@4.16.2 add <name>` (pinned version from Phase 4C evidence):

| Primitive | Used by |
|---|---|
| `sidebar` | shell layout |
| `collapsible` | sidebar nav groups |
| `command` | ⌘K palette + company multi-select |
| `navigation-menu` | (optional, top bar if needed) |
| `dropdown-menu` | row actions, profile, company select |
| `tabs` | run header, slide-over |
| `sheet` | employee slide-over |
| `separator` | sidebar, slide-over sections |
| `tooltip` | NOT_APPLICABLE cells, delta tiles |
| `checkbox` | grid row selection |
| `select` | period picker, derivation root selector |
| `pagination` | grid footer |
| `chart` | totals strip sparklines (recharts — **not yet installed, add via `npm install recharts`**) |
| `popover` | company multi-select container |
| `progress` | (optional, import progress) |

All primitives go under `src/components/ui/`. Authority chain: Studio selects → pinned CLI installs → Straits decides what remains.

---

## 8. Domain presenters (hand-written, not generated)

| Component | Contract |
|---|---|
| `MoneyCell` | `sen: number \| null` → RM format tabular-nums; `null` → em dash secondary ink |
| `StatusBadge` | `status: RunStatus` → glyph + tone from Straits status map |
| `DeltaBadge` | `current: number, previous: number \| null` → arrow + % or neutral |
| `NodePanel` | renders one `DerivedNode` by kind per presentation-facade §4 |
| `SectionHeader` | `section: 'earning'\|'deduction'\|'employer'\|'summary'` → tint header cell |

These live under `src/components/payroll/`. They consume only Straits semantic tokens. No raw hex. No raw Tailwind palette utilities.

---

## 9. Facade rules enforced by design

Every rule from presentation-facade.md §5 is enforced structurally:

1. **Never recalculate** — MoneyCell reads `sen` from API root; no arithmetic in components.
2. **Never format money by hand** — MoneyCell is the only formatter; format logic lives there.
3. **Never write prose about a figure** — NodePanel renders `renderLabel(node.label, lang)`; no hardcoded English sentences adjacent to numbers.
4. **Never auto-calculate PCB** — PCB cell is an `Input` whose value comes from the server; no derived value is pre-filled.
5. **Never render NOT_APPLICABLE as blank** — `MoneyCell` with `notApplicable=true` renders "—" with a `Tooltip` showing the citation.
6. **Never resolve citations client-side** — NodePanel fetches citation via rule pack join at render; unknown `ruleId` throws a visible error, never silently drops.
7. **Colour follows palette contract** — section tints, status tokens, chart series only; no raw hex.

---

## 10. Studio block map

| UI Surface | Studio inspiration block | Key primitives extracted |
|---|---|---|
| Application shell | `application-shell-5` | `SidebarProvider`, `Sidebar`, `Collapsible`, `CommandDialog` |
| Dashboard shell | `dashboard-shell-7` | `chart`, `table`, `tabs`, `pagination` |
| Top bar / scope | `dashboard-header-4` | `NavigationMenu`, `DropdownMenu`, `Avatar`, `Tabs` |
| Totals strip | `statistics-component-2` | `Card`, `Badge`, `AreaChart`, `ArrowUpIcon`/`ArrowDownIcon` |
| Employee grid | `datatable-component` | `Table`, `Checkbox`, `DropdownMenu`, `Pagination`, `Badge` |

Studio blocks are **inspiration inputs** — they are not imported or installed as registry items. The primitives they reference are installed individually via the pinned shadcn CLI. Generated code is inspected before write and must pass Straits doctrine review.

---

## 11. Out of scope for Phase 5B

- Graph persistence decisions (derivation runs in-process; no stored graph fetch)
- Rule-pack resolution query layer (§5.6 contract described, not implemented)
- Bilingual payslip (Malay) — Phase 8
- Run diff screen (`diff.ts` output) — Phase 8
- Reports (EA forms, summary reports) — Phase 8
- Payments, release, reconciliation SPA — Phase 7 SPA wiring
- Employee self-service — future
- Mobile-optimised layout (responsive breakpoints are implemented but mobile is not the primary target)
