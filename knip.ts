/**
 * @feature shell
 * @layer spine
 *
 * Knip unused-export / entry configuration.
 */

import type { KnipConfig } from "knip";

/**
 * Clarity Payroll — Vite SPA + marketing landing + Hono API + Vitest.
 *
 * Production-only patterns use a trailing `!`
 * (https://knip.dev/features/production-mode).
 *
 * The API entry is injected only for `--production`: in default mode it is
 * already reached via package.json `dev:api` / `start`, and listing it again
 * triggers a redundant-entry configuration hint.
 */
const isProduction = process.argv.includes("--production");

const config = {
  entry: [
    // Vite plugin only auto-reads root index.html → src/web/main.tsx.
    "src/marketing/main.tsx!",
    ...(isProduction ? (["src/server/dev-server.ts!"] as const) : []),
    // Ops scripts not referenced from package.json scripts.
    "scripts/explain.ts",
    "scripts/invite-user.ts",
    "scripts/setup-dev-user.ts",
    "scripts/smoke-auth.ts",
  ],
  project: [
    // Include .css so Tailwind / tw-animate / @fontsource / shadcn @imports resolve.
    "src/**/*.{ts,tsx,css}!",
    "tests/**/*.{ts,tsx}",
    "scripts/**/*.{ts,js,cjs,mjs}",
    "*.config.{ts,js,mjs,cjs}",
  ],
  // Vitest entry overrides replace defaults — keep test globs + globalSetup.
  vitest: {
    entry: [
      "**/*.{bench,test,test-d,spec,spec-d}.?(c|m)[jt]s?(x)",
      "**/__mocks__/**/*.?(c|m)[jt]s?(x)",
      "tests/db/harness/global-setup.ts",
    ],
  },
  ignoreFiles: [
    // Design-system shelf (unused-file signal only).
    "src/components/ui/**",
    "src/components/shadcn-studio/**",
    "src/assets/svg/**",
  ],
  ignoreIssues: {
    "src/components/ui/**": ["exports", "types"],
    "src/web/api/payroll-api.ts": ["exports", "types"],
    // Calc / derive / findings / seal are library surfaces (tests, explain,
    // future routes). Exported symbols are the public engine API even when
    // the SPA does not import every helper yet.
    "src/domain/calc/**": ["exports", "types"],
    "src/domain/derive/**": ["exports", "types"],
    "src/domain/findings/**": ["exports", "types"],
    "src/domain/seal/**": ["exports", "types"],
    // RBAC repo helpers reserved for admin permission-matrix UI.
    "src/repo/rbac.ts": ["exports", "types"],
    // Marketing content modules export section data for composition.
    "src/marketing/content.ts": ["exports", "types"],
  },
  ignoreDependencies: [
    // Shelf-only until a routed screen imports motion-toggle-group.
    "motion",
    // Vite plugin — used from vite.config.ts (excluded under --production).
    "@tailwindcss/vite!",
    // Intentionally kept for registry/CLI inventory; runtime UI is base-nova
    // + @base-ui/react (components.json style: "base-nova"), not radix-ui.
    "radix-ui",
  ],
  ignoreExportsUsedInFile: {
    type: true,
    interface: true,
  },
  treatConfigHintsAsErrors: true,
} satisfies KnipConfig;

export default config;
