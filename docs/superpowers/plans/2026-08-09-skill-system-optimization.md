# Skill System Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize project skills so vite-fullstack (create/wire), hub-refactor (debt extract), and file-headers (canonical hub map) have clear ownership, one hub-map source, documented load order, and synced `.cursor`/`.claude` copies.

**Architecture:** Docs-only change under `.cursor/skills/**` (primary) mirrored to `.claude/skills/**`. No `src/` product edits. Spec: [2026-08-09-skill-system-optimization-design.md](../specs/2026-08-09-skill-system-optimization-design.md).

**Tech Stack:** Markdown skills; PowerShell/bash verification via `rg`.

## Global Constraints

- No `src/` product behavior changes
- Do not merge hub-refactor into vite-fullstack
- Do not split file-headers into a third top-level skill
- Do not copy personal skills into the repo
- Canonical hub map + slug list live only in `file-headers.md`
- Edit `.cursor/skills/**` first, then mirror to `.claude/skills/**`
- Hub count for audits: **17** (16 API route hubs + marketing landing)

## File map

| File | Responsibility |
|------|----------------|
| Create: `.cursor/skills/README.md` | Skill map, load order, sync rule |
| Modify: `.cursor/skills/vite-fullstack/references/file-headers.md` | Audit = 17 hubs; tighten `@hub` audit |
| Modify: `.cursor/skills/hub-refactor/SKILL.md` | Remove hub table; add load order; link file-headers |
| Modify: `.cursor/skills/vite-fullstack/SKILL.md` | Scope gate → hub-refactor |
| Modify: `.cursor/skills/vite-fullstack/references/continuous-dev.md` | Debt extract → hub-refactor one-liner |
| Mirror: `.claude/skills/**` matching paths | Bit-identical copies after each primary edit |

---

### Task 1: Canonical file-headers audit + hub-map ownership

**Files:**
- Modify: `.cursor/skills/vite-fullstack/references/file-headers.md`
- Mirror: `.claude/skills/vite-fullstack/references/file-headers.md`

**Interfaces:**
- Produces: Audit text stating **17** hubs; `@hub` audit covering repo/service/feature UI/payslip-document/feature-bound studio

- [ ] **Step 1: Patch hub-count line in Audit section**

In `.cursor/skills/vite-fullstack/references/file-headers.md`, replace:

```markdown
# Hubs (expect 16 API routes + marketing landing)
rg -l '@chain' src
```

with:

```markdown
# Hubs (expect 17: 16 API route hubs + marketing landing; pay-run-access is not a hub)
rg -l --glob '*.ts' --glob '*.tsx' '(?m)^\s*\* @chain' src
```

- [ ] **Step 2: Tighten `@hub` audit block**

Replace the leaves audit bullet under Audit with:

```markdown
# Leaves that require @hub (repo, service, feature UI, payslip-document, feature-bound studio/payroll)
# Expect: no output (or only shell-optional files you intentionally skip)
rg -L '@hub |@chain' src/repo src/service
rg -L '@hub |@chain' src/web/payrun src/web/control src/web/reports src/web/employees src/web/companies src/web/admin src/web/dashboard src/components/payroll
```

Keep the Hub map table intact (canonical). Keep exceptions: `vite-env.d.ts`, `src/db/migrations/**`.

- [ ] **Step 3: Mirror and verify**

```powershell
Copy-Item -Force ".cursor\skills\vite-fullstack\references\file-headers.md" ".claude\skills\vite-fullstack\references\file-headers.md"
rg -n "expect 17" .cursor/skills/vite-fullstack/references/file-headers.md .claude/skills/vite-fullstack/references/file-headers.md
```

Expected: both files show `expect 17`.

- [ ] **Step 4: Commit**

```bash
git add .cursor/skills/vite-fullstack/references/file-headers.md .claude/skills/vite-fullstack/references/file-headers.md
git commit -m "Clarify file-headers audit for 17 hubs and required @hub leaves."
```

---

### Task 2: Slim hub-refactor SKILL (no duplicate hub map)

**Files:**
- Modify: `.cursor/skills/hub-refactor/SKILL.md`
- Mirror: `.claude/skills/hub-refactor/SKILL.md`

