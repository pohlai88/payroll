---
description: Convert a Figma design into shadcn-studio blocks (requires Figma MCP)
argument-hint: [figma link or selection]
---

Call the shadcn-studio MCP tool `get-ftc-instructions` FIRST, then follow the returned
workflow for: $ARGUMENTS

Requires the Figma MCP server to also be connected. The workflow is: list Figma component
instances -> `parse-figma-blocks` -> install matching blocks -> assemble the page ->
replace content from Figma. Note that only text/color changes carry over from Figma;
layout and structural edits do not.
