# Frontend directory structure (Vite) — target for refactor

Vite multi-page truth (`vite.config.ts`):

| Entry HTML | Boot | Role |
|------------|------|------|
| `index.html` | `src/web/main.tsx` → `app.tsx` | Product SPA |
| `landing.html` | `src/marketing/main.tsx` | Marketing only |

Alias: `@` → `src/`. No Next `app/` tree. Styles: SPA → `src/web/shadcn.css`; marketing keeps its own CSS entry — no cross-import.

## Target tree (refactor to this)

```
src/
  web/                              # product SPA only
    main.tsx
    app.tsx                         # session gate + Wouter Switch/Route
    styles.css                      # stock shadcn theme (SPA)
    vite-env.d.ts
    api/                            # types.ts → client.ts → payroll-api.ts
      types.ts
      client.ts
      payroll-api.ts
      format-error.ts
    auth/                           # Neon Auth browser client helpers
    context/                        # auth-context, scope-context
    shell/                          # layout, nav, top-bar, breadcrumbs, palette
      app-nav.ts                    # APP_SHELL_ROUTE_PATHS + APP_NAV_ITEMS
      layout.tsx
      …
    admin/
    companies/
    control/
    dashboard/
    employees/                      # include import panels here (not web root)
    payrun/
      payslip-document/             # document subtree OK
      *-page.tsx | workspace.tsx | panels…
    reports/
  marketing/                        # landing.html surface — isolated
    main.tsx
    landing.tsx
    sections/
  components/
    ui/                             # shadcn base-nova primitives (/rui installs land here)
    payroll/                        # domain widgets (money, status, hash) — no studio I/O
    shadcn-studio/                  # /cui /iui block installs only
      blocks/
      …
  hooks/                            # use-async-load, pagination, dark-mode
  lib/                              # utils (cn), shared non-UI helpers
```

## Placement rules

| Artifact | Put it here | Not here |
|----------|-------------|----------|
| Shell destination page | `src/web/<feature>/*-page.tsx` | `src/components/**`, marketing |
| Feature-only widget | `src/web/<feature>/` | `src/web/` root |
| Reusable payroll atom | `src/components/payroll/` | Inside a page file if reused ≥2 features |
| shadcn primitive | `src/components/ui/` | Hand-rolled duplicate |
| Studio block | `src/components/shadcn-studio/` | With fetch/RBAC |
| HTTP | `api/client.ts` then `payroll-api.ts` | Ad-hoc `fetch` in pages |
| Marketing section | `src/marketing/sections/` | `src/web/` |

## Refactor debt (current → target)

| Smell | Fix | Status |
|-------|-----|--------|
| Loose files under `src/web/*.tsx` (e.g. import panel) | Move into owning feature folder | Done — `employees/employee-import-panel.tsx` |
| Giant flat `payrun/` | Keep workspace entry; group panels/drawers; keep `payslip-document/` | Done — `panels/`, `drawers/`, `dialogs/`, `employee/` |
| Studio leftovers with Next `app/…` paths | Delete or re-home under `shadcn-studio` + compose from `*-page.tsx` | Done — removed unused `blocks/pages/*` demos |
| Domain logic in `shadcn-studio/` | Extract to `web/<feature>` or `components/payroll` | OK — studio uses DTO prop types only; I/O stays in pages |
| Shared styles leaking marketing ↔ SPA | Keep dual entries; no shared `shadcn.css` import | OK — marketing uses own `shadcn.css` |

### Payrun layout (after refactor)

```
src/web/payrun/
  workspace.tsx              # orchestrator + Route target
  pay-run-list.tsx
  payslip-page.tsx
  payslip-document/          # print document subtree
  panels/                    # artifacts, findings, payments, release, header, …
  drawers/                   # batch, derivation, employee slide-over
  dialogs/                   # gate check, closure checklist
  employee/                  # grid, diff, payslip preview
```

## Do / don't when moving files

- Update Wouter imports in `app.tsx` and shell only as needed.
- Prefer path moves + import fix; no behavior change in a structure-only PR.
- After move, UI changes still go through `/rui` `/cui` `/iui` ([ui-studio.md](ui-studio.md)).