**Interfaces:**
- Consumes: hub paths from `../vite-fullstack/references/file-headers.md` only
- Produces: Quality bar section with explicit 5-step load order from the spec

- [ ] **Step 1: Replace Quality bar section**

Replace the entire `## Quality bar (apply every hub)` section with:

```markdown
## Quality bar + load order (every hub)

Load in this order:

1. This skill (`hub-refactor`)
2. [file-headers.md](../vite-fullstack/references/file-headers.md) — hub map, tags, audit
3. Personal **code-quality** + **coding-standards** (ignore Next/tRPC/Prisma advice; stack is Vite + Hono + Drizzle)
4. [vite-fullstack](../vite-fullstack/SKILL.md) only if wiring / DTO / nav / registration breaks (Mode B)
5. After tests: Task **code-reviewer** on this hub's diff; fix criticals before the next hub
```

- [ ] **Step 2: Remove Hub map (quick) table**

Delete the entire `## Hub map (quick)` section (from that heading through the marketing row table). Immediately after Intent presets / default slug, insert:

```markdown
## Hub map

Canonical slug → hub path table: [file-headers.md — Hub map](../vite-fullstack/references/file-headers.md#hub-map-api--marketing). Do not duplicate paths here.
```

(If the markdown heading anchor differs in the renderer, the link target heading text must remain `## Hub map (API + marketing)` in file-headers.)

- [ ] **Step 3: Verify no hub path table remains**

```bash
rg -n "src/server/routes/admin-companies" .cursor/skills/hub-refactor/SKILL.md
```

Expected: no matches (paths only via link to file-headers).

- [ ] **Step 4: Mirror and commit**

```powershell
Copy-Item -Force ".cursor\skills\hub-refactor\SKILL.md" ".claude\skills\hub-refactor\SKILL.md"
git add .cursor/skills/hub-refactor/SKILL.md .claude/skills/hub-refactor/SKILL.md
git commit -m "Point hub-refactor at canonical hub map and fix load order."
```

---

### Task 3: vite-fullstack Scope gate + continuous-dev pointer

**Files:**
- Modify: `.cursor/skills/vite-fullstack/SKILL.md` (Scope gate table)
- Modify: `.cursor/skills/vite-fullstack/references/continuous-dev.md` (complements table + purpose)
- Mirror both under `.claude/skills/vite-fullstack/`

**Interfaces:**
- Produces: Scope gate row routing bulk refactor to hub-refactor

- [ ] **Step 1: Add Scope gate row**

In `.cursor/skills/vite-fullstack/SKILL.md` under `## Scope gate`, add this row to the table (after FE folder refactor row):

```markdown
| Bulk refactor / fat-route extract / polish by `@feature` | [hub-refactor](../hub-refactor/SKILL.md) — one `@chain` hub at a time |
```

- [ ] **Step 2: continuous-dev complements table**

In `.cursor/skills/vite-fullstack/references/continuous-dev.md`, in the complements table at top, add:

```markdown
| `../hub-refactor/SKILL.md` | Multi-file debt extract / polish by hub (`@feature` / `@chain`) |
```

In `## 1. Purpose`, after the sentence about employees/payslip debt, append:

```markdown
For a hub-scoped extract program, use [hub-refactor](../../hub-refactor/SKILL.md) instead of inventing a parallel checklist.
```

- [ ] **Step 3: Verify and mirror**

```bash
rg -n "hub-refactor" .cursor/skills/vite-fullstack/SKILL.md .cursor/skills/vite-fullstack/references/continuous-dev.md
```

Expected: Scope gate + continuous-dev both mention hub-refactor.

```powershell
Copy-Item -Force ".cursor\skills\vite-fullstack\SKILL.md" ".claude\skills\vite-fullstack\SKILL.md"
Copy-Item -Force ".cursor\skills\vite-fullstack\references\continuous-dev.md" ".claude\skills\vite-fullstack\references\continuous-dev.md"
git add .cursor/skills/vite-fullstack/SKILL.md .cursor/skills/vite-fullstack/references/continuous-dev.md .claude/skills/vite-fullstack/SKILL.md .claude/skills/vite-fullstack/references/continuous-dev.md
git commit -m "Route bulk hub refactors from vite-fullstack to hub-refactor."
```

