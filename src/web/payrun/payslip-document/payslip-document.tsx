/**
 * AFENDA-PAYSLIP-01 — production bilingual payslip document.
 *
 * Rendering rules:
 * - --doc-* tokens only; no app theme tokens; no raw hex.
 * - Light-only: forced white background, black ink at all times.
 * - Nil sen = em dash via MoneyCell.
 * - No green net pay; no red deductions.
 * - window.print() is the PDF path — payslip-print.css handles the rest.
 */
import "./payslip-print.css";
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./types";
import { AuditAnnex } from "./audit-annex";
import { DeductionsSection } from "./deductions-section";
import { DocumentStatusMark } from "./document-status-mark";
import { EarningsSection } from "./earnings-section";
import { EmployeeSummary } from "./employee-summary";
import { EmployerContributions } from "./employer-contributions";
import { NetPayConclusion } from "./net-pay-conclusion";
import { PayEquation } from "./pay-equation";
import { PayslipHeader } from "./payslip-header";
import { StatutoryWageBasis } from "./statutory-wage-basis";
import { YtdSummary } from "./ytd-summary";

// Re-export the DTO type for consumers
export type { PayslipDocumentDto } from "./types";

interface PayslipDocumentProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

function PayslipDocument({ dto, lang }: PayslipDocumentProps) {
  return (
    <div
      style={{
        position: "relative",
        background: "white",
        color: "var(--doc-ink)",
        fontFamily: "Geist, system-ui, sans-serif",
        fontSize: "0.875rem",
        maxWidth: "210mm",
        margin: "0 auto",
        boxShadow: "0 2px 8px var(--doc-rule-hairline)",
      }}
    >
      <DocumentStatusMark documentStatus={dto.documentStatus} lang={lang} />
      <PayslipHeader dto={dto} lang={lang} />
      <EmployeeSummary dto={dto} lang={lang} />
      <StatutoryWageBasis dto={dto} lang={lang} />
      <PayEquation dto={dto} lang={lang} />
      <EarningsSection dto={dto} lang={lang} />
      <DeductionsSection dto={dto} lang={lang} />
      <EmployerContributions dto={dto} lang={lang} />
      <NetPayConclusion dto={dto} lang={lang} />
      <YtdSummary dto={dto} lang={lang} />
      <AuditAnnex dto={dto} lang={lang} />
    </div>
  );
}

export { PayslipDocument };
