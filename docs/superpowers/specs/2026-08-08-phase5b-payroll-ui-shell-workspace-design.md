# Phase 5B — Clarity Payroll Product UI Shell + Pay-Run Workspace

**Date:** 2026-08-08 · **Status:** Design — revision required (7 critical corrections applied) · **Scope:** Application shell (sidebar + scope bar + ⌘K), pay-run workspace (server-owned read model + totals strip + column-grouped grid + employee slide-over with payslip preview), domain presenters — built with Studio-inspired shadcn blocks on the Straits token system.

Companions:
- [presentation-facade.md](../../architecture/presentation-facade.md) — facade rules the UI must obey
- [palette README](../../palette/README.md) — Straits colour doctrine
- [phase4c-straits-shadcn-design](./2026-08-08-phase4c-straits-shadcn-design.md) — token foundation (frozen)
- [phase5a-mutation-envelope-design](./2026-08-08-phase5a-mutation-envelope-design.md) — API mutation response shape

---

## Invariant

> The browser never becomes the authority. It reads persisted values and server-owned derivation graphs, collects user intent, and fires API mutations. It never recalculates a statutory figure, formats money by hand, computes variance, resolves citations, or enforces workflow transitions. All of presentation-facade.md §5 applies unchanged.

---

## 1. Design Principles

User requirements locked as constraints — not preferences:

1. **Ambient authority.** Any critical action (recompute, approve, payslip preview, employee slide-over, finding review) is reachable from the current screen without navigating away. Context menus and slide-overs, never redirects.
2. **History-first comparison.** Every aggregate shows Δ vs the previous run, sourced from the server-owned `VarianceDto`. Changed rows are flagged by the server. Derivation compare mode renders server-supplied `GraphDiff` entries.
3. **Individual payslip preview.** Available on every employee row as a first-class action — not a batch report, not a separate screen. Opens in a slide-over. English only in Phase 5B.
4. **Multi-company scope.** A persistent scope bar at the top lets the user select All, a specific subset, or a single company. Scope mode governs what actions are available (see §2.3). Period/reporting month is secondary — scoped inside the workspace.
5. **Colour-encoded column groups.** Section tints (Straits doctrine) identify Earning / Deduction / Employer / Summary column groups. Full header-row fill.

---

## 2. Architecture

### 2.1 File layout

```
src/web/
  app.tsx                    ← existing; replace single-screen with routed shell
  main.tsx                   ← unchanged
  shell/
    layout.tsx               ← SidebarProvider + top bar + content slot
    top-bar.tsx              ← CompanyScope selector + period picker + ⌘K trigger + user avatar
    sidebar-nav.tsx          ← Sidebar with Collapsible nav groups
    command-palette.tsx      ← CommandDialog overlay (⌘K)
  payrun/
    workspace.tsx            ← orchestrates zones A–D; fetches PayRunWorkspaceView
    run-header.tsx           ← run title + StatusBadge + server-gated action buttons + tabs
    totals-strip.tsx         ← 5-tile statistics row (server VarianceDto, no arithmetic)
    employee-grid.tsx        ← column-grouped table + pagination + row DropdownMenu
    employee-slide-over.tsx  ← Sheet with Line / Payslip / Derivation tabs
    payslip-preview.tsx      ← read-only payslip view (light-only --doc-* contract)
    derivation-drawer.tsx    ← server-resolved derivation tree renderer
  employees/
    employees-page.tsx       ← employee list (GET /v1/employees) + import panel
  reports/
    reports-page.tsx         ← EmptyState placeholder — Phase 8
  control/
    control-page.tsx         ← EmptyState placeholder — Phase 6+
  admin/
    admin-page.tsx           ← admin users (restyled)

src/components/ui/           ← existing 4C primitives + net-new shadcn installs
src/components/payroll/      ← domain presenters: MoneyCell, StatusBadge, DeltaBadge, NodePanel, SectionHeader
```

### 2.2 Routing

Client-side routing via `wouter`. **Not yet installed — `npm install wouter`.**

