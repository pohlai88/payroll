---
description: Create a new shadcn/ui block from shadcn-studio blocks
argument-hint: [what to build]
---

Call the shadcn-studio MCP tool `get-create-instructions` FIRST, then follow the returned
instructions step by step, in order, to build: $ARGUMENTS

Rules:
- Use `get-blocks-metadata` to pick candidate blocks, then the block-content/add-command
  tools the instructions name. Do not invent block names.
- Respect this project's `components.json` (style `base-nova`, `src/components/ui`,
  aliases `@/components`, `@/lib/utils`, `@/hooks`) — never re-init shadcn.
- Build one block at a time.
