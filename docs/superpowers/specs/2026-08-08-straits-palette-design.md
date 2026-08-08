# Straits palette — app theme + document styling

Date: 2026-08-08. Status: approved in conversation (scope "everywhere", dark variants derived, hand-written tokens).

> **Amendment (same day):** scope narrowed on request — the app UI reverted to
> the stock shadcn theme; only **documents** follow the Straits palette. What
> remains implemented: the `--doc-*` tokens in `globals.css` (light-only) and
> the payslip `print.css` styling. The screen retheme, dark derivation, status
> glyph badges and `src/lib/palette.ts` were rolled back. The sections below
> describe the original full-scope design and are kept for reference.
>
> **The living contract is now `docs/palette/README.md` (colour) and
> `docs/palette/printing.md` (documents and print).** This file is history.

## Goal

Adopt the Straits ERP document palette (`docs/palette/straits-document-palette.json`) as the single visual system for:

1. the on-screen app (shadcn/Tailwind v4 theme variables), light **and** a derived dark mode;
2. printed documents (payslip today; statements/EA forms later), light-only per the palette's rule;
3. status presentation — every status mark carries a glyph, colours come from the palette tones.

## Non-negotiable palette rules enforced

- Deductions and negative figures use neutral ink, never red. `unfavorable` red is reserved for a stated business judgement.
- Colour is never the only encoding: status badges always render their glyph (◦ → ◔ ◐ ✓ ✕ ⊘).
- Grand totals get rules + bold, not a fill. Net pay on the payslip is neutral ink with the grand-total treatment (was green).
- Nil amounts render as an em dash in secondary ink, not 0.00.

## Design

### Token layer — `src/app/globals.css`

- `:root` (light): background white, card cool-porcelain `#fbfcfd`, foreground ink `#26333d`, primary executive-navy `#14324a`, ring/accent governance-teal, destructive clay `#a34141`, borders hairline `#d7dee5`, muted/secondary from the screen-reference tints, chart-1..5 = the five verified categorical series.
- `.dark` (the "extension"): same hue family on deep navy-charcoal surfaces (`#10181f`/`#16212b`), porcelain foreground, teal/clay lightened for ≥4.5:1 contrast. Documents never use these.
- Status tones as variables with light+dark values: `--status-{ok,info,warn,bad,neutral}-{ink,fill}`, registered in `@theme inline` so `text-status-ok`, `bg-status-warn-fill`, etc. work as utilities. One class works in both themes.
- `--doc-*` namespace (light-only, print values): ink, secondary, heading, disabled, rule hairline/standard/emphasis/total, fill header/zebra/subtotal. Consumed only by document CSS.

### TS module — `src/lib/palette.ts`

- `STATUS_SPEC`: palette status → { glyph, tone, strike? }.
- `RUN_STATUS_PALETTE`: app run statuses → palette statuses (DRAFT→draft, REVIEWED→pending, APPROVED→approved, CLOSED→posted).
- `statusToneClasses(tone)`: Tailwind classes per tone.
- `CHART_SERIES`: hex + dash pattern pairs for future charts.

### Components

- `status-badges.tsx`: rebuilt on `STATUS_SPEC` — glyph + tone classes replace raw Tailwind greens/blues/ambers. `ActiveBadge` → approved/cancelled tones; INACTIVE gets ⊘ + line-through.
- Sweep of raw `green-*/red-*/amber-*/yellow-*/blue-*` utilities across `src/` → semantic `status-*` utilities. BLOCK check items use `text-status-bad` (a blocking finding *is* a stated judgement); cautionary banners use warn tone; delete buttons use `text-destructive`.

### Payslip — `print.css`

- All colours moved to `--doc-*` tokens: `#111` rules → total navy, `#ccc/#ddd` → standard/hairline, footer/muted → secondary ink.
- Table headers filled `--doc-fill-header` (`#d1dae1`, print-darkened).
- Net pay: neutral ink, bold, 1pt rule above + 3pt double rule below. No fill, no green.
- Watermark: disabled-ink gray at low opacity (was red).

## Verification

Dev server: app shell, dashboard, pay-run grid and payslip preview checked in light and dark; print emulation for the payslip. Screenshots shared.
