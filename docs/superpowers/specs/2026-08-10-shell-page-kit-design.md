# Shell contract + page kit — design

**Date:** 2026-08-10
**Slice:** A+B of the frontend redesign program
**Layer:** L5 presentation facade only — no API, service, repo, or schema change
**Skills:** `vite-fullstack` (Mode B), `hub-refactor` (adoption), `/rui` `/cui` (visual)

---

## 1. Why

The user's ask was "create, refactor, improve, re-design the entire frontend using
shadcn studio", with all four motivations confirmed: generic look, page-to-page
inconsistency, structural mess, and missing surfaces.

The frontend is not weak. `dashboard-page.tsx` already does status-valence KPIs,
studio blocks, per-region skeletons, explicit empty messages, and zero
hand-formatted money. `ShellLayout` is `application-shell-05` chrome. So the
program is **not** a rebuild. It is:

> raise every surface to the bar the dashboard and companies pages already set,
> and finish the ones that were never built.

That decomposes into eight slices (§7). This spec covers the first two, which are
coupled and must ship together.

### The structural defect

`ShellLayout` paints a fixed pseudo-element band —
`before:fixed before:inset-x-0 before:h-[26.25rem] before:bg-primary`
([layout.tsx:35](../../../src/web/shell/layout.tsx)) — and `PageTitle` sets
`text-primary-foreground` ([page-title.tsx:30](../../../src/web/shell/page-title.tsx))
in the hope of landing on it. Two files, no shared declaration, one magic number.

A page that renders a filter bar above its title puts white text on `bg-muted`.
Every new page is a coin flip on whether its heading is readable. This is the
structural reason pages drift, and no amount of per-page care fixes it.

### Shell defects (evidence)

| # | Defect | Where |
|---|---|---|
| 1 | Band/title coupling via magic number (above) | `layout.tsx:35`, `page-title.tsx:30` |
| 2 | Two user menus — `SimpleProfileDropdown` in sidebar footer *and* top bar, each with its own theme toggle and sign-out | `sidebar-nav.tsx:50`, `top-bar.tsx:263` |
| 3 | `initialsOf` duplicated verbatim | `sidebar-nav.tsx:31`, `top-bar.tsx:49` |
| 4 | Month-label drift — same value renders `Aug 2026` and `August 2026` | `top-bar.tsx:37`, `dashboard-page.tsx:38` |
| 5 | `TopBar` is 295 lines doing seven jobs | `top-bar.tsx` |
| 6 | Breadcrumb prints raw URL segments — a UUID crumb on `/pay-runs/<uuid>` | `shell-breadcrumb.tsx:58` |
| 7 | Raw `<input type="month">` with hand-rolled classes, bypassing the primitive layer | `top-bar.tsx:238` |
| 8 | `--sidebar` token remapped in a JSX `style` prop | `layout.tsx:38` |

### Inconsistency (quantified)

- **8 files hand-roll `let cancelled = false` load effects**; `useAsyncLoad`
  exists in `src/hooks/` and only **3** files use it. The abstraction was built,
  then bypassed by the majority.
- **23 inline error renders across 15 files**, mostly bare
  `<p className="text-destructive text-sm" role="alert">`.
- **165 occurrences** of the PageTitle/Skeleton/EmptyState/Card cluster across 25 files.

`companies-page.tsx` — the documented gold path — contains three separate
`data === null ? <Skeleton className="h-36…"/>` branches with hand-tuned heights,
two empty states with different wrappers (`py-6` vs `py-10`), and the
`<Card className="overflow-hidden py-0"><CardContent className="p-0">`
incantation. If the reference page does this, every page does.

---

## 2. The header contract

The band becomes a real element with intrinsic height. Pages fill it via portal.

```
ShellLayout
  <div className="bg-primary">        ← band: real element, height = its content
    <TopBar />
    <ShellHeaderSlot />               ← portal target, ref'd
  </div>
  <main className="bg-muted"> {children} </main>
```

A page renders `<PageHeader title=… description=… actions=… />` anywhere in its
own JSX; `PageHeader` portals into the slot.

**Properties:**

- **Contrast guaranteed by construction.** `PageHeader` owns both the `bg-primary`
  context and the `text-primary-foreground` inside it. No arrangement of page
  content can strand a heading on the wrong surface.
- **The magic number dies.** Band height is whatever TopBar + header need. Long
  descriptions and wrapped action rows work; no page can outgrow 420px.
