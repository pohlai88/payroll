// Section 6 — net pay grand total + payment method
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./types";

interface NetPayConclusionProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const LABELS: Record<
  Lang,
  { heading: string; method: string; account: string }
> = {
  en: { heading: "NET PAY", method: "Payment Method", account: "Account" },
  ms: { heading: "GAJI BERSIH", method: "Kaedah Pembayaran", account: "Akaun" },
};

function NetPayConclusion({ dto, lang }: NetPayConclusionProps) {
  const L = LABELS[lang];
  return (
    <div
      style={{
        borderTop: "1pt solid var(--doc-rule-total)",
        padding: "1rem 2rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          borderBottom: "2pt solid var(--doc-rule-total)",
          paddingBottom: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: "1rem",
            color: "var(--doc-ink-heading)",
          }}
        >
          {L.heading}
        </span>
        <MoneyCell
          className="font-bold text-base"
          sen={dto.roots.net?.sen ?? null}
        />
      </div>
      {!!dto.payment.method && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.8125rem",
            color: "var(--doc-ink-secondary)",
          }}
        >
          <span>{L.method}</span>
          <span>{dto.payment.method}</span>
        </div>
      )}
      {!!dto.payment.maskedBankAccount && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.8125rem",
            color: "var(--doc-ink-secondary)",
          }}
        >
          <span>{L.account}</span>
          <span>{dto.payment.maskedBankAccount}</span>
        </div>
      )}
    </div>
  );
}

export { NetPayConclusion };