| Path | Screen |
|---|---|
| `/` | redirects to `/pay-runs` |
| `/pay-runs` | pay-run list |
| `/pay-runs/:runId` | pay-run workspace (single-company transaction context) |
| `/employees` | employee list + import |
| `/reports` | placeholder |
| `/control` | placeholder |
| `/admin` | admin users (SYSTEM_ADMIN only) |

### 2.3 Company scope model

The company selector is a first-class part of the shell. It governs what is rendered and what actions are permitted.

```ts
type CompanyScope =
  | { mode: "all" }
  | { mode: "selected"; companyIds: string[] };
```

`{ mode: "all" }` means all companies the **authenticated user is authorised to access** — never literally all rows in the database.

Empty company selection is **not treated as "all"**. The selector must always show an explicit selection state. If the user deselects everything, the shell shows an informational prompt: "Select at least one company to continue."

Scope mode governs capability:

| Scope | Capability |
|---|---|
| `all` | Observation and monitoring: pay-run list, employee list, read-only aggregates |
| `selected` (2+) | Observation and cross-company comparison |
| `selected` (1) | Full transactional authority: recompute, review, approve, employee-line mutation |

For `/pay-runs/:runId`, the run's own company establishes a **single-company transaction context** regardless of what the scope bar shows. The scope bar updates its display to reflect the active run's company when the workspace is open.

### 2.4 State

No global state library. React context for:
- `ScopeContext` — `CompanyScope` + `reportingMonth: string` (format `"2026-08"`, URL-synced)
- `AuthContext` — me, permissions, sign-out (lifted from current app.tsx)

Workspace data: local `useState` per page, fetched on mount and on scope change. No optimistic updates in Phase 5B — mutations await the API, then refetch.

---

## 3. Application Shell

### 3.1 Top Bar (`top-bar.tsx`)

Full-width, sticky, `bg-primary` (executive navy), `text-primary-foreground`. Uses `var(--primary)` — not raw hex.

Left to right:
- **Logo / wordmark** — "Clarity Payroll", `font-heading font-semibold text-primary-foreground`
- **Company scope selector** — `Popover` + `Command` checklist. "All Companies" shown when `mode: "all"` is explicitly set. When `mode: "selected"` with ≥1 company, shows short names; max 3, then "+N more" badge. Empty deselection prompts the user rather than falling back silently to `all`.
- **Period / reporting-month picker** — `Popover` + month/year grid. Shows "Aug 2026". Value is `reportingMonth: "2026-08"`. Does not represent a specific payroll period identity (companies may have different cutoff conventions).
- **⌘K trigger** — ghost `Button` + `SearchIcon` + "Search or jump…" label + `Badge` `⌘K`.
- **User avatar** — `Avatar` + fallback initials. Click → `DropdownMenu`: profile, theme toggle, invite user (SYSTEM_ADMIN only), sign out.

### 3.2 Sidebar Nav (`sidebar-nav.tsx`)

`SidebarProvider` + `Sidebar`. Collapsible to icon-only. `bg-card border-r border-border`.

| Icon | Label | Route | Condition |
|---|---|---|---|
| `ReceiptTextIcon` | Pay Runs | `/pay-runs` | always |
| `UsersIcon` | Employees | `/employees` | always |
| `FileTextIcon` | Reports | `/reports` | always |
| `ShieldCheckIcon` | Control | `/control` | always |
| `SettingsIcon` | Admin | `/admin` | SYSTEM_ADMIN only |

Active item: `border-l-2 border-accent bg-accent/10 text-accent`.
Inactive: `text-muted-foreground hover:bg-muted hover:text-foreground`.

Sidebar footer: `Avatar` + name + email + `LogOutIcon` button.

### 3.3 Command Palette (`command-palette.tsx`)

`CommandDialog` triggered by ⌘K or top-bar button.

Groups:
- **Navigate** — Pay Runs, Employees, Reports, Control, Admin
- **Pay Runs** — recent runs by name/period/company, fuzzy-searched
- **Employees** — name or code, fuzzy-searched
- **Actions** — Create pay run, Import employees, Switch company scope, Toggle theme

Keyboard: `↑↓`, `Enter`, `Esc`.

---

## 4. Pay-Run Workspace

### 4.1 Server-owned workspace read model

The workspace reads from one logical endpoint:

