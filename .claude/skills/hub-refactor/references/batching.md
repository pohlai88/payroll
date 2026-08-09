# Hub refactor — batching and order

## Never batch together

| Pair | Why |
|------|-----|
| `pay-run` + `control` | Shared `pay-run-access`, largest blast radius |
| `diff` + `derivation` | Shared `service/line-derivation` |
| `reports` + `remuneration` | Same reports portal + fat SQL aggregates |
| `payslip` + `workspace` | Nested read models / large DTOs |
| `me` + `admin-users` | Shared `service/rbac` + `repo/rbac` |
| `employees` + `employee-import` | Same employees page / parties spine |
| Fat extract + gold `companies` in one PR | Different goals; muddies review |

`control` leaf domains (payments / release / close / seal / artifacts) stay under the **control** hub — do not co-batch with `pay-run` lifecycle work.

## Safe parallel (separate agents/PRs, no shared files)

`health` ‖ `marketing` ‖ `treatments` ‖ `transfer` ‖ `companies`

`derivation` OK alone anytime — never same batch as `diff`.

## Debt-cleanup order

1. Warm-up: `companies` or `treatments` / `transfer`
2. Fat extracts one by one: `remuneration` → `reports` → `payslip` → `workspace` (add service)
3. Shared-service hubs last and alone: `pay-run`, then `control`

## Risk hints

| Safer alone | Riskier alone |
|-------------|----------------|
| `health`, `marketing`, `treatments`, `transfer`, `companies`, `derivation` | `reports`, `remuneration`, `payslip`, `workspace`, `control`, `pay-run` |

Gold template: `companies`. Fat-route / extract targets: `reports`, `remuneration`, `payslip`, `workspace`.
