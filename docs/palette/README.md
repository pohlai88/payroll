# Straits palette — the colour contract

`straits-document-palette.json` in this directory is the **only** source of colour
truth in this repository. This file explains how those values are meant to be
consumed; [printing.md](./printing.md) covers the document and print side, and
[workspace-grid.md](./workspace-grid.md) applies the system to the pay-run grid.

Status: the JSON and these documents are current. The consuming code is not — the
SPA shell is Phase 4 and the bilingual payslip is Phase 8 (see the phase table in
the root [README](../../README.md)). Treat this as the contract those phases must
satisfy, not a description of code that already exists.

---

## Doctrine

1. **Reference colours define identity. Semantic tokens define behaviour.
   Components consume semantic tokens only.**
2. No component may write a raw hex, and no component may write a raw Tailwind
   palette utility (`text-green-600`, `bg-red-50`, `border-amber-200`). Those
   bypass the system and cannot be re-themed or print-corrected.
3. **Colour is never the only encoding.** Every status carries a glyph; every
   chart series carries a dash or fill pattern. This is what survives mono
   printing and red/green colour deficiency.
4. **A negative figure is not bad news.** Deductions, contra entries and credit
   notes take neutral ink. Red (`amounts.unfavorable`) is reserved for a *stated
   business judgement* — a blocking finding, a rejected run — never for
   arithmetic that happens to subtract.
5. **Nil is an em dash**, in secondary ink, not `0.00` in body ink.
6. **Grand totals get rules and weight, not a fill.** A filled grand total reads
   as a highlight; a ruled one reads as a conclusion.
7. **Chart colours, section tints and status colours are three separate
   systems.** `chart.series` and `section_tints` have no valence. Do not infer
   "teal = good" because a series is teal, or "amber = warning" because the
   deduction column group is amber.
8. **Dark mode remaps semantic tokens. It never changes the reference palette,
   and it never reaches documents.**

---

## The three layers

```
straits-document-palette.json          ← reference: identity, immutable
        │
        ├── app semantic tokens        ← :root / .dark in globals.css
        │      primary, muted, ring, destructive, status-*, chart-*
        │
        └── document tokens            ← --doc-* in globals.css, light only
               doc-ink, doc-rule-*, doc-fill-*
```

The two consumers are deliberately separate. A printed EA form and an interactive
grid have different legibility constraints — the JSON's `fills` are darkened for
a 600dpi laser, and `screen_reference` holds the lighter screen equivalents of the
same tints. Forcing one set of values on both makes the screen muddy or the paper
invisible.

### Layer 1 — reference

The `brand` block:

| Role | Token | Hex |
|---|---|---|
| Authority, structure, headings, total rules | `executive_navy` | `#14324a` |
| Interaction, focus, brand ink | `governance_teal` | `#2e7d7a` |
| Information, references, registry links | `registry_blue` | `#1d5b79` |
| Readable content | `ink_charcoal` | `#26333d` |
| Elevated surface | `cool_porcelain` | `#fbfcfd` |
| Attention, validation required | `warning_amber` | `#a66a00` |
| Escalation, destructive | `destructive_clay` | `#a34141` |

Reference values must **not** be exposed as Tailwind utilities. Define them as
CSS custom properties outside `@theme`, so `bg-brand-executive-navy` cannot exist
and developers have no path to bypass the semantic layer.

### Layer 2 — app semantic tokens

Declared in `:root` and `.dark`, exported through `@theme inline` (the shadcn
Tailwind v4 convention). The intended light mapping:

| Semantic | Source | Notes |
|---|---|---|
| `background` | white | |
| `card`, `popover` | `cool_porcelain` `#fbfcfd` | |
| `foreground` | `ink.body` `#26333d` | 12.94:1 on white |
| `primary` | `executive_navy` `#14324a` | see divergence note below |
| `ring`, `accent` | `governance_teal` `#2e7d7a` | |
| `destructive` | `destructive_clay` `#a34141` | |
| `border`, `input` | `rules_and_borders.hairline` `#d7dee5` | |
| `muted`, `secondary` | `screen_reference` tints | not the print `fills` |
| `chart-1..5` | `chart.series` | verified min ΔE 0.109 normal, 0.094 deuteranopia |