```
GET /v1/pay-runs/:id/workspace
```

This does **not** need to be a single physical endpoint if existing APIs already supply honest equivalents. The implementation plan's 5B-PREFLIGHT task (§9) maps each UI fact to an existing or explicitly new server source. No UI component is allowed to compute, sum, join, or infer a value that is not present in the response.

Response shape:

```ts
interface PayRunWorkspaceView {
  run: {
    id: string;
    companyId: string;
    companyName: string;
    reportingMonth: string;       // "2026-08"
    status: RunStatus;
    label: string;
  };
  actionAvailability: {
    canRecompute: boolean;
    canReview: boolean;
    canApprove: boolean;
    canClose: boolean;
  };
  totals: AggregateTile[];
  findingsSummary: {
    blockingCount: number;
    warningCount: number;
  } | null;
  lines: EmployeeLineDto[];
}

interface AggregateTile {
  key: string;                    // "gross_pay" | "net_pay" | "epf_ee" | ...
  label: string;
  currentSen: number | null;
  variance: VarianceDto;
  history: SparkPoint[];          // server-computed, used as-is
}

interface VarianceDto {
  previousSen: number | null;
  deltaSen: number | null;
  deltaBps: number | null;        // basis points; null when no prior run
  direction: "UP" | "DOWN" | "SAME" | "NO_PRIOR";
}

interface SparkPoint {
  reportingMonth: string;
  sen: number;
}

interface EmployeeLineDto {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  roots: Record<string, RootValue>;        // 19 named roots
  previousRoots: Record<string, RootValue> | null;
  variance: EmployeeVarianceDto | null;
  findingsCount: number;
}

interface EmployeeVarianceDto {
  hasChanges: boolean;
  changedRootKeys: string[];       // server identifies which roots changed
  direction: "UP" | "DOWN" | "SAME" | "NO_PRIOR";
  // direction is NEUTRAL in presentation — not success/error
}
```

### 4.2 Run Header (`run-header.tsx`)

`bg-card border-b px-6 py-4`.

```
[Company]  [reportingMonth]  [StatusBadge]         [Recompute]  [Review]  [Approve]
                                                    (from actionAvailability — not re-derived)
───────────────────────────────────────────────────────────────────────────────────────
[This Run]   [Compare ↔ Prev]   [History]
```

`StatusBadge` tokens:
- `DRAFT` → neutral glyph `◦`, `text-muted-foreground`
- `REVIEWED` → neutral glyph `◔`, `text-foreground` (not warning)
- `APPROVED` → `var(--status-ok-ink)` `✓`
- `CLOSED` → `var(--status-ok-ink)` posted glyph

Buttons use `actionAvailability` from the server response. The client does **not** re-derive availability from `run.status` + role.

Findings row: `Alert` with `var(--status-warn-fill)` background when `findingsSummary.blockingCount > 0`. Shows "N blocking · M warnings". Click → Control (planned for Phase 6).

### 4.3 Totals Strip (`totals-strip.tsx`)

Five `Card` tiles in `grid grid-cols-5`. Horizontal scroll on narrow viewports.

Each tile renders an `AggregateTile` from the server response:

```
┌───────────────────────────────┐
│ Gross Pay          ↑ +2.1%    │  ← label + DeltaBadge (from VarianceDto)
│ RM 176,930.00                 │  ← MoneyCell(currentSen)
│ ▁▂▃▄▅▆▇                       │  ← SparklineChart(tile.history) — server points, no joins
│ prev: RM 173,230.00           │  ← MoneyCell(variance.previousSen)
└───────────────────────────────┘
```

`DeltaBadge` reads `VarianceDto.direction` and `deltaBps`. Rendering rules:
- `UP` / `DOWN` / `SAME` → **neutral directional ink** (`text-muted-foreground` for SAME, `text-foreground` for UP/DOWN). **Never status-ok/status-bad.** Direction is not good or bad.
- `NO_PRIOR` → "—" in `text-muted-foreground`

The `DeltaBadge` component contract:

```ts
interface DeltaBadgeProps {
  variance: VarianceDto;
}
```

It renders only — it never calculates.

