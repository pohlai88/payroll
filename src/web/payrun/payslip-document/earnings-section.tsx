/**
 * @feature payslip
 * @layer ui
 * @hub src/server/routes/pay-run-payslip.ts
 *
 * Payslip document section.
 */

// Section 5A — Earning line items from payLineItems
import type { Lang } from "@/domain/derive/i18n/render";
import { DocRow } from "./doc-row";
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
        <DocRow
          label={lang === "en" ? "Gross Pay" : "Gaji Kasar"}
          sen={dto.roots.gross?.sen ?? null}
        />
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
        <DocRow
          key={item.codeSnap}
          label={String(lang === "en" ? item.nameEnSnap : item.nameMsSnap)}
          sen={item.resolvedAmountSen}
        />
      ))}
    </div>
  );
}

export { EarningsSection };