- **Full-bleed survives.** The band is shell-level, so it still spans edge to edge
  behind the floating sidebar. Current look is preserved exactly.
- **Actions stay co-located** with the page that owns their handlers — `children`
  and props, not state pushed into a context.

**Rejected: `usePageHeader({title, actions})` context.** Same visual result, but it
turns header content into synchronized state — actions need `useMemo` or the shell
re-renders every frame, and there is a flash of empty band on route change. The
portal has neither problem because it is JSX in a different DOM position.

### Lifecycle safety (amended)

An earlier draft had `PageHeader` throw during render when no slot was mounted.
**That was a bug.** The slot's ref is `null` during the first render pass — the
shell and its children commit together — so a synchronous throw would fire on
legitimate first-commit ordering. The contract meant to remove structural
fragility would have shipped with a lifecycle bug inside it.

The slot publishes its node as **state**, not a ref, and `PageHeader` renders
nothing until the target exists:

```tsx
const target = useShellHeaderSlot();

if (target === null) {
  return null;          // first commit — not an error
}

return createPortal(header, target);
```

The developer assertion runs **after mount**, in an effect, never during render.

### Enforcement

This is what stops slices C–H from re-diverging:

1. A post-mount dev assertion warns if a shell route committed without a
   `PageHeader` — asynchronous, so it cannot misfire on render ordering.
2. A test asserts every path in `APP_SHELL_ROUTE_PATHS` renders exactly one
   `PageHeader` — same spirit as the existing `assertNavMatchesRoutes()` in
   [app-nav.ts:102](../../../src/web/shell/app-nav.ts).
3. `page-title.tsx` is **deleted**, not deprecated, so there is no second way.

### `PageHeader` API — deliberately closed

```ts
type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
};
```

No `variant`, `size`, `color`, `alignment`, `background`, `compact`, `hero`, or
`elevated`. Every variant is a licence for pages to drift again, and the whole
point of this slice is to remove that licence. One shell, one header, one
hierarchy. Variants may be added later with evidence of a real need — not in
anticipation of one.

---

## 3. Component inventory

### Shell — `src/web/shell/`

| File | Change |
|---|---|
| `layout.tsx` | `before:` pseudo-band → real `bg-primary` element wrapping TopBar + slot; inline `--sidebar` style prop → `shadcn.css` |
| `shell-header-slot.tsx` | **new** — portal target |
| `top-bar.tsx` | 295 lines → composition only. Target is **one responsibility (compose shell controls)**, not a line count; ~50–100 lines is the expected consequence, not the goal |
| `scope-picker.tsx` | **new** — extracted from TopBar |
| `reporting-month-picker.tsx` | **new** — extracted; raw `<input type="month">` → `Input` primitive |
| `command-trigger.tsx` | **new** — extracted button + ⌘K keydown handler |
| `sidebar-nav.tsx` | becomes the **sole** user menu; duplicate top-bar avatar dropped. Footer must stay reachable in the mobile sidebar sheet — verified explicitly, since dropping the top-bar avatar removes the mobile fallback |
| `shell-breadcrumb.tsx` | nested crumb resolves a label instead of printing a raw UUID — **data-free**, see below |
| `page-title.tsx` | **deleted** |

### Shared — `src/lib/`

| File | Purpose |
|---|---|
| `user-identity.ts` | **new** — `initialsOf` / `firstNameOf`, de-duplicated (defect 3) |
| `format-month.ts` | **new** — one `formatReportingMonth(value, style)` (defect 4) |

### Page kit — `src/components/payroll/`

| Component | Replaces |
|---|---|
| `PageHeader` | `PageTitle` + the band coupling |
| `AsyncRegion` | the `null ? Skeleton : empty ? Empty : content` triad, ~15 copies |
| `PageError` | duplicated **page/region load** errors only — see §3.1 |
| `DataTableCard` | the `Card overflow-hidden py-0 / CardContent p-0` incantation |
| `StatGrid` | `grid gap-4 sm:grid-cols-2 xl:grid-cols-3` — **layout only**, see §3.3 |

### 3.1 `PageError` — classify before replacing

The 23 inline destructive renders are evidence of duplication, not evidence that
they are all the same thing. They must be **classified before any is replaced**:

| Kind | Goes to |
|---|---|
| Page / region load failure | `PageError` |
| Form field validation | `FormMessage` / field-level error |
| Small operation failure (a single action, a row, a retry) | inline `Alert` / local error |

**Rule:** replace duplicated page/region load errors with `PageError`; do **not**
turn every red message into `PageError`. Widening the component to cover all three
makes it semantically broader than its name, which is how a shared component
becomes a dumping ground.