Chart series colours: chart-1 through chart-5 per tile (Gross, Net, EPF-ee, SOCSO-ee, EIS-ee).

### 4.4 Employee Grid (`employee-grid.tsx`)

Horizontally scrollable `Table`. Sticky first two columns (checkbox + employee identity).

**Column group headers (row 1) — section tint tokens:**

Use `var(--section-earning-fill)`, `var(--section-earning-ink)` etc. as CSS custom property references directly (not as Tailwind `hsl()` wrappers). If Phase 4C established these as HSL-tuple variables, use `hsl(var(--section-earning-fill))`. If they were established as complete colour values, use `var(--section-earning-fill)` directly. The implementation plan's 5B-PREFLIGHT step must confirm the exact token form from `src/web/styles.css` before any class is written.

| Group | Token reference | Columns |
|---|---|---|
| — | `bg-muted` | ☐ · Employee |
| EARNING | `--section-earning-fill` / `--section-earning-ink` | Salary · OT · Allowance |
| DEDUCTION | `--section-deduction-fill` / `--section-deduction-ink` | EPF · SOCSO · EIS · PCB |
| EMPLOYER | `--section-employer-fill` / `--section-employer-ink` | Co.EPF · Co.SOCSO · Co.EIS · HRDF |
| NET PAY | `--section-summary-fill` / `--section-summary-ink` | Net |

**Employee rows:**
- `Checkbox` for bulk selection
- Employee cell: code (monospace xs) + name. If `variance.hasChanges === true` (server flag), show a neutral `DeltaBadge` glyph (`↕`).
- Money cells: `MoneyCell`. `NOT_APPLICABLE` → "—" + `Tooltip` "Not applicable by statute" (citation from server-resolved node). `SEN_UNKNOWN` → em dash.
- PCB cell: **read-only** in Phase 5B. Displays `MoneyCell`. Override capability is deferred until the override contract is defined (§4.7).
- Changed cells: `variance.changedRootKeys` determines which cells receive a highlight. Tint: neutral `bg-muted/60`, not warning. Changed ≠ error.
- Row hover: `bg-muted/50`
- Row right-click / `⋮` → `DropdownMenu`:
  - `EyeIcon` View payslip
  - `PencilIcon` Edit line (slide-over, Line tab)
  - `GitBranchIcon` View derivation (slide-over, Derivation tab)
  - `AlertCircleIcon` View findings (if `findingsCount > 0`)

**Footer:** `Pagination` + "Showing N of M employees" + bulk action bar when rows selected (Recompute selected).

### 4.5 Employee Slide-Over (`employee-slide-over.tsx`)

`Sheet side="right" className="max-w-2xl"`. Opens from row action. Persists while grid is visible behind.

Header: employee name + code + company + `StatusBadge` run status.

Three `Tabs`:

**Tab 1 — Line**
Two-column: Current (left) · Previous (right, `text-muted-foreground`, read-only).
Groups: Earning · Deduction · Employer.
Each field: `Label` + `MoneyCell current` + `MoneyCell previous` + `DeltaBadge(variance)`.
`DeltaBadge` uses neutral directional styling (not status colours).
PCB row: read-only `MoneyCell` + "Override pending spec" note (see §4.7).
Footer: `Button variant="outline"` "Close" only (no save until override contract exists).

**Tab 2 — Payslip Preview** (`payslip-preview.tsx`)
Read from `EmployeeLineDto.roots`. **English only — Phase 5B has no language toggle.**
Rendered **light-only** using `--doc-*` token contract (independent of app dark-mode theme).
Structured per [payslip-legal-requirements.md](../../architecture/payslip-legal-requirements.md).
`SEN_UNKNOWN` → "—", never 0.00.
Footer: `Button variant="outline"` **"Print preview"** (browser print). **Not labelled "Download PDF"** — no document pipeline exists in Phase 5B.

**Tab 3 — Derivation** (`derivation-drawer.tsx`)
Root selector: `Select` populated from `roots` keys.
Tree rendered from server-resolved `DerivedNode[]` (API supplies nodes with citation DTO already resolved — see §4.6).
Each node: icon by kind + `renderLabel(node.label, lang)` + `MoneyCell(node.sen)` + flag `Badge` (REVIEW_REQUIRED, UNVERIFIED, NOT_ENTERED).
In Compare mode: server-supplied `GraphDiff[]` entries highlighted in neutral `bg-muted/60`.

