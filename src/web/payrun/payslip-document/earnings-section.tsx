// Section 5A — Earning line items from payLineItems
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./types";

interface EarningsSectionProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const HEADING: Record<Lang, string> = { en: "EARNINGS", ms: "PENDAPATAN" };

function EarningsSection({ dto, lang }: EarningsSectionProps) {
  const earnings = dto.lineItems.filter(
    (i) => i.kind === "EARNING" || i.kind === "ALLOWANCE"
  );
  if (earnings.length === 0) {
    // Fall back to gross root when no line items exist (e.g. old runs without payLineItems)
    return (
      <div>
        <div
          style={{
            padding: "0.375rem 2rem",
            fontSize: "0.75rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            background: "var(--doc-section-earning-fill)",
            color: "var(--doc-section-earning-ink)",
          }}
        >
          {HEADING[lang]}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "0.375rem 2rem",
            borderBottom: "1px solid var(--doc-rule-hairline)",
          }}
        >
          <span style={{ color: "var(--doc-ink)", fontSize: "0.875rem" }}>
            {lang === "en" ? "Gross Pay" : "Gaji Kasar"}
          </span>
          <MoneyCell sen={dto.roots.gross?.sen ?? null} />
        </div>
      </div>
    );
  }
  return (
    <div>
      <div
        style={{
          padding: "0.375rem 2rem",
          fontSize: "0.75rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          background: "var(--doc-section-earning-fill)",
          color: "var(--doc-section-earning-ink)",
        }}
      >
        {HEADING[lang]}
      </div>
      {earnings.map((item) => (
        <div
          key={item.codeSnap}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "0.375rem 2rem",
            borderBottom: "1px solid var(--doc-rule-hairline)",
          }}
        >
          <span style={{ color: "var(--doc-ink)", fontSize: "0.875rem" }}>
            {String(lang === "en" ? item.nameEnSnap : item.nameMsSnap)}
          </span>
          <MoneyCell sen={item.resolvedAmountSen} />
        </div>
      ))}
    </div>
  );
}

export { EarningsSection };
