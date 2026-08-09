// Section 4 — Gross − Deductions = Net pay equation
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./types";

interface PayEquationProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const LABELS: Record<Lang, { gross: string; deductions: string; net: string }> =
  {
    en: {
      gross: "GROSS PAY",
      deductions: "TOTAL EMPLOYEE DEDUCTIONS",
      net: "NET PAY",
    },
    ms: {
      gross: "GAJI KASAR",
      deductions: "JUMLAH POTONGAN PEKERJA",
      net: "GAJI BERSIH",
    },
  };

function EquationRow({
  label,
  sen,
  operator,
}: {
  label: string;
  sen: number | null;
  operator?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.5rem 2rem",
      }}
    >
      <span style={{ color: "var(--doc-ink-secondary)", fontSize: "0.875rem" }}>
        {!!operator && (
          <span style={{ marginRight: "0.5rem", color: "var(--doc-ink)" }}>
            {operator}
          </span>
        )}
        {label}
      </span>
      <MoneyCell sen={sen} />
    </div>
  );
}

function PayEquation({ dto, lang }: PayEquationProps) {
  const L = LABELS[lang];
  const grossSen = dto.roots.gross?.sen ?? null;
  const deductionsSen = dto.roots.deductionsTotal?.sen ?? null;
  const netSen = dto.roots.net?.sen ?? null;
  return (
    <div
      style={{
        borderTop: "1px solid var(--doc-rule-standard)",
        borderBottom: "1px solid var(--doc-rule-standard)",
        background: "var(--doc-fill-header)",
      }}
    >
      <EquationRow label={L.gross} sen={grossSen} />
      <EquationRow label={L.deductions} operator="\u2212" sen={deductionsSen} />
      <div
        style={{
          borderTop: "2px solid var(--doc-rule-total)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.75rem 2rem",
          fontWeight: 700,
        }}
      >
        <span style={{ color: "var(--doc-ink-heading)" }}>{L.net}</span>
        <span style={{ fontWeight: 700 }}>
          <MoneyCell sen={netSen} />
        </span>
      </div>
    </div>
  );
}

export { PayEquation };
