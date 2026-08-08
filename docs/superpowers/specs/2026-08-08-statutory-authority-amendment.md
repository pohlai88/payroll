# Statutory Authority — Amendment to the Phase 2 Persistence Design

**Date:** 2026-08-08 · **Status:** Approved · **Amends:**
[Phase 2 persistence design](2026-08-08-phase2-persistence-design.md)

The frozen sentence this amendment exists to serve:

> **Government instruments are the authority; approved rule packs are the
> executable representation; payroll runs permanently record which
> representation they used.**

Nothing already built is undone. The 529-test baseline and the July 2026
37-employee sen-level parity result stand unchanged; this adds governance around
them.

---

## 1. What was wrong

Phase 2 left `statutoryLimits` unseeded because the gazetted instruments are
PDFs that could not be machine-extracted in the development environment. As a
*developer stop* that was correct — a payroll must never carry remembered
figures. As *architecture* it was wrong, and this amendment removes it:

- **Machine-readable extraction is not, and never was, the standard of proof.**
  A reviewer reading an official PDF and recording what provision they read is
  valid evidence. `pdftotext` is a convenience, not an authority. The absence of
  a tool is not a property of Malaysian law.
- **Payroll must never depend on a government website at run time.** No
  calculation fetches, scrapes or parses a published document. The pipeline is
  one-directional and offline at the point of use:

  ```
  official instrument → controlled evidence ingestion → human verification
      → approved, effective-dated rule pack → payroll calculation
  ```

  Once approved, a rule pack works whether or not the issuing site is reachable.
  This is the operational property commercial Malaysian payroll products
  provide, and Afenda should provide it with better provenance underneath.

## 2. Three layers of authority

`statutoryLimits` as a single JSON blob is retired before it is ever populated.
Three different kinds of rule, with three different governance regimes, must not
share one object.

| Layer | Contains | Who decides | Mutable by customer |
|---|---|---|---|
| **`STATUTORY_CALCULATION`** | EPF, SOCSO, EIS, PCB/MTD, HRD levy — the contribution tables and rates | The issuing authority | Never |
| **`EMPLOYMENT_LAW`** | OT eligibility and monthly limit, working-time maxima, wage-protection thresholds, EA First Schedule ceiling | Parliament / gazetted regulations | Never |
| **`COMPANY_POLICY`** | Allowance rates, benefits, company OT policy, and *legally permitted elections* such as voluntary EPF excess | The customer | Yes, audited |

The engine consumes layers 1 and 2 as facts. Layer 3 is configuration, and it
**never overwrites layer 1** — see §6.

## 3. Rule-pack identity and lifecycle

A pack is `(jurisdiction, authority, code, version)`, effective-dated, content
hashed, and immutable once approved.

```
DRAFT → SOURCE_CAPTURED → VERIFIED → APPROVED → EFFECTIVE → SUPERSEDED
```

- **Only `APPROVED` or `EFFECTIVE` packs may be referenced by a pay run.** A run
  citing a `DRAFT` pack is rejected by the database, not by a code path someone
  might forget to call.
- **A pack that has been approved is immutable.** A statutory change creates a
  new version and supersedes the old one; it never edits a pack that has
  participated in a released payroll. Reproducing a historical run must resolve
  that run's rules, not today's.
- Names carry their era: `MY-EPF-2025-10`, `MY-SOCSO-2024-10`, `MY-EIS-2024-10`,
  `MY-PCB-2026`, `MY-EA-2023`. Never `EPF_CURRENT`.

## 4. The statutory evidence register

`rule_sources` grows the fields a human verification actually produces, so that
a PDF-only instrument is fully representable:

`authority · instrument_title · instrument_number · official_url ·
published_date · effective_date · document_sha256 (where a fixed document
exists) · page_reference · provision_reference · verification_method ·
verified_by · verified_at · status`

`verification_method` records *how* the figure was established —
`HUMAN_REVIEW_OF_OFFICIAL_PDF`, `OFFICIAL_HTML_PAGE`, `OFFICIAL_API`,
`ISSUER_CORRESPONDENCE`. Human review of an official PDF is a first-class
method. OCR output is not a method; it is at best an aid to a reviewer.

A hash is recorded when there is a fixed document to hash. Living portal pages
carry a retrieval date and no hash, because hashing whatever HTML was served
that day looks like evidence without being any.

## 5. Runs stamp what produced them

`pay_runs` records the executable representation it used, permanently:

- `rule_pack_id` — already present
- `rule_pack_hash` — the pack's content hash as at calculation
- `calc_engine_version` — the version of the calculation code
- `calculated_at`

Ten years on, "why was this employee deducted RM x in July 2026?" resolves to a
specific pack version, a specific engine version, and the cited provision — not
to "the software was compliant at the time."

## 6. Statutory truth versus permitted elections

KWSP permits employer and employee contributions above the statutory rate. That
is an election, not a different law, and it must never be modelled by editing a
statutory table.

```
statutory contribution  +  permitted election  +  company policy  =  actual
```

Elections live on the employment (or the company), carry their own effective
dates and evidence — a KWSP Form 17A election has a real document behind it —
and are visible as their own line in the derivation. The statutory figure
remains what the schedule says.

## 7. Governed pay-item statutory treatment

Whether an item enters the EPF, SOCSO, EIS, PCB or HRD base is a legal question,
not a checkbox. Treatment becomes effective-dated and attributable to an
authority, and departing from the system default requires a reason and an
approver, recorded as an audit event.

An ordinary payroll administrator may create and configure pay items. They may
not quietly untick "subject to EPF" on one.

## 8. PCB is a compliance vertical, not a rate table

PCB/MTD is implemented against LHDN's annual *Specification for Monthly Tax
Deduction (MTD) Using Computerised Calculation*, and carries:

- `specificationYear` and `specificationVersion`
- official test vectors from the specification, plus Afenda parity vectors, as a
  regression suite
- `verificationStatus`: `INTERNAL_VERIFIED → SUBMITTED_TO_LHDN → LHDN_VERIFIED`

**Production-readiness gate:** Afenda is not a fully compliant Malaysian payroll
product until the computerised PCB implementation has been through LHDN's
verification procedure. This is recorded as an explicit gate, not an aspiration.

Until then the existing rule holds unchanged: **PCB is never calculated.** It is
a controlled external input with a source and an evidence reference, and net pay
is unknown without it.

## 9. What this phase implements

Governance first, ingestion second — deliberately in that order, so that when
the employment-law figures are verified there is a correct place to put them.

1. Rule-pack layer and lifecycle: enums, columns, and the triggers that make
   "only approved packs reach a payroll" and "approved packs are immutable" true
   in the database.
2. The evidence register fields on `rule_sources`.
3. Run stamping: `rule_pack_hash`, `calc_engine_version`.
4. The employment-law rule registry that replaces the `statutoryLimits` blob —
   one row per rule, effective-dated, each citing its source, none of them
   effective until verified and approved.

Deferred, with the workflow now in place to receive them: ingesting the actual
OT limit, working-hours maximum, minimum wage, OT multiplier floors and EA
First Schedule ceiling through controlled review; the elections model (§6); the
governed pay-item treatment table (§7); the PCB specification vertical (§8).

## 10. Verification

- The existing 529 tests stay green, and the July 2026 parity result is
  unchanged to the sen.
- New: a run cannot reference a non-approved rule pack; an approved pack cannot
  be edited; a superseded pack keeps its content; an employment-law rule is not
  effective until approved; a source records how it was verified.
