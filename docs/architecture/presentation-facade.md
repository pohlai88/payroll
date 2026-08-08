# Payroll architecture — the contract under the presentation facade

**Audience:** whoever builds the UI (Phase 4 shell, Phase 5 payroll screens, Phase 8
payslip and reports). **Purpose:** to say precisely what the layers below the screen
guarantee, so the facade can be thin, and to say what the facade must never do, so
the guarantees survive contact with it.

This is a description of the system as it exists in `src/`, not a proposal. Where
something is not built yet it is marked so. For the schema, the function surface
and the feature inventory beneath these layers, see
[payroll-architecture.md](./payroll-architecture.md).

---

## 1. The shape

```
  ┌─────────────────────────────────────────────────────────────┐
  │  L5  PRESENTATION FACADE            Phase 4 shell partial   │
  │      auth · permissions · import panel; Phase 5 payroll UI  │
  └─────────────────────────────────────────────────────────────┘
                    ▲ read model               │ intent
  ┌─────────────────────────────────────────────────────────────┐
  │  L4  API                  Neon Auth + RBAC; employee import │
  │      pay-run create/recompute + control/findings routes     │
  └─────────────────────────────────────────────────────────────┘
                    ▲                          │
  ┌─────────────────────────────────────────────────────────────┐
  │  L3  PERSISTENCE          src/db — Postgres + Drizzle       │
  │      18 tables · plpgsql triggers hold the invariants       │
  └─────────────────────────────────────────────────────────────┘
                    ▲                          │
  ┌─────────────────────────────────────────────────────────────┐
  │  L2  DERIVATION GRAPH     src/domain/derive                 │
  │      11 node kinds · roots · citations · labels · diff      │
  └─────────────────────────────────────────────────────────────┘
                    ▲ mirrored against ────────┐
  ┌─────────────────────────────────────────────────────────────┐
  │  L1  STATUTORY ENGINE     src/domain/calc — pure, DB-free   │
  │      integer sen · LineResult · the golden master           │
  └─────────────────────────────────────────────────────────────┘
                    ▲
  ┌─────────────────────────────────────────────────────────────┐
  │  L0  RULE PACK            db/seed — cited statutory data    │
  │      EPF 3rd Sch A/C/E · SOCSO+SKBBK · EIS · 8 sources      │
  └─────────────────────────────────────────────────────────────┘
```

The load-bearing property is that **L1 and L2 have no dependency on L3 or above.**
The engine imports no database client, and the graph carries no URLs or hashes —
only `(ruleId, sourceRef)` pairs that L3 resolves. That is what keeps the golden
master meaningful: it exercises the real calculation path with nothing mocked.

---

## 2. What each layer guarantees

### L0 — the rule pack

Statutory tables as data, each with an issuer, a URL, a retrieval date and a
SHA-256. A rate is never a literal in code. Rule packs are versioned, so a figure
computed in 2026 can be re-explained in 2031 against the pack that produced it.

### L1 — the statutory engine (`src/domain/calc`)

Pure functions over a snapshot. Money is **integer sen** end to end; rounding
exists in exactly one place, `src/domain/money.ts`, half away from zero, with
`assertSen` raising rather than silently losing precision. The output is
`LineResult` — a flat record of ~19 sen fields.

Verified by `tests/golden/july-2026-afenda.test.ts`: 37 real employees, every
statutory figure to the sen. **If it fails, the engine changed behaviour — do not
ship, and never update the fixture to match.**

### L2 — the derivation graph (`src/domain/derive`)

The layer the facade actually consumes. `deriveLine()` emits a DAG alongside the
engine's arithmetic — it does not replace it — and `mirror.ts` proves the two agree
across all 19 roots on the golden fixture. A divergence is an emitter bug, caught
against real payroll before it can reach a payslip.

Four properties matter to the UI:

- **Flat, keyed, shared.** One EPF band lookup feeds both the employee and the
  employer figure, so the schedule highlights once. O(1) access by node id makes
  deep links and drill-downs trivial.
- **Semantic ids.** `line.epf.ee` is `line.epf.ee` in June and in July. That is
  what makes `diff.ts` a keyed map difference — month-over-month variance
  explained, with no separate variance engine.
- **No prose.** Nodes store a message key plus typed params; the sentence renders
  at display time. This is why one graph renders in English and Malay without the
  words drifting from the figures.
