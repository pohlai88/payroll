# Shell Contract + Page Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shell's magic-number header band with a portal-based `PageHeader` contract, decompose `TopBar`, and introduce a five-component page kit — then adopt both across the 22 page/panel files.

**Architecture:** `ShellLayout` renders a real `bg-primary` band (intrinsic height) containing `TopBar` and a `ShellHeaderSlot`. The slot publishes its DOM node through React **state** (never a ref read during render), and `PageHeader` portals into it, returning `null` until the target exists. The page kit (`PageHeader`, `AsyncRegion`, `PageError`, `DataTableCard`, `StatGrid`) is composition and control flow only — it never inspects data, never formats money, never authorizes.

**Tech Stack:** Vite + React 19 + Wouter + Tailwind v4 + shadcn `base-nova` + shadcn-studio. Tests: Vitest projects (`domain`, `web`, `marketing`, `db`) + `@testing-library/react` + jsdom.

**Spec:** [2026-08-10-shell-page-kit-design.md](../specs/2026-08-10-shell-page-kit-design.md)

## Global Constraints

- **L5 only.** No change to `src/web/api/types.ts`, `client.ts`, `payroll-api.ts`, `src/server/**`, `src/service/**`, `src/repo/**`, `src/db/**`, `src/domain/**`. A page needing absent data is logged as a Mode B finding, never fixed inline.
- **Tokens only.** No raw hex, no Tailwind palette utilities (`bg-blue-500`), no `dark:` palette splits. Enforced by `tests/domain/web-palette-leak.test.ts`, which walks `src/web`, `src/components`, `src/assets`.
- **No money in the kit.** `PageHeader`, `AsyncRegion`, `PageError`, `DataTableCard`, `StatGrid` never receive or render sen. `MoneyCell` is untouched.
- **No authorization in the kit.** No permission branch in any kit component. RBAC-denied stays a page-level decision.
- **`AsyncRegion` never inspects data.** Caller passes an explicit `status`.
- **UI/UX via `/rui` `/cui` `/iui` only** (shadcn-studio MCP). These kit components are control-flow wrappers, which is permitted; any component that starts wanting a *look of its own* stops and goes through `/rui`.
- **File headers** on every new/touched file: `@feature <slug>` + `@layer <ui|spine|client|test>`. See `.claude/skills/vite-fullstack/references/file-headers.md`.
- **Ultracite/Biome:** arrow functions for callbacks, `for...of` over `.forEach`, `const` by default, explicit return types where they clarify, no barrel files, **JSX props sorted alphabetically**, `function X() {}` + `export { X }` at file end (repo convention).
- **Error payloads are pre-formatted strings.** `formatApiError(error: unknown, fallback = "Unknown error"): string` only unwraps `ApiClientError` and `Error` — handed a plain string it returns `"Unknown error"`. Format once at the catch site; the kit consumes `string`.
- Run `npm exec -- ultracite fix` before every commit.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `src/lib/format-month.ts` | Sole `reportingMonth` → label formatter |
| `src/lib/user-identity.ts` | Sole `initialsOf` / `firstNameOf` |
| `src/web/shell/shell-header-slot.tsx` | Portal target + slot context (state-based) |
| `src/web/shell/scope-picker.tsx` | Company scope popover, extracted from TopBar |
| `src/web/shell/reporting-month-picker.tsx` | Month popover using the `Input` primitive |
| `src/web/shell/command-trigger.tsx` | ⌘K button + global keydown |
| `src/web/shell/breadcrumb-meta.tsx` | Leaf-label context (`.tsx` — it renders providers) |
| `src/components/payroll/page-header.tsx` | `PageHeader` — portals into the slot |
| `src/components/payroll/async-region.tsx` | `AsyncRegion` + `AsyncRegionState` |
| `src/components/payroll/page-error.tsx` | `PageError` — page/region load failures only |
| `src/components/payroll/data-table-card.tsx` | `DataTableCard` |
| `src/components/payroll/stat-grid.tsx` | `StatGrid` — layout only, children only |
| `tests/web/format-month.test.ts` | Month formatter |
| `tests/web/user-identity.test.ts` | Identity helpers |
| `tests/web/page-header.test.tsx` | Portal lifecycle + closed API |
| `tests/web/async-region.test.tsx` | State dispatch + unknown-vs-zero invariant |
| `tests/web/shell-routes.test.tsx` | Every shell route renders exactly one `PageHeader` |
| `tests/web/breadcrumb.test.tsx` | No raw URL segments |

**Modified**

| Path | Change |
|---|---|
| `vitest.config.ts` | Widen `web` project include (currently one hardcoded file) |
| `src/web/shell/layout.tsx` | `before:` pseudo-band → real element + slot; `--sidebar` to CSS |
| `src/web/shell/top-bar.tsx` | 295 lines → composition only |
| `src/web/shell/sidebar-nav.tsx` | Sole user menu; import `initialsOf` |
| `src/web/shell/shell-breadcrumb.tsx` | Data-free crumb resolution |
| `src/web/shadcn.css` | `--sidebar` override |
| 22 page/panel files | Kit adoption (Tasks 15, 17) |

**Deleted:** `src/web/shell/page-title.tsx`

---

## Task 0: Gate 0 — clean baseline

**HARD STOP.** No task below may begin until this passes.

**Files:** none (verification only)

- [ ] **Step 1: Confirm the theme migration is committed**

```bash
git status --porcelain
```

Expected: **empty output**. If it lists files (78 at time of writing, including untracked `src/web/shadcn.css` and modified `tests/domain/web-palette-leak.test.ts`), STOP and land or park that work first. Do not proceed on a dirty tree — four independent sources of visual change (token migration, shell refactor, kit adoption, page redesign) must not land together, or per-hub screenshot verification is meaningless.

- [ ] **Step 2: Confirm the suite is green**

```bash
npm run typecheck && npm test && npm exec -- ultracite check
```

Expected: all pass. Note the `db` project needs Docker Postgres; if unavailable run `npx vitest run --project domain --project web --project marketing` and record that `db` was not exercised.

- [ ] **Step 3: Create the working branch**

```bash
git checkout -b refactor/shell-page-kit
```

---

## Task 1: Enable component tests + month formatter

The `web` vitest project currently hardcodes `include: ["tests/domain/payslip-tokens.test.tsx"]`. Every test in this plan would pass locally by path and **never run in CI**. Fixing that is folded in here, with the first helper as its proof.

**Files:**
- Modify: `vitest.config.ts` (the `web` project block)
- Create: `src/lib/format-month.ts`
- Test: `tests/web/format-month.test.ts`

**Interfaces:**
- Produces: `formatReportingMonth(value: string, style: "short" | "long"): string`

- [ ] **Step 1: Widen the `web` project include**

In `vitest.config.ts`, in the project named `"web"`, replace the `include` line:

```ts
          include: [
            "tests/domain/payslip-tokens.test.tsx",
            "tests/web/**/*.test.ts",
            "tests/web/**/*.test.tsx",
          ],
```

Leave `environment`, `globals`, `isolate`, `maxWorkers` and the `react()` plugin unchanged.

- [ ] **Step 2: Write the failing test**

Create `tests/web/format-month.test.ts`:

