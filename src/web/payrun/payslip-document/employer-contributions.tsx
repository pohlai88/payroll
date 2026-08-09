/**
 * @feature payslip
 * @layer ui
 * @hub src/server/routes/pay-run-payslip.ts
 *
 * Payslip document section.
 */

// Section 5C — employer contributions (labelled as not-from-salary)
import type { Lang } from "@/domain/derive/i18n/render";
import { DocRow } from "./doc-row";
import type { PayslipDocumentDto } from "./types";

interface EmployerContributionsProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const HEADING: Record<Lang, string> = {
  en: "EMPLOYER CONTRIBUTIONS",
  ms: "SUMBANGAN MAJIKAN",
};
const NOTE: Record<Lang, string> = {
  en: "Employer-paid contributions \u2014 not deducted from your salary.",
  ms: "Sumbangan majikan \u2014 tidak ditolak daripada gaji anda.",
};
const ROWS: Array<{ keyEn: string; keyMs: string; root: string }> = [
  { keyEn: "EPF Employer [S1]", keyMs: "KWSP Majikan [S1]", root: "epfEr" },
  {
    keyEn: "SOCSO Employer [S2]",
    keyMs: "PERKESO Majikan [S2]",
    root: "socsoEr",
  },
  { keyEn: "EIS Employer [S3]", keyMs: "EIS Majikan [S3]", root: "eisEr" },
];

function EmployerContributions({ dto, lang }: EmployerContributionsProps) {
  return (
    <div style={{ background: "var(--doc-fill-subtotal)" }}>
      <div
        style={{
          padding: "0.375rem 2rem 0",
          fontSize: "0.75rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--doc-ink-secondary)",
        }}
      >
        {HEADING[lang]}
      </div>
      <p
        style={{
          padding: "0.25rem 2rem 0",
          fontSize: "0.75rem",
          color: "var(--doc-ink-secondary)",
        }}
      >
        {NOTE[lang]}
      </p>
      {ROWS.map(({ keyEn, keyMs, root }) => {
        const rootValue = dto.roots[root];
        if (rootValue?.notApplicable) {
          return null;
        }
        return (
          <DocRow
            key={root}
            label={String(lang === "en" ? keyEn : keyMs)}
            sen={rootValue?.sen ?? null}
          />
        );
      })}
    </div>
  );
}

export { EmployerContributions };
