# Pay-run grid — the visual pattern

How the palette is applied to the wide, dense working surface of
`/payruns/[id]`. The behavioural contract for that screen is frozen in
[the pay-run workspace spec](../superpowers/specs/2026-08-08-payrun-workspace-design.md)
— this file governs only how it *looks*, and does not override §2 of that spec.

The pattern is a hybrid. AutoCount HRMS's payroll-process screen solves the
wide-grid wayfinding problem well, and several of its moves are worth taking
outright. Others conflict with rules this project will not bend. Both are
recorded below, with the reasoning, so the divergence is a decision rather than
an accident.

---

## What we take from AutoCount

**1. Colour-coded column groups.** A payroll grid is thirty columns wide and the
operator scrolls horizontally all day. Tinting the `EARNING` / `DEDUCTION` /
`COMPANY` / `PAYMENT SUMMARY` bands gives you a peripheral sense of where you are
without reading a single header. This is the single best idea on that screen.

**2. A statutory-totals strip above the grid.** Employees · Net Pay · EPF ·
SOCSO · EIS · PCB · HRDF, always visible. These are the numbers an operator
sanity-checks constantly and the ones they will key into the statutory portals.
Making them ambient rather than a report is correct.

**3. Per-line statutory treatment captions.** Their OT rows carry a small tag —
"SOCSO & EIS | Tax" — declaring which schemes that line feeds. This is a
genuinely good instinct and it maps exactly onto data we already hold:
`epfWages` / `socsoWages` / `eisWages` per item in
[`db/seed/pay-item-matrix.json`](../../db/seed/pay-item-matrix.json). We render
the same tag, and we render EPF too, which theirs omits.

**4. Editing in the row's own context, not a modal.** Their expanded panel keeps
the employee's other figures on screen while you type. Same principle applies to
our sheet.

**5. A dark navy application shell.** Their sidebar is navy; so is ours. Navy is
authority and structure, and it keeps brand identity out of the transactional
content area entirely.

---

## What we change, and why

