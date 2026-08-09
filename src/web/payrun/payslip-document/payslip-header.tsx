// Section 1 — document identity + legal employer
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./types";

interface PayslipHeaderProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const TITLE: Record<Lang, string> = { en: "PAYSLIP", ms: "PENYATA GAJI" };
const WARNING_LABEL: Record<Lang, string> = {
  en: "Employer identity sourced from current company record \u2014 not a payroll-time snapshot.",
  ms: "Identiti majikan diambil daripada rekod syarikat semasa \u2014 bukan rekod syarikat masa gaji diproses.",
};

function PayslipHeader({ dto, lang }: PayslipHeaderProps) {
  return (
    <div
      style={{
        background: "var(--doc-fill-header)",
        borderBottom: "1px solid var(--doc-rule-standard)",
        padding: "1.5rem 2rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--doc-ink-heading)",
              margin: 0,
            }}
          >
            {TITLE[lang]}
          </h1>
          <div
            style={{
              marginTop: "0.5rem",
              color: "var(--doc-ink-heading)",
              fontWeight: 600,
            }}
          >
            {dto.legalEmployer.name}
          </div>
          {!!dto.legalEmployer.registrationNumber && (
            <div
              style={{
                color: "var(--doc-ink-secondary)",
                fontSize: "0.875rem",
              }}
            >
              {dto.legalEmployer.registrationNumber}
            </div>
          )}
          {!!dto.legalEmployer.epfReference && (
            <div
              style={{
                color: "var(--doc-ink-secondary)",
                fontSize: "0.875rem",
              }}
            >
              EPF: {dto.legalEmployer.epfReference}
            </div>
          )}
        </div>
        <div
          style={{
            textAlign: "right",
            color: "var(--doc-ink-secondary)",
            fontSize: "0.8125rem",
          }}
        >
          <div>{dto.payPeriod.reportingMonth}</div>
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
            {lang === "en" ? "Document" : "Dokumen"}: {dto.documentId}
          </div>
          {!!dto.payment.statementDate && (
            <div style={{ fontSize: "0.75rem" }}>
              {lang === "en" ? "Issued" : "Tarikh"}:{" "}
              {dto.payment.statementDate.slice(0, 10)}
            </div>
          )}
        </div>
      </div>
      {dto.employerSourceWarning === "LIVE_COMPANY_RECORD" && (
        <div
          style={{
            marginTop: "0.5rem",
            padding: "0.375rem 0.75rem",
            background: "var(--doc-fill-subtotal)",
            border: "1px solid var(--doc-rule-standard)",
            borderRadius: "0.25rem",
            fontSize: "0.75rem",
            color: "var(--doc-ink-secondary)",
          }}
        >
          {WARNING_LABEL[lang]}
        </div>
      )}
    </div>
  );
}

export { PayslipHeader };