Classification is an output of hub 1 and is recorded in the plan before adoption
begins.

### 3.2 `AsyncRegion` — explicit state, caller-owned emptiness

The API is a discriminated union. `AsyncRegion` **never inspects data** and never
decides what "empty" means:

```ts
type AsyncRegionState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready" };
```

```tsx
<AsyncRegion
  empty={<EmptyState01 … />}
  error={(message) => <PageError message={message} />}
  loading={<CompaniesSkeleton />}
  state={state}
>
  <CompaniesTable />
</AsyncRegion>
```

**The error payload is a formatted `string`, not `unknown`** — a deliberate
departure from the review's literal sketch, forced by two existing signatures:

- `formatApiError(error: unknown, fallback = "Unknown error")` only unwraps
  `ApiClientError` and `Error`. Handed a plain string it falls through and returns
  `"Unknown error"`.
- `useAsyncLoad` already returns `error` as a **formatted string**.

So an `unknown` payload with a `<PageError error={…} />` callback would double-format
every message that came through the existing hook and silently replace it with
`"Unknown error"`. Formatting stays at the boundary where the repo already does it
(`formatApiError` at the catch site); the kit consumes the result. The review's
principle — caller owns the semantics — is preserved exactly; only the payload type
changes to match reality.

This is the single most important decision in the page kit. An API shaped around
`data === null` / `data.length === 0` would put a generic component in charge of a
distinction this domain treats as load-bearing — unknown, unavailable, empty, zero,
not-applicable and loading are six different things here, and a component that
infers between them will eventually infer wrong. The caller owns the mapping
because only the caller knows the payroll meaning.

### 3.3 `StatGrid` — layout only

`StatGrid` takes children, not data:

```tsx
<StatGrid>
  <StatisticsWithStatus … />
  <StatisticsWithStatus … />
</StatGrid>
```

Explicitly **not** `<StatGrid stats={…} loading={…} formatters={…} />`. A data-taking
`StatGrid` would freeze the current dashboard visual language into a shared
component *before* slices C–H redesign it — the abstraction would quietly become
the thing the redesign has to fight. All payroll semantics and every card-level
visual decision stay outside it. It owns the grid and nothing else.

### 3.4 Breadcrumb — data-free

`ShellBreadcrumb` must never acquire application-data responsibilities. This is
forbidden:

```
UUID → API call → resolve pay-run name
```

A shell that fetches is a shell that has opinions about payroll, which contradicts
the L5-only boundary this whole slice depends on.

Two sources instead, in order:

1. **Route metadata** supplies the static crumb — `{ path: "/pay-runs/:id",
   breadcrumb: "Pay Runs" }`, colocated with `APP_SHELL_ROUTE_PATHS`.
2. **The page optionally publishes its resolved leaf label** — it already has the
   data — giving `Pay Runs / Aug 2026 Regular Payroll`.

If neither yields a label, the crumb is omitted. It is never a raw URL segment.

**On using context here after rejecting it in §2:** the objection in §2 was
specific — `actions` is a `ReactNode`, so context turns it into state needing
`useMemo` or the shell re-renders every frame. A breadcrumb leaf is a plain
string: cheap to compare, no memoization hazard, no route-change flash worth
caring about. Different payload, different mechanism. Same reasoning, not a
contradiction.

### On the `/rui` `/cui` `/iui` gate

These kit components are composition and control-flow wrappers, not visual
invention — `AsyncRegion` decides *which* of three children renders, it does not
design them. Every **visual** decision inside them (empty-state treatment, table
card chrome, header typography) goes through `/rui` against the existing studio
blocks; `EmptyState01` is already installed. If a kit component starts wanting a
look of its own, that is the point where it needs `/cui`, and it gets flagged
rather than hand-built.

---

## 4. Data flow and invariants

**L5 only. Zero API surface change** — no `types.ts`, no `client.ts`, no
`payroll-api.ts`, no server, no schema. If a page turns out to need data it does
not have, that is logged as a `vite-fullstack` Mode A finding for a later slice,
never fixed inline. This is what keeps a 25-file diff safe to review.

Five invariants from [`presentation-facade.md`](../../architecture/presentation-facade.md) §5
constrain the kit directly:

1. **`AsyncRegion` must not conflate empty with unknown.** It never inspects data;
   the caller passes an explicit `status` (§3.2). `SEN_UNKNOWN` and
   `NOT_APPLICABLE` rendering stays entirely inside `MoneyCell`, untouched.
   Violating this is §5 rule 4 and §5.5 — rendering an unentered PCB as `0.00` —
   which the architecture doc names the single most damaging thing this layer can do.
   **This is enforced by test, not by discipline:** a case asserts that a `ready`
   region containing a null-sen figure renders unknown, never `0.00`, and that no
   `AsyncRegion` call site derives `status` from a money field. Written as prose
   only, this is exactly the invariant that erodes under a hurried adoption commit.
2. **No kit component formats or renders money.** `PageError`, `AsyncRegion`,
   `StatGrid` pass `ReactNode` through; they never see sen.
3. **No prose composed around figures.** The kit takes nodes and label keys; it does
   not build sentences next to numbers (§5.3).
4. **Tokens only.** Must stay green under `tests/domain/web-palette-leak.test.ts`.
5. **No authorization in the kit.** `AsyncRegion` gets no permission branch.
   RBAC-denied stays a page-level decision via presentation predicates; the server
   remains source of truth (§5.9).

---

## 5. Scope

**In scope:** the 11 shell/lib changes, the 5 kit components, and kit adoption
across the **22 page and panel files** that carry the duplicated patterns.

The 165-occurrence figure in §1 spans 25 files, but three of those —
`api/client.ts`, `context/auth-context.tsx`, `app.tsx` — match on `Skeleton` in a
non-page context and are not adoption targets. The 22 are: 7 feature pages,
`run-control-card`, `employee-import-panel`, `pay-run-list`, `payslip-page`,
`workspace`, 6 payrun panels, 2 drawers, and 2 dialogs.

Adoption everywhere was an explicit user decision, taken against a flagged
diff-size risk. The mitigation is §6: hub-by-hub with a commit each.

This also improves the program decomposition — slices C–H stop being mixed
mechanical-plus-visual work and become pure visual/UX redesign on a uniform base.

**Out of scope:**

- `src/web/payrun/payslip-document/` (14 files) — a print document with light-only
  `--doc-*` tokens. `PageHeader` and `AsyncRegion` have no meaning there.
- `src/marketing/` (13 files) — separate Vite entry, separate CSS, no shared
  imports by design.
- Replacing `useAsyncLoad`. The 8 hand-rolled loaders **adopt** the existing hook.
  If it proves inadequate for a real case, that is a finding for its own spec, not
  a rewrite smuggled into this one.
- Any visual redesign of page interiors. That is slices C–H.
- Transfer / treatments UI. API exists, no page — that is Mode A work in slice F.

---

## 6. Sequencing and verification

### Gate 0 — HARD STOP

78 files are uncommitted (+1465/−1193), including an untracked
`src/web/shadcn.css` and a modified `tests/domain/web-palette-leak.test.ts`. A
theme migration is mid-flight.

**Do not begin A+B until the theme migration is independently committed and
green.** This is a blocking precondition, not a sequencing preference. "Land or
park, either is fine" was too weak.

The reason is attribution. Four things can change what a page looks like:

```
token migration
shell refactor
component-kit adoption
page redesign
```

If the theme lands inside hub 1, no visual regression can be attributed to any one
of them, and the per-hub screenshot verification below becomes worthless — you
would be diffing against a baseline that moved for reasons unrelated to the hub.

The required order:

```
THEME  ──committed + tested──▶  A+B shell contract  ──▶  C–H visual redesign
```

### Rollout

Run through the `hub-refactor` skill. Steps 1–3 are architecture; step 5 is
mechanical.

| Step | Work | Why here |
|---|---|---|
| 0 | Theme migration — clean tree, green | hard gate above |
| 1 | Shell contract: real band, `ShellHeaderSlot`, `PageHeader`, TopBar decomposition, `user-identity`, `format-month`, breadcrumb | the contract |
| 2 | Page kit: `AsyncRegion`, `PageError`, `DataTableCard`, `StatGrid` + error classification (§3.1) | the vocabulary |
| 3 | **One representative adoption — `companies`** | see below |
| 4 | **Validate the architecture. Checkpoint.** | see below |
| 5 | Broad adoption: `employees` → `admin-users` → `pay-run` (list) → `dashboard` → `reports` → `control` → `pay-run` (workspace) | mechanical |
| 6 | Slices C–H begin | out of scope here |