**Deduction amber must not leak into the amounts.** Their `DEDUCTION` band is
amber and that is fine *as a section identity*. It stops being fine the moment
the figures inside inherit it, because [rule 4](./README.md#doctrine) says a
deduction is arithmetic, not a warning. EPF, SOCSO, EIS and PCB are the most
normal numbers on a Malaysian payslip.

The resolution is a **new token family, `section_tints`, that is explicitly
categorical and has no valence** — parallel to `chart.series`, not to `status`.
Tint the group header and the panel chrome; the amounts inside stay
`amounts.neutral` `#26333d`.

**Payment summary is not green.** Theirs is. Net pay is a conclusion, not a
success state ([rule 6](./README.md#doctrine)), and if green means "good" in the
summary band then a low net reads as a failure. The summary group takes the navy
family — the same colour that rules a grand total.

**Employer cost is teal, not violet.** Violet is already spoken for: the
workspace spec assigns it to the `OFFCYCLE` run-type badge. Two meanings for one
hue in the same screen is how a colour system dies. Employer contributions take
the teal family.

**Colour is not the group encoding.** Four fills that read as four bands on a
monitor collapse to four near-identical grays on paper — verified: all four print
tints land between 1.35 and 1.40 contrast against white. So every group band
carries a **text label and a vertical rule** at its boundary. Removing the fills
entirely must leave the grid readable.

**Icons in the totals strip are monochrome.** Theirs are multi-coloured, which
implies a valence the tiles do not have — a mint umbrella for EIS and a red
percent for PCB say something about EIS and PCB that isn't true. One ink,
`--doc-ink-secondary` weight, for all seven.

**Every figure drills.** Their captions hint at provenance; this project's whole
premise is that the hint is not enough. Any amount in the grid opens the
derivation trace down to the statutory table row, its issuing document, URL and
SHA-256. That is the feature, not the chrome.

---

## Section tint tokens

Added to `straits-document-palette.json` as `section_tints`. Verified AA on both
screen and print fills.

| Group | Screen fill | Print fill | Header ink | Ink on print fill | Mono gray |
|---|---|---|---|---|---|
| Earning | `#eaf1f7` | `#d3dfe9` | `#114a65` | 7.07:1 | `#dddddd` |
| Deduction | `#f7e7c6` | `#f0dcb0` | `#7c4e01` | 5.28:1 | `#dedede` |
| Employer | `#e4efee` | `#cfe0de` | `#1f5a58` | 5.77:1 | `#dcdcdc` |
| Summary | `#e6ebf0` | `#d3dbe3` | `#14324a` | 9.47:1 | `#dadada` |

Body ink `#26333d` clears 9.2:1 on all four print fills, so an amount may sit
directly on a tinted band when a whole column group is filled.

Exposed as `--section-{earning,deduction,employer,summary}-{fill,ink}` in the
screen theme and `--doc-section-*-{fill,ink}` in document CSS, following the
two-consumer split in the [palette README](./README.md#the-three-layers).

Rules:

- Tints apply to **group headers, panel headers and panel backgrounds**. Never to
  a value cell as a way of marking it, and never to a row.
- Row-level meaning stays with the existing systems: `status-*` tones for state,
  the amber changed-since-reviewed marker, the finding severity badge, the lock.
- Four groups is the ceiling. A fifth band means the grid is doing too much and
  wants a column preset instead.

---

## Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Month End · Aug 2026        [Back]  [Save & Recalculate]  [Commit]  │  header + identity
│  DRAFT · rev a91f… · 45 employees                                    │
├──────────────────────────────────────────────────────────────────────┤
│  Inputs › PCB › Scan › Review › Approval › Payment › Distribute › …  │  stepper (the lens)
├──────────────────────────────────────────────────────────────────────┤
│  Employees  Net Pay   EPF    SOCSO   EIS    PCB    HRDF              │  totals strip
│     45     143,133   35,628  4,106   538    3,003  1,501             │
├───────────────┬──────────────┬───────────────┬──────────┬────────────┤
│  Employee     │   EARNING    │   DEDUCTION   │ EMPLOYER │  SUMMARY   │  group bands
│  (sticky)     │  blue tint   │  amber tint   │ teal     │  navy      │
└───────────────┴──────────────┴───────────────┴──────────┴────────────┘
```

**Header.** Run identity, type badge, `calcRevision`, and the reviewed/approved
revisions it is bound to. Consequential actions live top-right; `Commit` passes
through the AuthorizationDialog, never fires directly.

**Totals strip.** Seven tiles, monochrome icons, tabular figures, each one a
filter — clicking EPF filters the grid to lines contributing to it. A total that
cannot be clicked through to its constituents is a dead end, and the spec's rail
rule ("anything shown has a route to the row that resolves it") applies here too.

**Sticky identity.** `Employee · status/finding marker · Net Pay` pinned left in
every column preset, per §2.2 of the workspace spec. The group bands scroll; the
identity does not.

**Grouping rows.** Department group headers with counts (`ACC (1)`) as in
AutoCount, collapsed by default above ~40 employees.

---

## The employee panel

AutoCount expands the row in place into three panels — EARNING, DEDUCTION,
COMPANY. The three-panel composition is right. The expand-in-place mechanism is
not, for us: the frozen interaction grammar is *"the sheet handles the
employee"*, and a row that grows to 400px destroys the grid's scan position and
has nowhere to put the Calculation, PCB, Payslip and Payment tabs.

So: **their panel composition, inside our sheet.** The Inputs tab of the
slide-over renders three tinted panels — Earning, Deduction, Employer cost —
each with inline `MoneyInput` fields and `+ Item` affordances, with the statutory
treatment tag on every line:

```
Overtime                                    0.00
  1.5× hourly rate    EPF · SOCSO · EIS · PCB
  Rest day            EPF · SOCSO · EIS · PCB
```

The tag is derived from the pay-item matrix flags, not typed by hand. It is the
cheapest possible answer to "why did this line change my EPF", and it sits one
click above the full trace.

The Employer panel is the screen form of the payslip's **EMPLOYER PAYS FOR YOU**
box (workspace spec §5.1). Same figures, same grouping, same tint family in both
places — an operator who learns the screen can read the payslip.

---

## Print

The grid itself is not a printed artefact; the register, the exception report
and the payslip are. Where a printed report reproduces these groups, it uses the
`print` fills above and must satisfy the [printing checklist](./printing.md) —
in particular the group label and boundary rule survive when the fills flatten to
gray.
