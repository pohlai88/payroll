# MY-STAT-S06 — Governed Pay-Item Treatment Scope Decision

**Status:** **Implemented** (2026-08-08) — wage treatments + PCB remuneration class.  
**Amendment ref:** §7 of
[`docs/superpowers/specs/2026-08-08-statutory-authority-amendment.md`](../docs/superpowers/specs/2026-08-08-statutory-authority-amendment.md).  
**Follow-up design:**
[`docs/superpowers/specs/2026-08-08-transfer-statutory-followups-design.md`](../docs/superpowers/specs/2026-08-08-transfer-statutory-followups-design.md).

## Intent

Whether a pay item enters the EPF, SOCSO, EIS, or HRD wage base is a legal
question, not a checkbox an administrator may silently flip. Treatment becomes
effective-dated and attributable; departing from the system default requires a
reason and an approver, recorded as an audit event.

PCB is **not** a fifth boolean wage-base scheme. After S07c compute landed, PCB
uses a separate governed **`pcb_remuneration_class`**
(`NORMAL` | `ADDITIONAL` | `EXCLUDED`) for Y1/Yt split. Catalog `taxable`
remains informational for payslip/UI.

## Ratified checklist

1. **Audit depth for existing items**
   - [x] **Forward-only:** only future treatment changes are audited; current
         `pay_items` flags are the baseline at cutover with no history backfill
   - [ ] Full history — rejected for v1
2. **Who may approve a departure from default?** Logical role
   **`PAYROLL_COMPLIANCE_APPROVER`** (display: “Compliance approver”).
   Ordinary admin may create/configure items but cannot alone change statutory
   treatment. Departure requires `reason` + `approved_by`; actor ≠ approver
   (same discipline as `pay_line_overrides`).
3. **Schemes in scope for v1?** **EPF, SOCSO, EIS, HRD** — IN (boolean
   `subject`).  
   **PCB remuneration class** — IN post-S07 (separate table, not
   `treatment_scheme=PCB`). Boolean PCB wage-base / flipping `taxable` for
   compute — still OUT.
4. **Company policy vs statutory default?** Layer 3 **never** overwrites layer 1.
   Company policy may only choose among legally permitted options, still via
   audited departure with reason + approver.
5. **Findings vs hard-stop?** **Both** — blocking validation on compute/release
   for unlawful or unverified departure; findings may also surface for operators
   but cannot be the only gate.

## HRD note

HRD levy reads `hrdWagesSen` from the HRD treatment (engine `PayItemDef.hrdWages`).
Cutover defaults HRD `subject` from `epf_wages` so golden parity is unchanged;
HRD may diverge only via approved departure.

## Schema (shipped)

```text
treatment_scheme: EPF | SOCSO | EIS | HRD
treatment_source: STATUTORY_DEFAULT | APPROVED_DEPARTURE
pcb_remuneration_class: NORMAL | ADDITIONAL | EXCLUDED

pay_item_treatments — EXCLUDE no overlap per (pay_item_id, scheme)
pay_item_pcb_classes — EXCLUDE no overlap per pay_item_id
pay_items.epf_wages / socso_wages / eis_wages — deprecated mirrors (trigger-synced)
pay_line_items.pcb_class_snap — frozen at line create
```

Migrations: `0018_pay_item_treatments`, `0019_pcb_remuneration_class`.

## Explicitly OUT of scope for v1

- Full historical audit backfill of pre-cutover flag changes
- PCB as a fifth `treatment_scheme` boolean twin of `epf_wages`
- Silent mid-UI conversion of booleans without this slice’s migration
- Soft-finding-only for unlawful treatment
- Per-employment treatment overrides (catalog-level only in v1)
- CSV allowance → pay_item mapping (employee import follow-up)

## Amendment (2026-08-08)

S07c shipped offline PCB compute. The deferred “S06 PCB pay-item taxonomy”
is implemented as `pay_item_pcb_classes`, not by adding PCB to
`treatment_scheme`. Hard-coded `BONUS → Yt` remains a fallback when class is
unloaded; seeded/migrated classes are the authority.