- **No dead ends.** `assertNoDeadEnds` enforces that every node either has an input
  edge or is a kind permitted to be terminal — and each terminal kind explains
  itself with provenance or a citation. "Nothing is hidden" is a failing test, not
  a slogan.

### L3 — persistence (`src/db`)

18 tables across catalog, parties, rule pack and run. Invariants live in plpgsql
triggers, not in application code, so they hold regardless of which client writes.
Approval locks the calculation.

### L4 — the API (auth + import + pay-run/control routes built)

**Built today:** Hono under `src/server/` — Neon Auth Bearer JWT verification,
invite-only `users.auth_subject` linking, `/health`, `/v1/me` /
`/v1/me/permissions`, SYSTEM_ADMIN `/v1/admin/users*`, create-only
`/v1/employee-import*`, pay-run create/recompute, and Phase 6–7 control routes.
See [hono-neon-auth-design](../superpowers/specs/2026-08-08-hono-neon-auth-design.md)
and [phase4b-employee-import-api-design](../superpowers/specs/2026-08-08-phase4b-employee-import-api-design.md).

**Phase 5A (frozen):** pay-run mutations return `PayRunMutationEnvelope` — run
identity, `calcRevision` / certification fields, findings counters, and gate
readiness together. Canonical mutation response contract only — no per-line
derivation presentation, no new payroll behavior, no control/gate semantics.
See
[phase5a-mutation-envelope-design](../superpowers/specs/2026-08-08-phase5a-mutation-envelope-design.md).

**Still required for the full L4→L5 contract:** line-root payloads + derivation
graph read for the drawer; workspace UI; adopting the same envelope on remaining
payment/release routes where needed.

---

## 3. The read model the facade consumes

Three shapes cover every screen.

| Shape | Source | Feeds |
|---|---|---|
| `LineResult` roots | `readSen(graph, root)` | grid cells, totals strip, payslip figures |
| `DerivationGraph` | `deriveLine()`, persisted | the drill-down, the payslip annex |
| `GraphDiff` | `diff.ts` over two graphs | run-vs-run variance, changed-since-reviewed |

The 19 roots are the entire numeric vocabulary of the UI:

```
gross · epfWages · socsoWages · eisWages
epfEe · epfEr · socsoEeCore · socsoEeSkbbk · socsoEr · eisEe · eisEr
pcbNet · cp38 · zakat · otherDeductions · deductionsTotal
net · hrdfLevy · employerCost
```

If a screen needs a number that is not a root, the answer is a new root in the
emitter — not arithmetic in a component. A figure computed in the facade has no
node id, therefore cannot be drilled, therefore breaks the product's one promise.

---

## 4. Rendering the eleven node kinds

This is the drill-down specification. Every node the user opens is one of these,
and each has a distinct visual job.

| Kind | Terminal | What the panel shows |
|---|---|---|
| `INPUT` | yes | value, `origin`, `fieldPath`, and provenance — who entered it, when, which import batch |
| `SETTING` | yes | the scalar, its `settingKey`, `rawValue` verbatim from the pack, and its citation |
| `CLASSIFICATION` | no | the decision (age, EPF part, SOCSO category, EIS eligibility, SKBBK window), a `manual` marker when a human set it, and the detail line explaining *which* rule chose it |
| `TABLE_LOOKUP` | see note | the wage searched for, the matched row, `rowIndex` of `rowCount`, and `neighbours.prev/next` so "you are RM12 below the next band" is visible. Fetch the table by `tableId` once and highlight — the node deliberately carries the row, not the table |
| `CALCULATION` | no | the operator and its operands, refs resolved to their own nodes |
| `ROUNDING` | no | pre-rounded value, mode, and `deltaSen`. `NO_OP` when rounding changed nothing |
| `PRORATION` | no | basis, numerator/denominator, Employment Act citation. A full month reads "no proration applied", never "× 1" |
| `EXTERNAL_VERIFIED` | yes | PCB only. Amount, source, `verificationStatus`, evidence ref |
| `MANUAL_OVERRIDE` | no | computed **and** applied side by side, plus reason, evidence, approver. The computed node stays in the graph as an input |
| `AGGREGATE` | no | members with their roles — and **excluded members with `because`**. This is the answer to "why isn't my overtime in EPF wages?" |
| `NOT_APPLICABLE` | yes | a zero with a citation. Renders as "contributes nothing by law", never as a blank or a bare 0.00 |

`TERMINAL_KINDS` is the four that may have zero inputs. `TABLE_LOOKUP` also ends the
"why" chain in the sense that its value is read from a cited document, but its type
requires the wage edge, so the drill continues downward into how that wage was built.