```ts
/**
 * @feature shell
 * @layer test
 */

import { describe, expect, it } from "vitest";
import { formatReportingMonth } from "@/lib/format-month";

describe("formatReportingMonth", () => {
  it("renders the short style", () => {
    expect(formatReportingMonth("2026-08", "short")).toBe("Aug 2026");
  });

  it("renders the long style", () => {
    expect(formatReportingMonth("2026-08", "long")).toBe("August 2026");
  });

  it("returns the raw value when the month is unparseable", () => {
    expect(formatReportingMonth("not-a-month", "short")).toBe("not-a-month");
  });

  it("returns the raw value when the month is out of range", () => {
    expect(formatReportingMonth("2026-13", "short")).toBe("2026-13");
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
npx vitest run --project web tests/web/format-month.test.ts
```

Expected: FAIL — cannot resolve `@/lib/format-month`. If instead it reports "No test files found", Step 1 was not applied correctly.

- [ ] **Step 4: Implement**

Create `src/lib/format-month.ts`:

```ts
/**
 * @feature shell
 * @layer ui
 *
 * Single reporting-month formatter. Two call sites previously disagreed
 * (`Aug 2026` in the top bar, `August 2026` on the dashboard) because each
 * built its own Intl formatter.
 */

const MIN_MONTH = 1;
const MAX_MONTH = 12;

function formatReportingMonth(
  value: string,
  style: "short" | "long"
): string {
  const [year, month] = value.split("-").map(Number);
  const parseable =
    year !== undefined &&
    month !== undefined &&
    Number.isFinite(year) &&
    Number.isFinite(month) &&
    month >= MIN_MONTH &&
    month <= MAX_MONTH;

  if (!parseable) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    month: style,
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

export { formatReportingMonth };
```

- [ ] **Step 5: Run it and confirm it passes**

```bash
npx vitest run --project web tests/web/format-month.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
npm exec -- ultracite fix
git add vitest.config.ts src/lib/format-month.ts tests/web/format-month.test.ts
git commit -m "test(web): run tests/web in the web project; add month formatter"
```

---

## Task 2: User identity helpers

`initialsOf` is duplicated verbatim in `sidebar-nav.tsx:31` and `top-bar.tsx:49`; `firstNameOf` lives only in `top-bar.tsx:72`.

**Files:**
- Create: `src/lib/user-identity.ts`
- Test: `tests/web/user-identity.test.ts`

**Interfaces:**
- Produces: `initialsOf(me: IdentityLike | null): string`, `firstNameOf(me: IdentityLike | null): string`, `type IdentityLike = { name: string; email: string }`

- [ ] **Step 1: Write the failing test**

Create `tests/web/user-identity.test.ts`:

```ts
/**
 * @feature shell
 * @layer test
 */

import { describe, expect, it } from "vitest";
import { firstNameOf, initialsOf } from "@/lib/user-identity";

describe("initialsOf", () => {
  it("uses the first two characters of the name", () => {
    expect(initialsOf({ name: "Aisyah Rahman", email: "a@x.my" })).toBe("AI");
  });

  it("falls back to the email when the name is blank", () => {
    expect(initialsOf({ name: "   ", email: "zul@x.my" })).toBe("ZU");
  });

  it("returns ?? for a null identity", () => {
    expect(initialsOf(null)).toBe("??");
  });
});

describe("firstNameOf", () => {
  it("returns the first whitespace-separated token", () => {
    expect(firstNameOf({ name: "Aisyah Rahman", email: "a@x.my" })).toBe(
      "Aisyah"
    );
  });

  it("falls back to the email local part when the name is blank", () => {
    expect(firstNameOf({ name: "", email: "zul@x.my" })).toBe("zul");
  });

  it("returns 'there' for a null identity", () => {
    expect(firstNameOf(null)).toBe("there");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run --project web tests/web/user-identity.test.ts
```

Expected: FAIL — cannot resolve `@/lib/user-identity`.

- [ ] **Step 3: Implement**

Create `src/lib/user-identity.ts`:

```ts
/**
 * @feature shell
 * @layer ui
 *
 * Identity display helpers. Previously duplicated verbatim between
 * `sidebar-nav.tsx` and `top-bar.tsx`.
 */

const INITIALS_LENGTH = 2;

type IdentityLike = { readonly name: string; readonly email: string };

function initialsOf(me: IdentityLike | null): string {
  if (me === null) {
    return "??";
  }
  const source = me.name.trim() === "" ? me.email : me.name;
  return source.slice(0, INITIALS_LENGTH).toUpperCase();
}

function firstNameOf(me: IdentityLike | null): string {
  if (me === null) {
    return "there";
  }
  const name = me.name.trim();
  if (name === "") {
    return me.email.split("@")[0] || "there";
  }
  return name.split(/\s+/)[0] ?? name;
}

export { firstNameOf, initialsOf, type IdentityLike };
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
npx vitest run --project web tests/web/user-identity.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
npm exec -- ultracite fix
git add src/lib/user-identity.ts tests/web/user-identity.test.ts
git commit -m "refactor(web): extract shared user identity helpers"
```

---

## Task 3: `ShellHeaderSlot` — lifecycle-safe portal target

The slot publishes its DOM node via **state**. A ref would be `null` during the first render pass (shell and children commit together), which is exactly the lifecycle bug this design exists to avoid.

**Files:**
- Create: `src/web/shell/shell-header-slot.tsx`

**Interfaces:**
- Produces: `<ShellHeaderSlotProvider>`, `<ShellHeaderSlot />`, `useShellHeaderSlot(): HTMLElement | null`

- [ ] **Step 1: Implement the slot**

Create `src/web/shell/shell-header-slot.tsx`:

```tsx
/**
 * @feature shell
 * @layer ui
 *
 * Portal target for `PageHeader`.
 *
 * The node is published through state, not a ref: shell and routed children
 * commit in the same pass, so a ref read during render is `null` and any
 * assertion on it misfires on legitimate ordering.
 */

import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

const ShellHeaderSlotContext = createContext<HTMLElement | null>(null);
const ShellHeaderSlotSetterContext = createContext<
  ((node: HTMLElement | null) => void) | null
>(null);

function ShellHeaderSlotProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const setter = useMemo(() => setNode, []);

  return (
    <ShellHeaderSlotSetterContext value={setter}>
      <ShellHeaderSlotContext value={node}>{children}</ShellHeaderSlotContext>
    </ShellHeaderSlotSetterContext>
  );
}

function ShellHeaderSlot() {
  const setNode = useContext(ShellHeaderSlotSetterContext);
  return <div ref={setNode} />;
}

function useShellHeaderSlot(): HTMLElement | null {
  return useContext(ShellHeaderSlotContext);
}

export { ShellHeaderSlot, ShellHeaderSlotProvider, useShellHeaderSlot };
```

