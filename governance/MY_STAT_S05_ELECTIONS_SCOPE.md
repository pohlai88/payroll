# MY-STAT-S05 — Elections Model Scope Decision

**Status:** **Ratified** (2026-08-08) — recommended defaults accepted.  
**Amendment ref:** §6 of
[`docs/superpowers/specs/2026-08-08-statutory-authority-amendment.md`](../docs/superpowers/specs/2026-08-08-statutory-authority-amendment.md).

## Intent

```
statutory contribution  +  permitted election  +  company policy  =  actual
```

Elections (e.g. voluntary EPF excess via KWSP Form 17A) must never be modelled
by editing a statutory band table. They are effective-dated, evidenced records
on the employment, visible as their own derivation line.

## Ratified checklist

1. **Which elections are in v1?**
   - [x] Employee voluntary EPF excess (Form 17A / equivalent)
   - [x] Employer voluntary EPF excess
   - [x] Other: **none** (no voluntary SOCSO/EIS/PCB/HRD elections in v1)
2. **Where does the election live?** **Employment only** (child table keyed by
   `employment_id`). Not company policy as the binding store for v1.
3. **Evidence required to activate?** **Optional in v1** — `evidence_ref` +
   optional verifier columns are first-class; UI prompts for Form 17A; absence
   allowed but not silent (`evidence_ref IS NULL` is visible).
4. **Effective dating:** **Per-election** `effectiveFrom` / `effectiveTo`
   (same interval style as `rule_packs`), must overlap the employment period
   to affect a run.
5. **Interaction with overrides** (`EPF_EE` / `EPF_ER`): **Coexist / layer**

```
statutory schedule
  + employment election (standing voluntary excess)
  = computed figure
  then pay_line_overrides may replace (exceptional correction)
```

Elections = normal path. Overrides = exceptional per-run replacement with
required `reason` (existing `pay_line_overrides` in `src/db/schema/run.ts`,
applied in `compose.ts` / `emit.ts`). Overrides do not create elections;
elections do not write into `epf_bands` / `rule_settings`.

## Derivation contract

- Statutory figure remains what the schedule says (amendment §6)
- Election is its own derivation node
- Posted `epf_ee_sen` / `epf_er_sen` = after election, then after override if any

## Minimal schema sketch (implementation plan next)

```text
election_kind: EPF_EE_VOLUNTARY_EXCESS | EPF_ER_VOLUNTARY_EXCESS
employment_elections:
  id, employment_id → employments,
  kind, excess semantics (fix in impl plan: excess-over-statutory vs absolute %),
  effective_from, effective_to,
  evidence_ref?, verified_by?, verified_at?,
  reason NOT NULL, created_by NOT NULL, timestamps
CHECKs: interval ordered; reason not blank
EXCLUDE / unique: no overlapping open intervals per (employment_id, kind)
```

Resolve at run on `pay_runs.period_end` (same membership style as employment
active-in-period).

## Explicitly OUT of scope for v1

- Encoding voluntary rates into `epf_bands` or `rule_settings`
- Company-level binding election store
- Voluntary excess for SOCSO / EIS / PCB / HRD
- Mandatory evidence gate (evidence optional, not blocking)
- Removing `pay_line_overrides` for EPF
- Auto-migration of historical overrides into elections

## Open risks (for implementation plan)

1. Semantics of “excess” (absolute % vs add-on % vs sen) must be fixed before code
2. Override + election double-count confusion — UI must show three layers
3. Part F / age-band interaction needs an explicit rule
4. Elections past `termination_date` must not affect runs
5. July 2026 golden parity has no elections — keep unchanged until fixtures add them

## Next step

Write a dedicated **S05 implementation plan** (schema + derivation + tests),
then execute as its own slice with its own report. Do not implement under
another slice.