**Section tints** (`section_tints` in the JSON) are a fourth, separate family:
`--section-{earning,deduction,employer,summary}-{fill,ink}`. They identify column
groups and panels in dense grids, carry no valence, and never apply to a value
cell or a row. See [workspace-grid.md](./workspace-grid.md).

Status tones are their own token family — `--status-{ok,info,warn,bad,neutral}-{ink,fill}`
— with both light and dark values, registered in `@theme inline` so
`text-status-ok` and `bg-status-warn-fill` work as utilities and one class is
correct in both themes.

Status → tone mapping comes from the JSON's `status` block. The glyph is not
decorative and is not optional:

| Status | Glyph | Tone |
|---|---|---|
| `draft` | ◦ | neutral |
| `submitted` | → | info |
| `pending`, `partial` | ◔ ◐ | warn |
| `approved`, `paid`, `posted` | ✓ | ok |
| `rejected`, `overdue` | ✕ | bad |
| `cancelled` | ⊘ | neutral + line-through |

Domain run statuses map onto these: `DRAFT`→draft, `REVIEWED`→pending,
`APPROVED`→approved, `CLOSED`→posted.

**Dark mode** is a semantic remap only: the same hue family on deep navy-charcoal
surfaces (`#10181f` background, `#16212b` card), porcelain foreground, teal and
clay lightened to hold ≥4.5:1. The `brand` reference values are unchanged, and
`--doc-*` is not redefined.

### Layer 3 — document tokens

The `--doc-*` namespace, light-only, carrying the **print** values from `ink`,
`rules_and_borders` and `fills`. Consumed exclusively by document CSS. Covered in
[printing.md](./printing.md).

---

## Component contract

Badges and alerts get the full semantic set; buttons deliberately do not.

```ts
Badge:  "default" | "secondary" | "outline" | "destructive"
      | "success" | "warning" | "info"

Alert:  "default" | "destructive" | "success" | "warning" | "info"

Button: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
```

No success/warning/info buttons. Payroll screens are dense with actions; a
per-semantic button variant turns every screen into a colour chart and destroys
the meaning of `destructive`.

---

## Money rendering

Money is integer sen everywhere (`src/domain/money.ts`). Presentation rules:

- Earnings **and** deductions render in `amounts.neutral` `#26333d`.
- Nil renders as `—` in `amounts.nil` `#66737e`.
- `favorable` `#27603e` / `unfavorable` `#8b3334` only where the sign carries a
  stated judgement, not where it is arithmetic.
- Amount cells carry `data-money`, which applies `font-variant-numeric:
  tabular-nums` and `font-feature-settings: "tnum" 1, "lnum" 1`, so columns do
  not shift horizontally when values update. Quantities, percentages and dates
  use `data-numeric`, `data-percentage`, `data-quantity`.

---

## Relation to the DLBB reference palette

A DLBB-derived palette circulates alongside this one, screened from the *Company
Mandates & Role Charters* document. It is close but **not identical**, and the two
must not be mixed within a single artefact:

| Role | Straits (this repo) | DLBB document screen |
|---|---|---|
| Navy | `#14324a` | `#123044` |
| Teal | `#2e7d7a` | `#2f7f78` |
| Blue | `#1d5b79` | `#4a7696` |
| Ink | `#26333d` | `#24323d` |
| Amber | `#a66a00` | `#9a5f00` |
| Clay | `#a34141` | `#c95e4b` |

The Straits values are the ones committed here and the ones with recorded
contrast (`ink.*.on_white`) and chart separation (min ΔE under deuteranopia)
figures. They win.

The two systems also differ on **primary**: the DLBB doctrine assigns teal to
`primary` and navy to the sidebar; this repo assigns navy to `primary` with teal
as ring/accent. Either is defensible, but the choice must be made once. If it is
ever changed, change it here first — this file, then the tokens, then the
components.

---

## Adding or changing a colour

1. Edit `straits-document-palette.json`. Include the grayscale equivalent for any
   value that can reach paper, and the contrast ratio for any ink.
2. Update this file and `printing.md`.
3. Update the token layer, then components.

Never the other way around. A hex that appears in a component before it appears
in the JSON is a bug, not a shortcut.