Note: `<Context value={…}>` is the React 19 form; the repo is on React 19 (`ref` as a prop is already the house style per CLAUDE.md).

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npm exec -- ultracite fix
git add src/web/shell/shell-header-slot.tsx
git commit -m "feat(shell): add lifecycle-safe header portal slot"
```

---

## Task 4: `PageHeader`

**Files:**
- Create: `src/components/payroll/page-header.tsx`
- Test: `tests/web/page-header.test.tsx`

**Interfaces:**
- Consumes: `useShellHeaderSlot` (Task 3)
- Produces: `PageHeader` with the closed API `{ title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }`

- [ ] **Step 1: Write the failing test**

Create `tests/web/page-header.test.tsx`:

```tsx
/**
 * @feature shell
 * @layer test
 *
 * The portal contract: no throw when the slot is absent, content lands in the
 * slot when present.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "@/components/payroll/page-header";
import {
  ShellHeaderSlot,
  ShellHeaderSlotProvider,
} from "@/web/shell/shell-header-slot";

describe("PageHeader", () => {
  it("renders nothing and does not throw when no slot is mounted", () => {
    expect(() =>
      render(
        <ShellHeaderSlotProvider>
          <PageHeader title="Dashboard" />
        </ShellHeaderSlotProvider>
      )
    ).not.toThrow();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("portals the title into the slot", async () => {
    render(
      <ShellHeaderSlotProvider>
        <ShellHeaderSlot />
        <PageHeader description="Pay-run analytics" title="Dashboard" />
      </ShellHeaderSlotProvider>
    );
    expect(
      await screen.findByRole("heading", { name: "Dashboard" })
    ).toBeTruthy();
    expect(screen.getByText("Pay-run analytics")).toBeTruthy();
  });

  it("renders actions and meta when supplied", async () => {
    render(
      <ShellHeaderSlotProvider>
        <ShellHeaderSlot />
        <PageHeader
          actions={<button type="button">Add company</button>}
          meta={<span>3 entities</span>}
          title="Companies"
        />
      </ShellHeaderSlotProvider>
    );
    expect(
      await screen.findByRole("button", { name: "Add company" })
    ).toBeTruthy();
    expect(screen.getByText("3 entities")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run --project web tests/web/page-header.test.tsx
```

Expected: FAIL — cannot resolve `@/components/payroll/page-header`.

- [ ] **Step 3: Implement**

Create `src/components/payroll/page-header.tsx`:

```tsx
/**
 * @feature shell
 * @layer ui
 *
 * The page heading, rendered into the shell's primary band via portal.
 *
 * The band owns `bg-primary`; this component owns `text-primary-foreground`.
 * Because both live here, no arrangement of page content can strand a heading
 * on the wrong surface — which is what the previous `PageTitle` + fixed
 * `before:h-[26.25rem]` pseudo-band could not guarantee.
 *
 * The prop set is deliberately closed: no variant, size, alignment or tone.
 * Every variant is a licence for pages to drift apart again.
 */

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useShellHeaderSlot } from "@/web/shell/shell-header-slot";

type PageHeaderProps = {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly meta?: ReactNode;
};

function PageHeader({ title, description, actions, meta }: PageHeaderProps) {
  const target = useShellHeaderSlot();

  if (target === null) {
    return null;
  }

  return createPortal(
    <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 pt-4 pb-6 sm:px-6">
      <div className="min-w-0">
        <h1 className="truncate font-semibold text-2xl text-primary-foreground tracking-tight">
          {title}
        </h1>
        {description === undefined ? null : (
          <p className="mt-1 text-primary-foreground/70 text-sm">
            {description}
          </p>
        )}
        {meta === undefined ? null : <div className="mt-2">{meta}</div>}
      </div>
      {actions ?? null}
    </div>,
    target
  );
}

export { PageHeader, type PageHeaderProps };
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
npx vitest run --project web tests/web/page-header.test.tsx
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
npm exec -- ultracite fix
git add src/components/payroll/page-header.tsx tests/web/page-header.test.tsx
git commit -m "feat(shell): add PageHeader with closed API and portal contract"
```

---

## Task 5: Convert the band in `ShellLayout`

**Files:**
- Modify: `src/web/shell/layout.tsx`
- Modify: `src/web/shadcn.css`

**Interfaces:**
- Consumes: `ShellHeaderSlotProvider`, `ShellHeaderSlot` (Task 3)

- [ ] **Step 1: Move the `--sidebar` override into CSS**

Append to `src/web/shadcn.css` (inside the existing `:root`-level layer where the other sidebar tokens live — locate `--sidebar-width` or `--sidebar` if present and place alongside):

```css
/* Shell sidebar sizing — previously an inline style prop on SidebarProvider. */
:root {
  --sidebar: var(--card);
  --sidebar-width: 17.5rem;
  --sidebar-width-icon: 3.375rem;
}
```

- [ ] **Step 2: Replace the pseudo-band with a real element**

In `src/web/shell/layout.tsx`, replace the whole `ShellLayout` function body. Remove the `CSSProperties` import and the `style` prop; remove `before:fixed before:inset-x-0 before:top-0 before:h-[26.25rem] before:bg-primary`:

```tsx
function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-muted">
      <SidebarProvider>
        <ShellNavProvider>
          <ShellHeaderSlotProvider>
            <SidebarNav />
            <div className="z-1 flex min-w-0 flex-1 flex-col overflow-hidden py-6">
              <div className="bg-primary">
                <TopBar />
                <ShellHeaderSlot />
              </div>
              <IdentityBanner />
              <main className="mx-auto size-full max-w-7xl flex-1 overflow-auto px-4 py-6 sm:px-6">
                {children}
              </main>
            </div>
          </ShellHeaderSlotProvider>
        </ShellNavProvider>
      </SidebarProvider>
      <Toaster />
    </div>
  );
}
```

Add to the imports:

```tsx
import {
  ShellHeaderSlot,
  ShellHeaderSlotProvider,
} from "./shell-header-slot";
```

- [ ] **Step 3: Verify the band renders and the magic number is gone**

```bash
npm run typecheck && grep -rn "26.25rem" src/ || echo "magic number gone"
```

Expected: typecheck passes; the grep prints `magic number gone`.

- [ ] **Step 4: Palette guard**

```bash
npx vitest run --project domain tests/domain/web-palette-leak.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm exec -- ultracite fix
git add src/web/shell/layout.tsx src/web/shadcn.css
git commit -m "refactor(shell): real header band replaces fixed pseudo-element"
```

---

## Task 6: Extract `ScopePicker`

**Files:**
- Create: `src/web/shell/scope-picker.tsx`
- Modify: `src/web/shell/top-bar.tsx`

**Interfaces:**
- Produces: `ScopePicker` — no props; reads `useAuthContext` and `useScopeContext` directly

- [ ] **Step 1: Create the component**

Move the scope `Popover` block (currently `top-bar.tsx:159-216`) plus `computeScopeLabel` (`top-bar.tsx:57`), `toggleCompany` (`:96`), `selectAll` (`:113`) and `selectedNames` (`:126`) verbatim into `src/web/shell/scope-picker.tsx`:

```tsx
/**
 * @feature shell
 * @layer ui
 *
 * Company scope selector. Extracted from `top-bar.tsx`, which was doing seven
 * jobs in 295 lines.
 */

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/web/context/auth-context";
import { useScopeContext } from "@/web/context/scope-context";

const MAX_SHOWN_NAMES = 3;

function computeScopeLabel(
  allSelected: boolean,
  selectedNames: readonly string[]
): string {
  if (allSelected) {
    return "All Companies";
  }
  if (selectedNames.length === 0) {
    return "Select at least one company";
  }
  const shown = selectedNames.slice(0, MAX_SHOWN_NAMES).join(", ");
  const remainder = selectedNames.length - MAX_SHOWN_NAMES;
  return remainder > 0 ? `${shown} +${String(remainder)} more` : shown;
}