**Steps 3–4 are load-bearing, not ceremony.** If `PageHeader` or `AsyncRegion` has
a poor API, discovering it on one page costs one revert. Discovering it after 22
page and panel files have adopted it costs the slice. The checkpoint at step 4 is
an explicit go/no-go on the API before the mechanical phase starts — and it is the
main reason a 38-file slice is acceptable at all.

### Commits

One per hub, for bisectability:

```
refactor(web): establish shell header contract
refactor(web): add presentation page kit
refactor(companies): adopt page kit
refactor(employees): adopt page kit
…
```

### Per-hub verification

- `npm exec -- ultracite check`
- typecheck
- `tests/domain/web-palette-leak.test.ts`
- the new `PageHeader` route-invariant test
- the new `AsyncRegion` unknown-vs-zero test (§4 invariant 1)
- golden master green (`tests/golden/july-2026-afenda.test.ts`) — it will be, since
  no domain code changes; it is checked because a green golden master is the
  repo's definition of "did not break payroll"
- a real browser pass on the `payroll-web` preview (port 5173) with a screenshot
  per hub, so "it renders" is evidence rather than a claim

### File headers

Touched files keep `@feature` / `@layer`; new shell files are `@feature shell
@layer ui`; new kit components are `@feature shared @layer ui`. Untagged audit
must stay clean for touched trees per
[`file-headers.md`](../../../.claude/skills/vite-fullstack/references/file-headers.md).

---

## 7. Program context — the remaining slices

Each gets its own spec → plan → implementation cycle.

| # | Slice | Files | Nature |
|---|---|---|---|
| **A+B** | **Shell contract + page kit** | **38** (9 shell + 2 lib + 5 kit + 22 adoption) | **this spec** |
| C | Directory pages visual pass | 4 | `/rui` `/cui` |
| D | Control + reports visual pass | 6 | `/rui` `/cui` |
| E | Payrun workspace visual pass | ~20 | `/rui` `/cui` |
| F | Transfer + treatments surfaces | new | `vite-fullstack` Mode A — API exists, no page |
| G | Payslip document | 14 | print discipline, own token system |
| H | Marketing | 13 | isolated Vite entry |

---

## 8. Amendment log

Review of 2026-08-10 accepted the architecture and required six corrections
before implementation. All are applied above.

| # | Amendment | Where |
|---|---|---|
| 1 | Portal slot made lifecycle-safe. The original "throw during render if no slot" was a **bug** — the slot ref is null on first commit, so it would misfire on legitimate ordering. Slot publishes via state; assertion moved post-mount. | §2 |
| 2 | `AsyncRegion` takes an explicit discriminated `status`. It never inspects data, and the caller owns what "empty" means — because only the caller knows the payroll meaning. | §3.2, §4.1 |
| 3 | The 23 error renders are **classified before replacement**. `PageError` covers page/region load failures only; form validation and single-operation failures keep their own treatments. | §3.1 |
| 4 | `StatGrid` is layout-only and takes children. A data-taking version would freeze the current dashboard visual language into a shared component before C–H redesign it. | §3.3 |
| 5 | Breadcrumb stays data-free — route metadata plus an optional page-published leaf label. The shell never resolves a UUID through the API. | §3.4 |
| 6 | Gate 0 upgraded from sequencing preference to **hard stop**, on attribution grounds: four independent sources of visual change must not land together. | §6 |

Also added: a closed 4-prop `PageHeader` API with no variants (§2); TopBar
measured by responsibility rather than a line-count target (§3); mobile sidebar
sheet accessibility called out as a verification item, since dropping the top-bar
avatar removes the mobile fallback (§3); representative-adoption and architecture-
validation checkpoint inserted before broad adoption (§6); per-hub commit
convention (§6).

Not adopted from the review: nothing. Scope held at 38 files as reviewed.

### One deliberate departure, found while planning

Amendment 2's literal sketch used `{ status: "error"; error: unknown }` with
`error={(error) => <PageError error={error} />}`. Implemented as written, this
would have destroyed every error message originating from `useAsyncLoad`, because
`formatApiError` returns `"Unknown error"` for a plain string and `useAsyncLoad`
already hands back a formatted one. The payload is therefore `message: string`
(§3.2). The amendment's principle is unchanged; only the type matches the
codebase.

### Test infrastructure gap found while planning

The vitest `web` project hardcodes `include: ["tests/domain/payslip-tokens.test.tsx"]`
— a single file. Every component test this spec relies on (`PageHeader` route
invariant, `AsyncRegion` unknown-vs-zero) would be written, pass locally when run
by path, and **never run in CI**. Widening that include is a prerequisite task,
not a detail.
