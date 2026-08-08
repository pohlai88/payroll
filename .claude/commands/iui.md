---
description: Generate a new UI block inspired by shadcn-studio blocks (Pro)
argument-hint: [what to build]
---

Call the shadcn-studio MCP tool `get-inspire-instructions` FIRST, then follow the returned
instructions step by step to generate: $ARGUMENTS

Uses `get-blocks-metadata` and `get-inspiration-block-content`. This command requires a
shadcn-studio Pro license (API_KEY + EMAIL in `.mcp.json`); if the tool reports a freemium
limit, say so and fall back to `/cui`.

Respect this project's `components.json` conventions and build one block at a time.
