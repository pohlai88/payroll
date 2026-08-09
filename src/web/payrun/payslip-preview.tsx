/**
 * Payslip print preview — Phase 5B simplified layout, English-only,
 * light-only via `--doc-*` tokens (independent of dark mode). Renders the
 * workspace's `roots` verbatim; no client-side recalculation. The governed,
 * legally-compliant payslip render (multi-language, PDF export) is Phase 8 —
 * see `docs/architecture/payslip-legal-requirements.md`.
 */

import { MoneyCell } from "@/components/payroll/money-cell";
import type { EmployeeLineDto } from "@/web/api/payroll-api";

interface PayslipPreviewProps {
  readonly line: EmployeeLineDto;
  readonly onPrint: () => void;
}

interface PayslipRow {
  readonly label: string;
  readonly key: string;
}

const EARNING_ROWS: readonly PayslipRow[] = [
  { label: "Gross Pay", key: "gross" },
];

const DEDUCTION_ROWS: readonly PayslipRow[] = [
  { label: "EPF (Employee)", key: "epfEe" },
  { label: "SOCSO (Employee)", key: "socsoEeCore" },
  { label: "SKBBK", key: "socsoEeSkbbk" },
  { label: "EIS (Employee)", key: "eisEe" },
  { label: "PCB", key: "pcbNet" },
  { label: "CP38", key: "cp38" },
  { label: "Zakat", key: "zakat" },
  { label: "Other Deductions", key: "otherDeductions" },
];

function PayslipPreview({ line, onPrint }: PayslipPreviewProps) {
  return (
    <div
      className="flex flex-col gap-0 rounded border text-sm"
      style={{
        background: "var(--doc-fill-paper)",
        color: "var(--doc-ink)",
        fontFamily: "Geist, system-ui, sans-serif",
      }}
    >
      <div
        className="px-6 py-4"
        style={{
          background: "var(--doc-fill-header)",
          borderBottom: "1px solid var(--doc-rule-standard)",
        }}
      >
        <p
          className="font-semibold text-base"
          style={{ color: "var(--doc-ink-heading)" }}
        >
          PAYSLIP
        </p>
        <p
          className="mt-0.5 text-sm"
          style={{ color: "var(--doc-ink-secondary)" }}
        >
          {line.employeeName} · {line.employeeCode}
        </p>
      </div>

      <PayslipSection
        label="EARNINGS"
        roots={line.roots}
        rows={EARNING_ROWS}
        section="earning"
      />
      <PayslipSection
        label="DEDUCTIONS"
        roots={line.roots}
        rows={DEDUCTION_ROWS}
        section="deduction"
      />

      <div
        className="flex items-center justify-between px-6 py-3 font-semibold"
        style={{
          background: "var(--doc-fill-subtotal)",
          borderTop: "2px solid var(--doc-rule-total)",
        }}
      >
        <span style={{ color: "var(--doc-ink-heading)" }}>NET PAY</span>
        <MoneyCell
          className="font-semibold"
          sen={line.roots.net?.sen ?? null}
        />
      </div>

      <div
        className="flex justify-end border-t px-6 py-3"
        style={{ borderColor: "var(--doc-rule-hairline)" }}
      >
        <button
          className="rounded border px-3 py-1.5 font-medium text-xs"
          onClick={onPrint}
          style={{
            borderColor: "var(--doc-rule-standard)",
            color: "var(--doc-ink)",
          }}
          type="button"
        >
          Print preview
        </button>
      </div>
    </div>
  );
}

interface PayslipSectionProps {
  readonly label: string;
  readonly section: "earning" | "deduction";
  readonly rows: readonly PayslipRow[];
  readonly roots: EmployeeLineDto["roots"];
}

function PayslipSection({ label, section, rows, roots }: PayslipSectionProps) {
  const fillVar =
    section === "earning"
      ? "--doc-section-earning-fill"
      : "--doc-section-deduction-fill";
  const inkVar =
    section === "earning"
      ? "--doc-section-earning-ink"
      : "--doc-section-deduction-ink";

  return (
    <div>
      <div
        className="px-6 py-1.5 font-semibold text-xs uppercase tracking-wider"
        style={{ background: `var(${fillVar})`, color: `var(${inkVar})` }}
      >
        {label}
      </div>
      {rows.map(({ label: rowLabel, key }) => {
        const rootValue = roots[key];
        if (rootValue?.notApplicable) {
          return null;
        }
        return (
          <div
            className="flex items-center justify-between px-6 py-1.5"
            key={key}
            style={{ borderBottom: "1px solid var(--doc-rule-hairline)" }}
          >
            <span style={{ color: "var(--doc-ink)" }}>{rowLabel}</span>
            <MoneyCell sen={rootValue?.sen ?? null} />
          </div>
        );
      })}
    </div>
  );
}

export type { PayslipPreviewProps };
export { PayslipPreview };