---

### Task 4: Skill map README + sync

**Files:**
- Create: `.cursor/skills/README.md`
- Create: `.claude/skills/README.md` (mirror)

**Interfaces:**
- Produces: Discoverable skill map matching spec § Skill map README + Agent load order

- [ ] **Step 1: Write `.cursor/skills/README.md`**

Create the file with exactly this content:

```markdown
# Project skills (Clarity Payroll)

Primary tree: `.cursor/skills/`. Mirror: `.claude/skills/` (same relative paths). **Edit primary, then copy to mirror.**

## When to load which

| Ask | Skill | Start |
|-----|-------|-------|
| New/changed API page, DTO, nav, Mode A create | `vite-fullstack` | [vite-fullstack/SKILL.md](vite-fullstack/SKILL.md) |
| Drift / 404 / unwired / DTO skew | `vite-fullstack` Mode B | [vite-fullstack/references/drift-audit.md](vite-fullstack/references/drift-audit.md) |
| `@feature` / `@layer` / `@hub` / `@chain` tags or audit | file-headers (under vite-fullstack) | [vite-fullstack/references/file-headers.md](vite-fullstack/references/file-headers.md) |
| Bulk refactor / fat-route extract / polish one hub | `hub-refactor` | [hub-refactor/SKILL.md](hub-refactor/SKILL.md) |
| Never-batch pairs / debt order | hub-refactor batching | [hub-refactor/references/batching.md](hub-refactor/references/batching.md) |

Personal skills (not in repo): **code-quality**, **coding-standards**, **code-reviewer**. On hub work, vite-fullstack stack rules override any Next.js/tRPC/Prisma advice from those skills.

## Hub refactor load order

1. `hub-refactor`
2. `file-headers.md`
3. Personal code-quality + coding-standards
4. `vite-fullstack` only if Mode B wiring break
5. Task code-reviewer on that hub's diff after tests

## Mode A / Mode B load order

1. `vite-fullstack` (+ checklist / surface-map as needed)
2. `file-headers.md` when touching files
3. Personal quality skills as usual
4. Do not start `hub-refactor` unless the ask is multi-file debt extract

## Sync

```powershell
Copy-Item -Recurse -Force ".cursor\skills\vite-fullstack\*" ".claude\skills\vite-fullstack\"
Copy-Item -Recurse -Force ".cursor\skills\hub-refactor\*" ".claude\skills\hub-refactor\"
Copy-Item -Force ".cursor\skills\README.md" ".claude\skills\README.md"
```

Spec: [docs/superpowers/specs/2026-08-09-skill-system-optimization-design.md](../../docs/superpowers/specs/2026-08-09-skill-system-optimization-design.md).
```

- [ ] **Step 2: Mirror README**

```powershell
Copy-Item -Force ".cursor\skills\README.md" ".claude\skills\README.md"
```

- [ ] **Step 3: Final acceptance checks**

```bash
# Exactly one hub path table location (admin-companies path string)
rg -l "src/server/routes/admin-companies.ts" .cursor/skills .claude/skills
```

Expected: only `**/file-headers.md` (cursor + claude = 2 files), **not** hub-refactor/SKILL.md.

```bash
rg -n "Bulk refactor" .cursor/skills/vite-fullstack/SKILL.md
rg -n "Hub refactor load order" .cursor/skills/README.md
```

Expected: both match.

```powershell
fc /b .cursor\skills\README.md .claude\skills\README.md
fc /b .cursor\skills\hub-refactor\SKILL.md .claude\skills\hub-refactor\SKILL.md
```

Expected: no differences (or `FC: no differences encountered`).

- [ ] **Step 4: Commit**

```bash
git add .cursor/skills/README.md .claude/skills/README.md
git commit -m "Add project skills map and .cursor to .claude sync rule."
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Ownership table / skill map README | Task 4 |
| Canonical hub map only in file-headers | Tasks 1–2 |
| Hub count 17 + audit | Task 1 |
| vite-fullstack Scope gate → hub-refactor | Task 3 |
| continuous-dev debt pointer | Task 3 |
| hub-refactor remove table + load order | Task 2 |
| Sync `.cursor` → `.claude` | Tasks 1–4 |
| No src/ changes | Global Constraints |
