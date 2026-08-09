// Page 2 — calculation & audit annex
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./types";

interface AuditAnnexProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const HEADING: Record<Lang, string> = {
  en: "CALCULATION & AUDIT ANNEX",
  ms: "LAMPIRAN AUDIT",
};

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) {
    return null;
  }
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0.25rem 0",
        borderBottom: "1px solid var(--doc-rule-hairline)",
        fontSize: "0.8125rem",
      }}
    >
      <span style={{ color: "var(--doc-ink-secondary)" }}>{label}</span>
      <span style={{ color: "var(--doc-ink)", fontFamily: "monospace" }}>
        {value}
      </span>
    </div>
  );
}

function AuditAnnex({ dto, lang }: AuditAnnexProps) {
  const { auditIdentity: audit, approval } = dto;
  return (
    <div
      data-print-keep
      style={{
        marginTop: "2rem",
        padding: "1.5rem 2rem",
        borderTop: "2px solid var(--doc-rule-total)",
        background: "var(--doc-fill-header)",
      }}
    >
      <h2
        style={{
          fontSize: "0.875rem",
          fontWeight: 700,
          color: "var(--doc-ink-heading)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "1rem",
        }}
      >
        {HEADING[lang]}
      </h2>
      <Field label="Document ID" value={dto.documentId} />
      <Field label="Payroll Run ID" value={audit.runId} />
      <Field label="Calc Revision" value={audit.calcRevision} />
      <Field label="Rule Pack" value={audit.rulePackId} />
      <Field label="Rule Pack Hash" value={audit.rulePackHash} />
      <Field label="Engine Version" value={audit.calcEngineVersion} />
      <Field label="Generated" value={dto.generatedAt} />
      <div style={{ marginTop: "1rem" }} />
      <Field label="Reviewed By" value={approval.reviewedBy} />
      <Field label="Reviewed At" value={approval.reviewedAt?.slice(0, 19)} />
      <Field label="Approved By" value={approval.approvedBy} />
      <Field label="Approved At" value={approval.approvedAt?.slice(0, 19)} />
      <Field label="Closed By" value={approval.closedBy} />
      <Field label="Closed At" value={approval.closedAt?.slice(0, 19)} />
      {!!dto.payment.statementDate && (
        <Field
          label={lang === "en" ? "Statement Date" : "Tarikh Penyata"}
          value={dto.payment.statementDate.slice(0, 10)}
        />
      )}
    </div>
  );
}

export { AuditAnnex };
