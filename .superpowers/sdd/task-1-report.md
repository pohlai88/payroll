# Task 1 Report: Canonical file-headers audit + hub-map ownership

**Branch:** `skill-system-optimization`  
**Base SHA:** `2a60499d098e8327161bc47a294224283e2861d5`  
**Commit:** `1509056` — docs(skills): make file-headers the single hub-map owner  
**Status:** DONE_WITH_CONCERNS

## Summary

Task 1 makes `.cursor/skills/vite-fullstack/references/file-headers.md` the canonical hub-map owner by updating the Audit section to expect **17 hubs** (16 API route hubs + marketing landing) and tightening the `@hub` leaf audit to cover repo, service, feature UI trees, payslip-document, and feature-bound `components/payroll`. The file was mirrored bit-identically to `.claude/skills/vite-fullstack/references/file-headers.md`. Only those two paths were committed; unrelated working-tree header stamps in `src/` were not staged.

## Changes implemented

### Step 1 — Hub-count audit line

Replaced:

```bash
# Hubs (expect 16 API routes + marketing landing)
rg -l '@chain' src
```

With:

```bash
# Hubs (expect 17: 16 API route hubs + marketing landing; pay-run-access is not a hub)
rg -l --glob '*.ts' --glob '*.tsx' '(?m)^\s*\* @chain' src
```

### Step 2 — Tightened `@hub` audit block

Replaced the broad `src/web` leaf grep with scoped paths:

```bash
# Leaves that require @hub (repo, service, feature UI, payslip-document, feature-bound studio/payroll)
# Expect: no output (or only shell-optional files you intentionally skip)
rg -L '@hub |@chain' src/repo src/service
rg -L '@hub |@chain' src/web/payrun src/web/control src/web/reports src/web/employees src/web/companies src/web/admin src/web/dashboard src/components/payroll
```

**Preserved unchanged:**
- Hub map table (`## Hub map (API + marketing)`) — 18 rows mapping slugs to hub paths
- Documented exceptions: `src/web/vite-env.d.ts`, `src/db/migrations/**`
- `@hub` required-layer table including payslip-document and feature-bound studio/payroll

## Verification

| Check | Command | Result |
|-------|---------|--------|
| Mirror sync | `Copy-Item -Force ...` + `cmd /c fc /b ...` | `FC: no differences encountered` |
| Expect 17 in both trees | `rg -n "expect 17" .cursor/... .claude/...` | Both files line 15 match |
| Hub count | `rg -l --glob '*.ts' --glob '*.tsx' '(?m)^\s*\* @chain' src` | **17 files** (matches expectation) |
| Commit scope | `git show --stat HEAD` | 2 files only |

### Hub list (17)

```
src/server/routes/admin-companies.ts
src/server/routes/admin-users.ts
src/server/routes/employee-import.ts
src/server/routes/employee-remuneration.ts
src/server/routes/employees.ts
src/server/routes/health.ts
src/server/routes/me.ts
src/server/routes/pay-run-control.ts
src/server/routes/pay-run-derivation.ts
src/server/routes/pay-run-diff.ts
src/server/routes/pay-run-payslip.ts
src/server/routes/pay-run-reports.ts
src/server/routes/pay-run-workspace.ts
src/server/routes/pay-run.ts
src/server/routes/treatments.ts
src/server/routes/transfers.ts
src/marketing/landing.tsx
```

`pay-run-access.ts` correctly excluded (not a hub).

### `@hub` leaf audit (correct ripgrep flag)

Plan/bash blocks use `rg -L` for “files without match.” In **ripgrep 15.x**, `-L` means `--follow` (symlinks), not `--files-without-match`. Verified with the long flag:

```powershell
rg --files-without-match "@hub |@chain" src/repo src/service
# → 0 files (pass)

rg --files-without-match "@hub |@chain" src/web/payrun ... src/components/payroll
# → 1 file: src/web/payrun/payslip-document/payslip-print.css (CSS, likely intentional skip)
```

All `.ts`/`.tsx` leaves in scoped trees carry `@hub` or `@chain`.

## Self-review against spec

| Requirement | Met? |
|-------------|------|
| Audit text states 17 hubs | Yes |
| `@hub` audit covers repo/service/feature UI/payslip-document/payroll | Yes |
| Hub map table remains canonical sole path table | Yes |
| Exceptions documented | Yes |
| Mirror `.cursor` → `.claude` | Yes |
| No `src/` product changes | Yes |
| Commit only task paths | Yes |

## Concerns

1. **`rg -L` semantics:** Ripgrep `-L` is `--follow`, not `--files-without-match`. The untagged audit (line 13) and new `@hub` audits inherit this from the plan verbatim. Agents should use `rg --files-without-match` until a follow-up task fixes the audit block flags.
2. **PowerShell piping:** Unquoted `'@hub |@chain'` splits on `|` in PowerShell. Use double quotes or run audit blocks in bash/cmd.
3. **CSS in scoped trees:** `payslip-print.css` appears when using `--files-without-match` without glob filters; acceptable under “intentionally skip” comment but could be clarified later.

## Files touched

- `.cursor/skills/vite-fullstack/references/file-headers.md` (modified audit section)
- `.claude/skills/vite-fullstack/references/file-headers.md` (mirror)

## Commit

```
1509056 docs(skills): make file-headers the single hub-map owner

Expect 17 hubs (16 API + marketing). Tighten @hub audit. Skill-system optimization Task 1.
```

---

## Task 1 review fix (2026-08-09)

**Commit:** `36414f6` — docs(skills): fix file-headers audit rg files-without-match  
**Status:** DONE (concerns from initial pass resolved)

### Changes

Replaced all three audit uses of `rg -L` (ripgrep `--follow`, not “files without match”) with `rg --files-without-match`:

1. Untagged `@feature` scan (line 13)
2. `@hub` leaf audit — `src/repo src/service` (line 20)
3. `@hub` leaf audit — feature UI / payslip-document / payroll trees (line 21)

Added one-line PowerShell note after the bash audit block: quote patterns containing `|` (e.g. `"@hub |@chain"`).

Mirrored bit-identically to `.claude/skills/vite-fullstack/references/file-headers.md`.

### Verification (post-fix)

| Check | Result |
|-------|--------|
| No remaining `rg -L` in audit block | Pass — only `--files-without-match` |
| `fc /b` cursor vs claude | `FC: no differences encountered` |
| Untagged `@feature` grep | 0 files |
| `@hub` repo/service | 0 files |
| `@hub` web/payroll trees | 1 file: `payslip-print.css` (CSS, intentional skip per audit comment) |
| Commit scope | 2 files only |

### Concerns resolved

- ~~`rg -L` semantics~~ — fixed to `--files-without-match`
- ~~PowerShell piping~~ — documented one-line note added

Remaining minor note: `payslip-print.css` lacks `@hub` in scoped web trees; acceptable under “intentionally skip” comment.

### Commit

```
36414f6 docs(skills): fix file-headers audit rg files-without-match

Use --files-without-match instead of -L (follow). Task 1 review fix.
```
