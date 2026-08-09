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