function ScopePicker() {
  const { me } = useAuthContext();
  const { scope, setScope } = useScopeContext();
  const [open, setOpen] = useState(false);

  const companies = me?.companies ?? [];
  const selectedIds = scope.mode === "selected" ? scope.companyIds : [];
  const allSelected = scope.mode === "all";

  const toggleCompany = useCallback(
    (id: string) => {
      if (allSelected) {
        setScope({ mode: "selected", companyIds: [id] });
        return;
      }
      const next = selectedIds.includes(id)
        ? selectedIds.filter((c) => c !== id)
        : [...selectedIds, id];
      if (next.length === 0) {
        return;
      }
      setScope({ mode: "selected", companyIds: next });
    },
    [allSelected, selectedIds, setScope]
  );

  const selectAll = useCallback(() => setScope({ mode: "all" }), [setScope]);

  const selectedNames = companies
    .filter((c) => selectedIds.includes(c.id))
    .map((c) => c.name);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            className="h-8 max-w-48 gap-1 truncate border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground aria-expanded:bg-primary-foreground/20 aria-expanded:text-primary-foreground"
            size="sm"
            variant="outline"
          />
        }
      >
        <span className="truncate text-xs">
          {computeScopeLabel(allSelected, selectedNames)}
        </span>
        <ChevronsUpDownIcon className="size-3 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search companies…" />
          <CommandList>
            <CommandEmpty>No companies found.</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={selectAll} value="__all__">
                <CheckIcon
                  className={cn(
                    "mr-2 size-4",
                    allSelected ? "opacity-100" : "opacity-0"
                  )}
                />
                All Companies
              </CommandItem>
              {companies.map((company) => (
                <CommandItem
                  key={company.id}
                  onSelect={() => {
                    toggleCompany(company.id);
                  }}
                  value={`${company.code} ${company.name}`}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 size-4",
                      selectedIds.includes(company.id)
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{company.name}</span>
                    <span className="truncate font-mono text-muted-foreground text-xs">
                      {company.code}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { ScopePicker };
```

- [ ] **Step 2: Replace the block in `top-bar.tsx` with `<ScopePicker />`**

Delete the moved code and its now-unused imports (`CheckIcon`, `ChevronsUpDownIcon`, `Command*`, `Popover*` if unused by the month picker at this point, `cn`, `useScopeContext` if unused).

- [ ] **Step 3: Typecheck and lint**

```bash
npm run typecheck && npm exec -- ultracite check
```

Expected: PASS, no unused imports.

- [ ] **Step 4: Commit**

```bash
npm exec -- ultracite fix
git add src/web/shell/scope-picker.tsx src/web/shell/top-bar.tsx
git commit -m "refactor(shell): extract ScopePicker from TopBar"
```

---

## Task 7: Extract `ReportingMonthPicker` using the `Input` primitive

**Files:**
- Create: `src/web/shell/reporting-month-picker.tsx`
- Modify: `src/web/shell/top-bar.tsx`

**Interfaces:**
- Consumes: `formatReportingMonth` (Task 1)
- Produces: `ReportingMonthPicker` — no props

- [ ] **Step 1: Create the component**

Create `src/web/shell/reporting-month-picker.tsx`. The raw `<input type="month">` with hand-rolled classes (`top-bar.tsx:238`) becomes the `Input` primitive:

```tsx
/**
 * @feature shell
 * @layer ui
 *
 * Reporting-month selector. The control is the shadcn `Input` primitive —
 * the previous hand-rolled `<input>` carried its own border/bg classes and
 * drifted from every other field in the app.
 */

import type { ChangeEvent } from "react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatReportingMonth } from "@/lib/format-month";
import { useScopeContext } from "@/web/context/scope-context";

function ReportingMonthPicker() {
  const { reportingMonth, setReportingMonth } = useScopeContext();
  const [open, setOpen] = useState(false);

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.currentTarget.value !== "") {
        setReportingMonth(event.currentTarget.value);
      }
    },
    [setReportingMonth]
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            className="h-8 border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground aria-expanded:bg-primary-foreground/20 aria-expanded:text-primary-foreground"
            size="sm"
            variant="outline"
          />
        }
      >
        <span className="text-xs">
          {formatReportingMonth(reportingMonth, "short")}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-muted-foreground text-xs" htmlFor="reporting-month">
            Reporting month
          </Label>
          <Input
            id="reporting-month"
            onChange={onChange}
            type="month"
            value={reportingMonth}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { ReportingMonthPicker };
```

- [ ] **Step 2: Replace the block in `top-bar.tsx` with `<ReportingMonthPicker />`**

Delete `formatReportingMonth` (`top-bar.tsx:37`), `onReportingMonthChange` (`:117`), `monthOpen` state and the month `Popover` block (`:218-247`), plus now-unused imports.

- [ ] **Step 3: Typecheck and lint**

```bash
npm run typecheck && npm exec -- ultracite check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npm exec -- ultracite fix
git add src/web/shell/reporting-month-picker.tsx src/web/shell/top-bar.tsx
git commit -m "refactor(shell): extract ReportingMonthPicker onto the Input primitive"
```

---

## Task 8: Extract `CommandTrigger`, drop the duplicate user menu

`SimpleProfileDropdown` currently renders in both the sidebar footer and the top bar, each with its own theme toggle and sign-out. The sidebar footer becomes the sole user menu.

**Files:**
- Create: `src/web/shell/command-trigger.tsx`
- Modify: `src/web/shell/top-bar.tsx`
- Modify: `src/web/shell/sidebar-nav.tsx`

**Interfaces:**
- Consumes: `firstNameOf`, `initialsOf` (Task 2)
- Produces: `CommandTrigger` — no props; owns the ⌘K keydown and `CommandPalette`

- [ ] **Step 1: Create `CommandTrigger`**

Create `src/web/shell/command-trigger.tsx`, moving the search `Button` (`top-bar.tsx:249-261`), `cmdOpen` state, `openCommandPalette` and the ⌘K `useEffect` (`:131-140`):

```tsx
/**
 * @feature shell
 * @layer ui
 *
 * ⌘K search affordance and its global key handler.
 */

import { SearchIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "./command-palette";

function CommandTrigger() {
  const [open, setOpen] = useState(false);
  const openPalette = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <Button
        className="h-8 gap-2 border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground aria-expanded:bg-primary-foreground/20 aria-expanded:text-primary-foreground"
        onClick={openPalette}
        size="sm"
        type="button"
        variant="outline"
      >
        <SearchIcon className="size-3" />
        <span className="hidden text-xs lg:inline">Search or jump…</span>
        <Badge className="ml-1 border-0 bg-primary-foreground/20 px-1 py-0 text-primary-foreground text-xs">
          ⌘K
        </Badge>
      </Button>
      <CommandPalette onOpenChange={setOpen} open={open} />
    </>
  );
}

export { CommandTrigger };
```

- [ ] **Step 2: Reduce `top-bar.tsx` to composition**

`top-bar.tsx` becomes — note the removed `SimpleProfileDropdown`, `Avatar`, `useDarkMode`, `initialsOf`, `signOut`:

```tsx
/**
 * @feature shell
 * @layer ui
 *
 * Top bar — composition only. Context (greeting + breadcrumb) on the left,
 * scope / period / search on the right. The user menu lives once, in the
 * sidebar footer.
 */

import MenuTrigger from "@/components/shadcn-studio/blocks/menu-trigger";
import { firstNameOf } from "@/lib/user-identity";
import { useAuthContext } from "@/web/context/auth-context";
import { CommandTrigger } from "./command-trigger";
import { ReportingMonthPicker } from "./reporting-month-picker";
import { ScopePicker } from "./scope-picker";
import { ShellBreadcrumb } from "./shell-breadcrumb";

function TopBar() {
  const { me } = useAuthContext();

  return (
    <header className="text-primary-foreground">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <MenuTrigger
            className="border-primary-foreground! bg-primary-foreground! text-primary! shadow-none hover:bg-primary-foreground/90! hover:text-primary! aria-expanded:bg-primary-foreground/90! aria-expanded:text-primary!"
            variant="outline"
          />
          <div className="hidden min-w-0 sm:flex sm:flex-col sm:items-start">
            <p className="truncate font-semibold text-lg">
              Hey, {firstNameOf(me)}
            </p>
            <ShellBreadcrumb />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
          <ScopePicker />
          <ReportingMonthPicker />
          <CommandTrigger />
        </div>
      </div>
    </header>
  );
}

export { TopBar };
```

- [ ] **Step 3: Point `sidebar-nav.tsx` at the shared helper**

Delete the local `initialsOf` (`sidebar-nav.tsx:31-37`) and import it:

```tsx
import { initialsOf } from "@/lib/user-identity";
```

- [ ] **Step 4: Verify the mobile sheet still reaches the user menu**

Dropping the top-bar avatar removes the mobile fallback, so this is a required check, not an optional one.

```bash
npm run dev
```

Then in the Browser pane: resize to the `mobile` preset, reload, open the sidebar sheet via `MenuTrigger`, and confirm the footer user menu is reachable and its Sign out / theme items work. If the footer is clipped or unreachable in the sheet, fix it here — do not defer.

- [ ] **Step 5: Confirm one user menu remains**

```bash
grep -rn "SimpleProfileDropdown" src/web/shell/
```

Expected: matches in `sidebar-nav.tsx` only.

- [ ] **Step 6: Commit**

```bash
npm exec -- ultracite fix
git add src/web/shell/command-trigger.tsx src/web/shell/top-bar.tsx src/web/shell/sidebar-nav.tsx
git commit -m "refactor(shell): extract CommandTrigger; single user menu in sidebar"
```

---

## Task 9: Data-free breadcrumb

`shell-breadcrumb.tsx:58` prints `location.split("/").filter(Boolean).at(-1)`, so `/pay-runs/<uuid>` renders a UUID. The shell must not resolve that through the API — a fetching shell has opinions about payroll, which breaks the L5-only boundary.

**Files:**
- Create: `src/web/shell/breadcrumb-meta.tsx`
- Modify: `src/web/shell/shell-breadcrumb.tsx`
- Test: `tests/web/breadcrumb.test.tsx`

**Interfaces:**
- Produces: `BreadcrumbLeafProvider`, `useSetBreadcrumbLeaf(label: string | null): void`, `useBreadcrumbLeaf(): string | null`

Context is acceptable here where it was rejected for `PageHeader`: a leaf label is a plain string (cheap to compare, no memoization hazard), whereas `actions` is a `ReactNode`.

- [ ] **Step 1: Write the failing test**

Create `tests/web/breadcrumb.test.tsx`:

```tsx
/**
 * @feature shell
 * @layer test
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  BreadcrumbLeafProvider,
  useSetBreadcrumbLeaf,
} from "@/web/shell/breadcrumb-meta";
import { ShellNavProvider } from "@/web/shell/shell-nav-context";
import { ShellBreadcrumb } from "@/web/shell/shell-breadcrumb";

const UUID = "4bd786ce-0000-4000-8000-000000000000";

function Harness({ leaf, path }: { leaf: string | null; path: string }) {
  const { hook } = memoryLocation({ path });
  return (
    <Router hook={hook}>
      <ShellNavProvider>
        <BreadcrumbLeafProvider>
          <LeafPublisher leaf={leaf} />
          <ShellBreadcrumb />
        </BreadcrumbLeafProvider>
      </ShellNavProvider>
    </Router>
  );
}

function LeafPublisher({ leaf }: { leaf: string | null }) {
  useSetBreadcrumbLeaf(leaf);
  return null;
}

describe("ShellBreadcrumb", () => {
  it("never renders a raw URL segment", () => {
    render(<Harness leaf={null} path={`/pay-runs/${UUID}`} />);
    expect(screen.queryByText(UUID)).toBeNull();
  });

  it("renders the section crumb from route metadata", () => {
    render(<Harness leaf={null} path={`/pay-runs/${UUID}`} />);
    expect(screen.getByText("Pay Runs")).toBeTruthy();
  });

  it("renders a page-published leaf label when present", () => {
    render(
      <Harness leaf="Aug 2026 Regular Payroll" path={`/pay-runs/${UUID}`} />
    );
    expect(screen.getByText("Aug 2026 Regular Payroll")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run --project web tests/web/breadcrumb.test.tsx
```

Expected: FAIL — cannot resolve `@/web/shell/breadcrumb-meta`.

- [ ] **Step 3: Implement the leaf context**

Create `src/web/shell/breadcrumb-meta.tsx` (`.tsx`, not `.ts` — it renders providers):

```tsx
/**
 * @feature shell
 * @layer ui
 *
 * Breadcrumb leaf label, published by the page that owns the data.
 *
 * The shell must never resolve an id through the API: a fetching shell
 * acquires application-data responsibilities and breaks the L5-only boundary.
 * A page already holds the run label, so it publishes it here. A plain string
 * is cheap to compare, so context carries no memoization hazard.
 */

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";

const BreadcrumbLeafContext = createContext<string | null>(null);
const BreadcrumbLeafSetterContext = createContext<
  ((label: string | null) => void) | null
>(null);

function BreadcrumbLeafProvider({ children }: { children: ReactNode }) {
  const [leaf, setLeaf] = useState<string | null>(null);
  return (
    <BreadcrumbLeafSetterContext value={setLeaf}>
      <BreadcrumbLeafContext value={leaf}>{children}</BreadcrumbLeafContext>
    </BreadcrumbLeafSetterContext>
  );
}

function useBreadcrumbLeaf(): string | null {
  return useContext(BreadcrumbLeafContext);
}

function useSetBreadcrumbLeaf(label: string | null): void {
  const setLeaf = useContext(BreadcrumbLeafSetterContext);
  useEffect(() => {
    setLeaf?.(label);
    return () => setLeaf?.(null);
  }, [label, setLeaf]);
}

export {
  BreadcrumbLeafProvider,
  useBreadcrumbLeaf,
  useSetBreadcrumbLeaf,
};
```

- [ ] **Step 4: Update `shell-breadcrumb.tsx`**

Replace the nested-crumb branch (`:53-62`). The raw-segment expression is deleted outright:

```tsx
  const leaf = useBreadcrumbLeaf();

  // …existing Home + section crumbs unchanged…

        {isNested && leaf !== null ? (
          <>
            <BreadcrumbSeparator className="text-primary-foreground/40" />
            <BreadcrumbItem>
              <BreadcrumbPage className="max-w-40 truncate text-primary-foreground">
                {leaf}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
```

Add `BreadcrumbLeafProvider` to `ShellLayout` (Task 5's tree), wrapping the same subtree as `ShellHeaderSlotProvider`.

- [ ] **Step 5: Run it and confirm it passes**

```bash
npx vitest run --project web tests/web/breadcrumb.test.tsx
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
npm exec -- ultracite fix
git add src/web/shell/breadcrumb-meta.tsx src/web/shell/shell-breadcrumb.tsx src/web/shell/layout.tsx tests/web/breadcrumb.test.tsx
git commit -m "fix(shell): breadcrumb renders labels, never raw URL segments"
```

---

## Task 10: `PageError` + error classification

**Files:**
- Create: `src/components/payroll/page-error.tsx`
- Create: `docs/superpowers/plans/2026-08-10-error-classification.md`

**Interfaces:**
- Produces: `PageError` with props `{ message: string }`

- [ ] **Step 1: Classify all 23 error renders before writing any code**

```bash
grep -rn 'text-destructive text-sm\|role="alert"' src/web
```

For each of the 23 hits, record one row in `docs/superpowers/plans/2026-08-10-error-classification.md`:

```markdown
| File:line | Current text | Kind | Target |
|---|---|---|---|
| companies-page.tsx:190 | `{error}` | page/region load | PageError |
| … | | form validation \| single-operation \| page/region load | FormMessage \| Alert \| PageError |
```

**Only rows marked `page/region load` are replaced by `PageError`.** Form validation keeps field-level treatment; single-operation failures keep a local `Alert`. Widening `PageError` past its name is how a shared component becomes a dumping ground.

- [ ] **Step 2: Implement**

Create `src/components/payroll/page-error.tsx`:

```tsx
/**
 * @feature shared
 * @layer ui
 *
 * A failed page or region load.
 *
 * Deliberately NOT the component for form-field validation or single-operation
 * failures — see docs/superpowers/plans/2026-08-10-error-classification.md.
 *
 * Takes an already-formatted message. `formatApiError` runs once, at the catch
 * site; handed a plain string it would return "Unknown error", so this
 * component must never re-format.
 */

import { Alert, AlertTitle } from "@/components/ui/alert";

function PageError({ message }: { readonly message: string }) {
  return (
    <Alert role="alert" variant="destructive">
      <AlertTitle>{message}</AlertTitle>
    </Alert>
  );
}

export { PageError };
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npm exec -- ultracite fix
git add src/components/payroll/page-error.tsx docs/superpowers/plans/2026-08-10-error-classification.md
git commit -m "feat(web): add PageError and classify existing error renders"
```

---

## Task 11: `AsyncRegion`

The single most important component in the kit. It **never inspects data**; the caller supplies an explicit status, because only the caller knows whether a payroll value is unknown, unavailable, empty, zero or not-applicable.

**Files:**
- Create: `src/components/payroll/async-region.tsx`
- Test: `tests/web/async-region.test.tsx`

**Interfaces:**
- Consumes: `PageError` (Task 10)
- Produces: `AsyncRegion`, `type AsyncRegionState = { status: "loading" } | { status: "error"; message: string } | { status: "empty" } | { status: "ready" }`

- [ ] **Step 1: Write the failing test**

Create `tests/web/async-region.test.tsx`:

```tsx
/**
 * @feature shared
 * @layer test
 *
 * Includes the unknown-vs-zero invariant: a `ready` region containing a null
 * sen figure must render unknown, never 0.00. Prose alone erodes under a
 * hurried adoption commit; this is the test that stops it.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AsyncRegion,
  type AsyncRegionState,
} from "@/components/payroll/async-region";

function renderState(state: AsyncRegionState) {
  return render(
    <AsyncRegion
      empty={<p>No rows</p>}
      error={(message) => <p>{message}</p>}
      loading={<p>Loading…</p>}
      state={state}
    >
      <p>Content</p>
    </AsyncRegion>
  );
}

describe("AsyncRegion", () => {
  it("renders the loading branch", () => {
    renderState({ status: "loading" });
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByText("Content")).toBeNull();
  });

  it("renders the error branch with the supplied message verbatim", () => {
    renderState({ status: "error", message: "CONFLICT: run is sealed" });
    expect(screen.getByText("CONFLICT: run is sealed")).toBeTruthy();
  });

  it("renders the empty branch", () => {
    renderState({ status: "empty" });
    expect(screen.getByText("No rows")).toBeTruthy();
    expect(screen.queryByText("Content")).toBeNull();
  });

  it("renders children when ready", () => {
    renderState({ status: "ready" });
    expect(screen.getByText("Content")).toBeTruthy();
  });

  it("treats a ready region holding an unknown figure as ready, not empty", () => {
    render(
      <AsyncRegion
        empty={<p>No rows</p>}
        error={(message) => <p>{message}</p>}
        loading={<p>Loading…</p>}
        state={{ status: "ready" }}
      >
        <p>{"—"}</p>
      </AsyncRegion>
    );
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("0.00")).toBeNull();
    expect(screen.queryByText("No rows")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run --project web tests/web/async-region.test.tsx
```

Expected: FAIL — cannot resolve `@/components/payroll/async-region`.

- [ ] **Step 3: Implement**

Create `src/components/payroll/async-region.tsx`:

```tsx
/**
 * @feature shared
 * @layer ui
 *
 * Dispatches one of four branches from an explicit caller-supplied status.
 *
 * It never inspects data. `data === null` / `data.length === 0` would put a
 * generic component in charge of a distinction this domain treats as
 * load-bearing — unknown, unavailable, empty, zero and not-applicable are five
 * different things in payroll, and a component that infers between them will
 * eventually infer wrong. The caller owns the mapping.
 */

import type { ReactNode } from "react";

type AsyncRegionState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "empty" }
  | { readonly status: "ready" };

type AsyncRegionProps = {
  readonly state: AsyncRegionState;
  readonly loading: ReactNode;
  readonly empty: ReactNode;
  readonly error: (message: string) => ReactNode;
  readonly children: ReactNode;
};

function AsyncRegion({
  state,
  loading,
  empty,
  error,
  children,
}: AsyncRegionProps) {
  if (state.status === "loading") {
    return <>{loading}</>;
  }
  if (state.status === "error") {
    return <>{error(state.message)}</>;
  }
  if (state.status === "empty") {
    return <>{empty}</>;
  }
  return <>{children}</>;
}

export { AsyncRegion, type AsyncRegionProps, type AsyncRegionState };
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
npx vitest run --project web tests/web/async-region.test.tsx
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
npm exec -- ultracite fix
git add src/components/payroll/async-region.tsx tests/web/async-region.test.tsx
git commit -m "feat(web): add AsyncRegion with explicit caller-owned status"
```

---

## Task 12: `DataTableCard` and `StatGrid`

Both are layout only. `StatGrid` takes **children, never data** — a data-taking version would freeze the current dashboard visual language into a shared component before slices C–H redesign it, and the abstraction would become the thing the redesign has to fight.

**Files:**
- Create: `src/components/payroll/data-table-card.tsx`
- Create: `src/components/payroll/stat-grid.tsx`

**Interfaces:**
- Produces: `DataTableCard({ children }: { children: ReactNode })`, `StatGrid({ children }: { children: ReactNode })`

- [ ] **Step 1: Implement `DataTableCard`**

Create `src/components/payroll/data-table-card.tsx`, replacing the `<Card className="overflow-hidden py-0"><CardContent className="p-0">` incantation:

```tsx
/**
 * @feature shared
 * @layer ui
 *
 * A table that fills its card edge to edge.
 */

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

function DataTableCard({ children }: { readonly children: ReactNode }) {
  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

export { DataTableCard };
```

- [ ] **Step 2: Implement `StatGrid`**

Create `src/components/payroll/stat-grid.tsx`:

```tsx
/**
 * @feature shared
 * @layer ui
 *
 * The KPI row's grid. Layout only — it takes children, never stats.
 *
 * A `<StatGrid stats={…} formatters={…} />` would bake today's card language
 * into a shared component before slices C–H redesign it. All payroll semantics
 * and every card-level visual decision stay with the caller.
 */

import type { ReactNode } from "react";

function StatGrid({ children }: { readonly children: ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
  );
}

export { StatGrid };
```

Note: the dashboard's KPI row is `lg:grid-cols-4`, companies/employees/control are `xl:grid-cols-3`. Do **not** add a `columns` prop to reconcile them — that is a variant, and variants are how drift returns. Leave the dashboard's four-up row on its own grid until slice C decides the canonical rhythm.

- [ ] **Step 3: Typecheck and palette guard**

```bash
npm run typecheck && npx vitest run --project domain tests/domain/web-palette-leak.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npm exec -- ultracite fix
git add src/components/payroll/data-table-card.tsx src/components/payroll/stat-grid.tsx
git commit -m "feat(web): add DataTableCard and layout-only StatGrid"
```

---

## Task 13: Delete `PageTitle`, add the route invariant

`page-title.tsx` is deleted, not deprecated. Two valid mechanisms is how drift starts.

**Files:**
- Delete: `src/web/shell/page-title.tsx`
- Modify: all files importing `PageTitle`
- Test: `tests/web/shell-routes.test.tsx`

**Interfaces:**
- Consumes: `PageHeader` (Task 4), `APP_SHELL_ROUTE_PATHS` (`src/web/shell/app-nav.ts`)

- [ ] **Step 1: Find every `PageTitle` call site**

```bash
grep -rn "PageTitle" src/web
```

- [ ] **Step 2: Swap each one**

For each, replace the import with `import { PageHeader } from "@/components/payroll/page-header";` and rename the element `<PageTitle …/>` → `<PageHeader …/>`. Props `title`, `description`, `actions` carry over unchanged. Drop any `className` prop — it is not in the closed API; if a call site needs it, that is a finding for the checkpoint (Task 16), not a reason to widen the API.

- [ ] **Step 3: Delete the file**

```bash
git rm src/web/shell/page-title.tsx
```

- [ ] **Step 4: Write the invariant test**

Create `tests/web/shell-routes.test.tsx`:

```tsx
/**
 * @feature shell
 * @layer test
 *
 * Structural invariant, in the spirit of `assertNavMatchesRoutes()` in
 * app-nav.ts: a shell destination without exactly one PageHeader has an
 * unreadable or missing heading.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_SHELL_ROUTE_PATHS } from "@/web/shell/app-nav";

const PAGE_FOR_PATH: Record<string, string> = {
  "/": "src/web/dashboard/dashboard-page.tsx",
  "/pay-runs": "src/web/payrun/pay-run-list.tsx",
  "/employees": "src/web/employees/employees-page.tsx",
  "/reports": "src/web/reports/reports-page.tsx",
  "/control": "src/web/control/control-page.tsx",
  "/companies": "src/web/companies/companies-page.tsx",
  "/admin": "src/web/admin/admin-page.tsx",
};

describe("shell route headings", () => {
  it("maps every shell route to a page file", () => {
    for (const path of APP_SHELL_ROUTE_PATHS) {
      expect(PAGE_FOR_PATH[path], `no page mapped for ${path}`).toBeTruthy();
    }
  });

  it("renders exactly one PageHeader per shell destination", () => {
    for (const path of APP_SHELL_ROUTE_PATHS) {
      const file = PAGE_FOR_PATH[path] as string;
      const source = readFileSync(resolve(file), "utf8");
      const count = source.match(/<PageHeader\b/g)?.length ?? 0;
      expect(count, `${file} has ${String(count)} PageHeader`).toBe(1);
    }
  });

  it("has no surviving PageTitle references", () => {
    for (const file of Object.values(PAGE_FOR_PATH)) {
      expect(readFileSync(resolve(file), "utf8")).not.toContain("PageTitle");
    }
  });
});
```

- [ ] **Step 5: Run it**

```bash
npx vitest run --project web tests/web/shell-routes.test.tsx
```

Expected: 3 passed. If a page has 0, it was missed in Step 2.

- [ ] **Step 6: Full check and commit**

```bash
npm run typecheck && npm exec -- ultracite check
npm exec -- ultracite fix
git add -A
git commit -m "refactor(shell): delete PageTitle; enforce one PageHeader per route"
```

---

## Task 14: Representative adoption — `companies`

The gold path adopts the kit first. If `PageHeader` or `AsyncRegion` has a poor API, discovering it here costs one revert; discovering it after 22 files costs the slice.

**Files:**
- Modify: `src/web/companies/companies-page.tsx`

**Interfaces:**
- Consumes: `AsyncRegion`, `AsyncRegionState`, `PageError`, `DataTableCard`, `StatGrid`, `PageHeader`

- [ ] **Step 1: Derive the status explicitly**

In `CompaniesPage`, after the existing `companies` / `error` state, add — note the status is derived from **collection length and load state only**, never from a figure:

```tsx
  const regionState: AsyncRegionState = (() => {
    if (error !== null) {
      return { status: "error", message: error };
    }
    if (companies === null) {
      return { status: "loading" };
    }
    if (companies.length === 0) {
      return { status: "empty" };
    }
    return { status: "ready" };
  })();
```

- [ ] **Step 2: Replace the three-branch table block**

Replace the `companies === null ? … : companies.length === 0 && error === null ? … : …` expression (`companies-page.tsx:212-236`) with:

```tsx
      <AsyncRegion
        empty={
          <div className="flex justify-center py-6">
            <EmptyState01
              description="Payroll companies"
              emptyDetail="Seed db/seed/companies.json or add the first company here."
              emptyTitle="No companies yet"
              icon={
                <Building2Icon className="mx-auto size-12 text-muted-foreground" />
              }
              title="0"
            />
          </div>
        }
        error={(message) => <PageError message={message} />}
        loading={<Skeleton className="h-96 w-full rounded-xl" />}
        state={regionState}
      >
        <DataTableCard>
          <CompanyDatatable
            data={companies ?? []}
            onEdit={openEdit}
            title="Company directory"
          />
        </DataTableCard>
      </AsyncRegion>
```

- [ ] **Step 3: Replace the inline error paragraph and the stat grid**

Delete the `{error === null ? null : <p className="text-destructive text-sm" role="alert">{error}</p>}` block (`:189-193`) — the error now surfaces through `AsyncRegion`. Wrap the stat cards in `<StatGrid>` in place of the hand-written `div.grid`.

- [ ] **Step 4: Verify**

```bash
npm run typecheck && npx vitest run --project web && npx vitest run --project domain tests/domain/web-palette-leak.test.ts
```

Expected: all pass, including `shell-routes.test.tsx`.

- [ ] **Step 5: Browser check**

```bash
npm run dev
```

In the Browser pane: load `/companies`. Confirm the heading sits on the band and is legible; confirm loading, empty and error branches (force an error by stopping the API). Screenshot each. Compare against a pre-change screenshot — the only intended visual change is the header band's height now fitting its content.

- [ ] **Step 6: Commit**

```bash
npm exec -- ultracite fix
git add src/web/companies/companies-page.tsx
git commit -m "refactor(companies): adopt page kit"
```

---

## Task 15: Architecture validation checkpoint

**Not ceremony — an explicit go/no-go before 21 more files adopt these APIs.** This is the main reason a 38-file slice is acceptable.

**Files:** none (review only)

- [ ] **Step 1: Answer each question in writing**

1. Did `companies-page.tsx` need any prop the closed `PageHeader` API lacks? If yes — which, and is it a real need or a page working around something else?
2. Did deriving `AsyncRegionState` read naturally, or did it need awkward nesting?
3. Did any call site want to derive `status` from a money field? (It must not — that is invariant 1.)
4. Did `PageError` cover the case, or did it want form/operation semantics it should not have?
5. Did `StatGrid`'s fixed `xl:grid-cols-3` fight the page?
6. Net line change on `companies-page.tsx` — did the kit reduce it?

- [ ] **Step 2: Decide**

- **Go** — proceed to Task 16.
- **Revise** — change the API now, re-run Tasks 4/10/11/12 tests, redo Task 14. Cheap here, expensive later.
- **Stop** — the design is wrong; return to the spec.

- [ ] **Step 3: Record the outcome**

Append the answers to `docs/superpowers/specs/2026-08-10-shell-page-kit-design.md` under a new `## 9. Checkpoint record` heading, and commit.

```bash
git add docs/superpowers/specs/2026-08-10-shell-page-kit-design.md
git commit -m "docs(spec): record architecture validation checkpoint"
```

---

## Task 16: Broad adoption, one hub per commit

Mechanical. Apply the **same six steps as Task 14** to each hub below, in order, committing after each. Do not batch hubs — the commit boundary is what makes a regression bisectable.

**Hubs and their files:**

| Hub | Files |
|---|---|
| `employees` | `src/web/employees/employees-page.tsx`, `src/web/employees/employee-import-panel.tsx` |
| `admin-users` | `src/web/admin/admin-page.tsx` |
| `pay-run` (list) | `src/web/payrun/pay-run-list.tsx` |
| `dashboard` | `src/web/dashboard/dashboard-page.tsx` |
| `reports` | `src/web/reports/reports-page.tsx`, `payment-register.tsx`, `statutory-summary.tsx`, `exception-report.tsx`, `annual-remuneration-summary.tsx` |
| `control` | `src/web/control/control-page.tsx`, `src/web/control/run-control-card.tsx` |
| `pay-run` (workspace) | `src/web/payrun/workspace.tsx`, `panels/artifacts-panel.tsx`, `panels/findings-panel.tsx`, `panels/payments-panel.tsx`, `panels/release-panel.tsx`, `panels/closure-seal-panel.tsx`, `panels/totals-strip.tsx`, `drawers/batch-drawer.tsx`, `drawers/derivation-drawer.tsx`, `dialogs/gate-check-dialog.tsx`, `dialogs/closure-checklist-dialog.tsx`, `employee/employee-diff.tsx` |

**Excluded, deliberately:** `src/web/payrun/payslip-document/**` (print document, light-only `--doc-*` tokens — `PageHeader` and `AsyncRegion` have no meaning there) and `src/marketing/**` (separate Vite entry and CSS).

For each hub:

- [ ] **Step 1: Derive `AsyncRegionState` explicitly per region** — from load state and collection length only, never from a money field.
- [ ] **Step 2: Replace three-branch blocks with `AsyncRegion`.**
- [ ] **Step 3: Replace only the rows classified `page/region load`** in `docs/superpowers/plans/2026-08-10-error-classification.md` with `PageError`. Leave form-validation and single-operation errors alone.
- [ ] **Step 4: Wrap datatables in `DataTableCard`; wrap KPI rows in `StatGrid`** where the existing grid is already `sm:grid-cols-2 xl:grid-cols-3`. Where it is not (the dashboard's `lg:grid-cols-4`), leave it — do not add a variant.
- [ ] **Step 5: Adopt `useAsyncLoad`** where the file hand-rolls `let cancelled = false`. Its signature is `useAsyncLoad<T>(load, fallbackMessage)` returning `{ data, loading, error, reload, reset }`; it does **not** self-trigger, so call `reload()` in an effect. Do not modify the hook — if it proves inadequate, record it as a finding and leave the hand-rolled loader in place.
- [ ] **Step 6: Verify and commit.**

```bash
npm run typecheck && npx vitest run --project web --project domain && npm exec -- ultracite check
npm exec -- ultracite fix
git add src/web/<hub>
git commit -m "refactor(<hub>): adopt page kit"
```

Then load each hub's route in the Browser pane and screenshot it before moving to the next hub.

- [ ] **Final step: Full suite**

```bash
npm run typecheck && npm test && npm exec -- ultracite check && npm run knip
```

Expected: all pass, including `tests/golden/july-2026-afenda.test.ts`. The golden master is checked because green is this repo's definition of "did not break payroll" — it should be unaffected, since no domain code changed. If it fails, something in this plan reached below L5 and must be reverted.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| §2 header contract, portal, lifecycle safety | 3, 4 |
| §2 closed `PageHeader` API | 4, 13 (step 2 note) |
| §2 enforcement: delete `PageTitle`, route test | 13 |
| §3 shell table (9 files) | 5, 6, 7, 8, 9 |
| §3 lib (`format-month`, `user-identity`) | 1, 2 |
| §3.1 `PageError` + classification | 10 |
| §3.2 `AsyncRegion` explicit status | 11 |
| §3.3 `StatGrid` layout-only | 12 |
| §3.4 breadcrumb data-free | 9 |
| §4 invariant 1 as a test | 11 |
| §4 invariants 2–5 | Global Constraints |
| §6 Gate 0 hard stop | 0 |
| §6 rollout steps 3–4 | 14, 15 |
| §6 broad adoption, commit per hub | 16 |
| §6 per-hub verification | 14 step 4–5, 16 step 6 |
| §6 file headers | Global Constraints; every created file carries one |
| Mobile sheet accessibility | 8 step 4 |
| Test-infrastructure gap | 1 step 1 |

**Placeholder scan:** no TBD/TODO; every code step carries real code; no "similar to Task N" for code (Task 16 repeats the six steps explicitly and lists every file by path).

**Type consistency:** `formatReportingMonth(value, style)` — Tasks 1, 7. `initialsOf` / `firstNameOf` — Tasks 2, 8. `useShellHeaderSlot(): HTMLElement | null` — Tasks 3, 4. `AsyncRegionState.message: string` — Tasks 10, 11, 14, 16, matching `useAsyncLoad`'s `error: string | null` and avoiding the `formatApiError`-on-a-string trap. `PageError({ message })` — consistent throughout.

**Known gap, deliberately left:** Task 16's per-hub work is specified as a procedure over an exact file list rather than 22 individually written task blocks. Each file's exact replacement differs only in which studio block sits inside `AsyncRegion`, and the six steps plus the Task 14 worked example carry the full pattern. If a hub's implementer finds a case the procedure does not cover, that is a checkpoint finding, not an improvisation licence.