### 4.6 Citation resolution — server responsibility

The presentation-facade invariant forbids client-side citation resolution. The correct flow:

```
server resolves rule-pack citation at query time
  ↓
DerivedNode DTO includes resolved CitationDto
  ↓
NodePanel renders CitationDto — never performs lookup

interface CitationDto {
  ruleId: string;
  authority: string;       // "LHDN" | "EPF" | "SOCSO" | ...
  reference: string;       // "PCB Table 1 (2026), Row 12"
  effectiveDate: string;   // "2026-01-01"
  displayText: string;     // pre-rendered human-readable citation
}
```

If the server returns `citationStatus: "UNRESOLVED"`, `NodePanel` renders a visible "Citation unavailable" state. The browser never becomes the resolver.

### 4.7 PCB override — deferred

The current codebase has no approved PCB override contract. Making PCB a free-edit `Input` would make a statutory figure look like spreadsheet data entry.

**Phase 5B rule: PCB cell is read-only.** The spec reserves this interaction for a future phase when an override contract exists:

```
PCB                     RM 482.35
Calculated / current source: [CitationDto]

[Override]  ← this button does not exist in Phase 5B
```

When the override contract is defined, the interaction will require an explicit reason and note before applying.

---

## 5. Employees Screen

Vertical slice: requires a read-facade for the employee list.

**5B-PREFLIGHT must confirm whether `GET /v1/employees` exists.** If it does not exist, the implementation plan creates it as a simple read route before the SPA screen.

Components:
- Employee list `Table` (name, code, company, employment status)
- `EmptyState` when no employees
- `UploadDropZone` import (already shipped in Phase 4B)
- Search by name or code (client-side filter on loaded page)
- Company filter respects `ScopeContext`

---

## 6. Placeholders

| Screen | Placeholder |
|---|---|
| Reports | `EmptyState` "Reports — planned for Phase 8" |
| Control | `EmptyState` "Control — planned for Phase 6" (not "backend complete") |

---

## 7. 5B-PREFLIGHT: Read-facade mapping

**This task runs before any SPA code is written.** It answers:

> For every fact the UI displays, what is the server source?

Minimum mapping required:

| UI fact | Must have server source | Action if missing |
|---|---|---|
| Pay-run list | `GET /v1/pay-runs` | already exists? confirm |
| `PayRunWorkspaceView` shape above | `GET /v1/pay-runs/:id/workspace` | new route or compose from existing |
| `VarianceDto` for each aggregate | aggregation query result | new query or extend existing |
| `SparkPoint[]` history for each aggregate | historical query | new query |
| `EmployeeLineDto.roots` | existing pay-run roots | confirm shape |
| `EmployeeLineDto.previousRoots` | linked prior run | confirm `linkedRunId` traversal |
| `EmployeeVarianceDto` (hasChanges, changedRootKeys) | server diff computation | new computation or extend |
| `DerivedNode[]` with `CitationDto` resolved | derivation graph + rule-pack join | confirm backend can supply |
| `actionAvailability` flags | service/gates logic | new: derive from run status + permissions |
| `findingsSummary` | findings table aggregation | new or extend findings query |
| `GET /v1/employees` list | employee profile table | new if missing |
| Company list for scope selector | RBAC / company access | existing auth/me endpoint? confirm |

The preflight task produces a one-page "read-facade readiness" document. If a required source is missing, the implementation plan adds a minimal server route. No client-side computation fills the gap.

---

## 8. New shadcn primitives

Install via `npx shadcn@4.16.2 add <name>`:

| Primitive | Used by |
|---|---|
| `sidebar` | shell layout |
| `collapsible` | sidebar nav groups |
| `command` | ⌘K palette + company scope selector |
| `dropdown-menu` | row actions, profile menu |
| `tabs` | run header, slide-over |
| `sheet` | employee slide-over |
| `separator` | sidebar, slide-over sections |
| `tooltip` | NOT_APPLICABLE cells, delta tiles |
| `checkbox` | grid row selection |
| `select` | period picker, derivation root selector |
| `pagination` | grid footer |
| `chart` | sparklines (`recharts` — **`npm install recharts`**) |
| `popover` | scope selector container |

