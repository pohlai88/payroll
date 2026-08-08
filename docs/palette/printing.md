# Printing and document output

Payslips, EA forms, statements, remittance advice, invoices and POs. Everything
here is downstream of `straits-document-palette.json`; the doctrine and the app
theme live in [README.md](./README.md).

These documents are legal artefacts. An employee keeps a payslip for years; LHDN
receives an EA form. They are frequently printed, frequently printed in
**monochrome**, and frequently read on paper by someone who cannot ask a follow-up
question. That constrains almost every rule below.

---

## The four constraints

1. **Documents are light-only.** They are printed on white or read as white
   pages. There is no dark payslip.
2. **They may be printed mono.** Every colour that can reach paper has a
   grayscale equivalent in the JSON (`gray`) chosen to preserve its *relative
   weight*, not its hue. Colour must therefore never be the sole carrier of
   meaning — status marks carry a glyph, chart series carry a dash or pattern.
3. **Screen tints disappear on paper.** `fills` in the JSON are darkened for a
   600dpi laser. `screen_reference` holds the lighter on-screen equivalents of the
   same tints. Never use `screen_reference` values in document CSS, and never use
   `fills` values in the app chrome.
4. **A deduction is arithmetic, not a warning.** EPF, SOCSO, EIS and PCB lines
   render in neutral ink. Red on a payslip means something is *wrong*, and
   nothing about a statutory deduction is wrong.

---

## Document tokens

Document CSS consumes only the `--doc-*` namespace. These are print values, taken
from `ink`, `rules_and_borders` and `fills`.

| Token | Hex | Gray | Use |
|---|---|---|---|
| `--doc-ink` | `#26333d` | `#313131` | body text, all amounts |
| `--doc-ink-secondary` | `#66737e` | `#717171` | footers, captions, nil dashes |
| `--doc-ink-heading` | `#14324a` | `#303030` | headings, document title |
| `--doc-ink-brand` | `#2e7d7a` | `#717171` | issuer mark only |
| `--doc-ink-disabled` | `#8b959e` | `#949494` | watermarks, voided text |
| `--doc-rule-hairline` | `#d7dee5` | `#dddddd` | row separators |
| `--doc-rule-standard` | `#c3ccd5` | `#cbcbcb` | table borders |
| `--doc-rule-emphasis` | `#b8c1ca` | `#c0c0c0` | section boundaries |
| `--doc-rule-total` | `#14324a` | `#303030` | total rules |
| `--doc-fill-header` | `#d1dae1` | `#d9d9d9` | table header row |
| `--doc-fill-zebra` | `#eff2f6` | `#f2f2f2` | alternating rows |
| `--doc-fill-subtotal` | `#e0e6eb` | `#e5e5e5` | subtotal row |

`--doc-*` is **not** redefined under `.dark`. If a document ever renders dark, a
token was defined in the wrong place.

Reports that reproduce the pay-run grid's column groups additionally use
`--doc-section-{earning,deduction,employer,summary}-{fill,ink}` from the JSON's
`section_tints.print` values. These four flatten to near-identical grays
(`#dcdcdc`–`#dedede`) in mono, which is deliberate: the group **label and
boundary rule** carry the encoding, and the fill is only an aid on colour output.
Amounts inside a tinted band still render `amounts.neutral`.

---

## Table and total treatment

- **Header row** — `--doc-fill-header`, bold, `--doc-ink-heading`.
- **Body rows** — `--doc-ink` on white, `--doc-rule-hairline` separators. Zebra
  striping with `--doc-fill-zebra` only on tables longer than roughly fifteen
  rows; below that it is noise.
- **Subtotal row** — `--doc-fill-subtotal`, medium weight.
- **Grand total (net pay)** — **no fill**. A 1pt `--doc-rule-total` rule above, a
  3pt double rule below, bold, neutral `--doc-ink`. Not green. Net pay is a
  conclusion, not a success state.
- **Nil amounts** — em dash `—` in `--doc-ink-secondary`, never `0.00`.
- **Watermarks** (DRAFT, VOID, SPECIMEN) — `--doc-ink-disabled` at low opacity.
  Never red.

Amount columns are right-aligned and tabular (`data-money`). Column width must
not shift between a run and its reprint.

---

## Callouts and status on documents

Callouts use the `callouts` block — each is a fill, an ink and a rule, so the
shape survives when the fill drops out in mono:

| Kind | Fill | Ink | Rule |
|---|---|---|---|
| info | `#d2e4ee` | `#114a65` | `#a1c7db` |
| success | `#d8e5db` | `#27603e` | `#a8d4b6` |
| warning | `#f2e0b9` | `#7c4e01` | `#e7c38a` |
| danger | `#f2dcdd` | `#8b3334` | `#f2b6b2` |

Status marks always render `glyph + label`, never a bare coloured dot. The glyph
set is in the JSON's `status` block and is reproduced in the palette README. A
cancelled document additionally gets `line-through`.

---

## Charts in documents

Five categorical series, `chart.series`, verified to a minimum ΔE of 0.109 under
normal vision and 0.094 under deuteranopia. Beyond five, aggregate the tail into
*Other* — do not extend the ramp. Each series must additionally carry a dash
pattern or fill pattern so it survives mono. `chart.grid` `#e8ecf0` and
`chart.axis` `#66737e` for furniture.

`chart.positive` / `chart.negative` are for charts that are *explicitly* about
valence. A cost breakdown is not one of those.

---

## Print stylesheet requirements

Any print stylesheet must do all of the following.

**Force light.** A user can print while the app is in dark mode. Redefine the
semantic tokens under `@media print` for both `:root` and `.dark`, set
`color-scheme: light`, and force `html, body { background: #fff; color: #26333d }`.
A dark payslip reaching a printer is a defect, not a preference.

**Preserve fills.** Browsers drop background fills by default, which erases the
header and subtotal rows:

```css
body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
```

**Control breaks.**

```css
table, figure, [data-print-keep], [data-evidence-block] { break-inside: avoid; }
h1, h2, h3, h4, [data-group-header]                    { break-after: avoid;  }
tr                                                     { break-inside: avoid; }
thead                                                  { display: table-header-group; }
tfoot                                                  { display: table-footer-group; }
```

`thead`/`tfoot` as header/footer groups is what repeats column headings on a
multi-page statement. A payslip that breaks mid-row, or an employee section split
across two sheets, is a reprint.

**Hide chrome.** Navigation, filters, buttons and toasts have no place on paper.

---

## Colour separation for press

The JSON is **sRGB**. Converting to CMYK with a naive formula shifts the teal and
the amber badly. Use the press ICC profile. For anything going to an offset
printer rather than an office laser, get a proof.

---

## Checklist before shipping a document template

- [ ] Renders identically with the app in dark mode.
- [ ] Legible printed in grayscale — check every status mark and chart series.
- [ ] Header and subtotal fills survive the print dialog.
- [ ] No deduction, contra entry or credit note is red.
- [ ] Grand total is ruled and bold, not filled.
- [ ] Nil amounts are em dashes.
- [ ] Amount columns are tabular and right-aligned.
- [ ] No row, table or evidence block splits across a page break.
- [ ] Column headings repeat on page two.
- [ ] Bilingual (EN/MS) labels both fit their columns without wrapping mid-figure.
- [ ] No raw hex anywhere in the template — `--doc-*` only.