**Node flags** map to UI treatment:

| Flag | Meaning | Treatment |
|---|---|---|
| `REVIEW_REQUIRED` | EIS contribution history at 57 unknown | warn tone, blocks review |
| `UNVERIFIED` | PCB entered, not yet checked against source | warn tone + verify affordance |
| `NOT_ENTERED` | PCB absent — net pay is unknown | the figure renders as unknown, **not zero** |
| `NO_OP` | rounding or proration changed nothing | collapse by default |

`SEN_UNKNOWN` is a real value in this system. A net pay whose PCB has not been
entered is *unknown*, and the facade must render it as such. Substituting zero is
the single most damaging thing the presentation layer could do.

---

## 5. Facade rules

These follow from the layering. Each one, if broken, silently converts a verified
system into an unverifiable one.

1. **Never recalculate.** The renderer reads persisted values and trace. No
   component adds, prorates, or applies a rate. If the number isn't there, add a
   root.
2. **Never format money by hand.** Sen in, `MoneyText`/`MoneyInput` out — the only
   money renderers, tabular-nums, `allowNegative` per field schema.
3. **Never write prose about a figure.** Labels are `key + params` rendered by
   `renderLabel(label, lang)`. A hardcoded English sentence next to a number is how
   the words drift from the arithmetic, and it makes the Malay payslip impossible.
4. **Never auto-calculate PCB.** It is `EXTERNAL_VERIFIED` — supplied, evidenced,
   possibly unknown. There is no code path that computes it and there must not be.
5. **Never render `NOT_APPLICABLE` as blank.** A zero owed to statute and a zero
   from a failed lookup must not look alike; the whole node kind exists to keep
   them distinguishable.
6. **Never resolve citations client-side from a hardcoded map.** Nodes carry
   `(ruleId, sourceRef)`; the issuer, URL and SHA-256 come from the rule pack join
   at render time. Reading a manifest with an unknown id is a **strict reject** with
   a clear error — never a silently dropped citation.
7. **Colour follows [the palette contract](../palette/README.md).** No raw hex, no
   raw Tailwind palette utilities, deductions in neutral ink.

---

## 6. Screen mapping

| Screen | Reads | Notes |
|---|---|---|
| Pay-run grid | roots per line + rollups | layout in [workspace-grid.md](../palette/workspace-grid.md) |
| Totals strip | run-level root sums | each tile filters the grid to its constituents |
| Employee sheet | line inputs + roots by group | Earning / Deduction / Employer panels |
| Drill-down | one graph, entered at a root | §4 above; walks `inputs` recursively |
| Payslip p.1 | roots + item lines | financial statement |
| Payslip p.2 | full graph + citations | the annex that answers "why", bilingual from the same graph |
| Run diff | `diff.ts` | `VALUE` / `STRUCTURE` / `CITATION` entries read as explanations already |

**On the AutoCount reference.** Its process screen is a good grid — see the hybrid
worked out in [workspace-grid.md](../palette/workspace-grid.md) — and its per-line
scheme tags ("SOCSO & EIS | Tax") are the right instinct. The structural difference
is that those tags are a *label*, whereas here every cell is a graph root and the
tag is derivable from the pay-item matrix flags that actually drove the wage bases.
The facade's job is to expose that, not to reproduce a grid that can only assert.

---

## 7. What the facade owns

Layout, navigation, selection, keyboard model, empty and loading states, formatting
via the shared renderers, and the collection of user intent. It owns **no** payroll
truth. The test: delete the facade and every statutory figure, citation and
explanation still exists and is still provable. That is currently true, and it is
worth keeping true.

---

## 8. Seams not yet closed

- **L4 payroll workspace contract incomplete.** Auth, employee import, pay-run
  create/recompute, and control HTTP exist; the unified
  validate→persist→recompute→findings→revision response for every payroll UI
  mutation (pay-run workspace) is not fully wired into L5.
- **L5 product payroll UI.** Phase 4 shell (auth, permissions, import panel,
  design-system foundation) exists; Phase 5 derivation drawer / payroll screens
  do not.
- **Graph persistence.** `deriveLine` runs in-process today; which graphs are stored
  versus re-derived on read is undecided, and it determines whether the drill-down
  is a fetch or a recompute.
- **Rule-pack resolution at render time** has no query layer yet; §5.6 describes the
  contract it must satisfy.
