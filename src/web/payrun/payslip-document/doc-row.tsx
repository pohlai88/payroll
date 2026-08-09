/**
 * @feature payslip
 * @layer ui
 * @hub src/server/routes/pay-run-payslip.ts
 *
 * Payslip document section.
 */

import { MoneyCell } from "@/components/payroll/money-cell";

interface DocRowProps {
  label: string;
  sen: number | null;
  notApplicable?: boolean;
  bold?: boolean;
}

function DocRow({
  label,
  sen,
  notApplicable = false,
  bold = false,
}: DocRowProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0.375rem 2rem",
        borderBottom: "1px solid var(--doc-rule-hairline)",
        fontWeight: bold ? 700 : undefined,
      }}
    >
      <span style={{ color: "var(--doc-ink)", fontSize: "0.875rem" }}>
        {label}
      </span>
      <MoneyCell notApplicable={notApplicable} sen={sen} />
    </div>
  );
}

export type { DocRowProps };
export { DocRow };