All under `src/components/ui/`. Authority chain: Studio selects → pinned CLI installs → Straits decides what remains.

---

## 9. Domain presenters (hand-written)

All under `src/components/payroll/`. Consume only Straits semantic tokens — no raw hex, no raw Tailwind palette utilities.

| Component | Contract |
|---|---|
| `MoneyCell` | `props: { sen: number \| null; notApplicable?: boolean }` → RM tabular-nums; `null` → "—" secondary ink; `notApplicable` → "—" + `Tooltip` (citation from parent) |
| `StatusBadge` | `props: { status: RunStatus }` → glyph + neutral/ok tone per §4.2 table |
| `DeltaBadge` | `props: { variance: VarianceDto }` → renders direction + deltaBps; **neutral styling only, never status-ok / status-bad** |
| `NodePanel` | `props: { node: DerivedNode }` → renders kind icon + `renderLabel` + `MoneyCell` + flag badges; citation from `node.citation` (server-resolved) |
| `SectionHeader` | `props: { section: 'earning'\|'deduction'\|'employer'\|'summary' }` → tint header cell using confirmed token form from §4.4 |

---

## 10. Facade rules enforced by design (corrected)

Every rule from presentation-facade.md §5 is enforced structurally:

1. **Never recalculate** — `MoneyCell` reads `sen` from API response. No arithmetic anywhere in presentation components.
2. **Never compute variance** — `DeltaBadge` reads `VarianceDto` from the server. It never receives `(current, previous)` pair to compute.
3. **Never format money by hand** — `MoneyCell` is the only formatter.
4. **Never write prose about a figure** — `NodePanel` renders `renderLabel(node.label, lang)` from the server label key + params.
5. **Never make PCB freely editable** — PCB is read-only in Phase 5B. Override is deferred to a future phase with an approved contract.
6. **Never render NOT_APPLICABLE as blank** — `MoneyCell notApplicable` renders "—" + `Tooltip` with server-resolved citation text.
7. **Never resolve citations client-side** — `NodePanel` renders `node.citation.displayText`. The server resolved the citation. If `citationStatus === "UNRESOLVED"`, render "Citation unavailable", not blank.
8. **Never re-derive action availability** — buttons read `actionAvailability` flags from the server. Client does not re-encode workflow doctrine.
9. **Direction ≠ severity** — `DeltaBadge` uses neutral directional ink. Status colours (`status-ok`, `status-bad`) are only applied when the **server explicitly classifies** something as ok/bad.
10. **Colour follows palette contract** — section tints, status tokens, chart series only. Token form confirmed in 5B-PREFLIGHT before first class is written.

---

## 11. Studio block map

Studio blocks are **inspiration inputs** only — not imported as registry items. Primitives are installed individually via pinned CLI and reviewed against Straits doctrine.

| UI Surface | Studio inspiration | Key primitives |
|---|---|---|
| Application shell | `application-shell-5` | `SidebarProvider`, `Sidebar`, `Collapsible`, `CommandDialog` |
| Dashboard shell | `dashboard-shell-7` | `chart`, `table`, `tabs`, `pagination` |
| Top bar / scope | `dashboard-header-4` | `DropdownMenu`, `Avatar`, `Popover` |
| Totals strip | `statistics-component-2` | `Card`, `Badge`, `AreaChart` |
| Employee grid | `datatable-component` | `Table`, `Checkbox`, `DropdownMenu`, `Pagination` |

---

## 12. Out of scope for Phase 5B

- PCB override UI (deferred — no approved override contract)
- Bilingual payslip / Malay language toggle (Phase 8)
- Run diff screen (Phase 8)
- Reports — EA forms, summary reports (Phase 8)
- Payments, release, reconciliation SPA (Phase 7)
- Employee self-service (future)
- `Copy to clipboard (JSON)` row action (development tooling only — not in production payroll UI)
- Graph persistence decisions (derivation served from existing in-process computation)
- Broad shadcn normalisation sweeps
