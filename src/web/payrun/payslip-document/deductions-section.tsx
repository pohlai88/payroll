// Section 5B — statutory + other employee deductions
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./types";

interface DeductionsSectionProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const HEADING: Record<Lang, string> = {
  en: "EMPLOYEE DEDUCTIONS",
  ms: "POTONGAN",
};
const ROWS: Array<{ keyEn: string; keyMs: string; root: string }> = [
  { keyEn: "EPF Employee [S1]", keyMs: "KWSP Pekerja [S1]", root: "epfEe" },
  {
    keyEn: "SOCSO Employee [S2]",
    keyMs: "PERKESO Pekerja [S2]",
    root: "socsoEeCore",
  },
  { keyEn: "SKBBK [S2]", keyMs: "SKBBK [S2]", root: "socsoEeSkbbk" },
  { keyEn: "EIS Employee [S3]", keyMs: "EIS Pekerja [S3]", root: "eisEe" },
  { keyEn: "PCB / MTD [S4]", keyMs: "PCB / MTD [S4]", root: "pcbNet" },
  { keyEn: "CP38 [S4]", keyMs: "CP38 [S4]", root: "cp38" },
  { keyEn: "Zakat", keyMs: "Zakat", root: "zakat" },
  {
    keyEn: "Other Deductions",
    keyMs: "Potongan Lain",
    root: "otherDeductions",
  },
];

function DeductionsSection({ dto, lang }: DeductionsSectionProps) {
  return (
    <div>
      <div
        style={{
          padding: "0.375rem 2rem",
          fontSize: "0.75rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          background: "var(--doc-section-deduction-fill)",
          color: "var(--doc-section-deduction-ink)",
        }}
      >
        {HEADING[lang]}
      </div>
      {ROWS.map(({ keyEn, keyMs, root }) => {
        const rootValue = dto.roots[root];
        if (rootValue?.notApplicable) {
          return null;
        }
        return (
          <div
            key={root}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "0.375rem 2rem",
              borderBottom: "1px solid var(--doc-rule-hairline)",
            }}
          >
            <span style={{ color: "var(--doc-ink)", fontSize: "0.875rem" }}>
              {String(lang === "en" ? keyEn : keyMs)}
            </span>
            <MoneyCell sen={rootValue?.sen ?? null} />
          </div>
        );
      })}
    </div>
  );
}

export { DeductionsSection };
