// YTD table — current employer scoped; PROVISIONAL label when isProvisional
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./types";

interface YtdSummaryProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const HEADING: Record<Lang, { final: string; provisional: string }> = {
  en: { final: "YEAR-TO-DATE", provisional: "YEAR-TO-DATE (PROVISIONAL)" },
  ms: { final: "TAHUN SEMASA", provisional: "TAHUN SEMASA (SEMENTARA)" },
};
const ROWS: Array<{
  keyEn: string;
  keyMs: string;
  field: keyof NonNullable<PayslipDocumentDto["ytd"]>;
}> = [
  { keyEn: "Gross Pay", keyMs: "Gaji Kasar", field: "grossSen" },
  { keyEn: "Net Pay", keyMs: "Gaji Bersih", field: "netSen" },
  { keyEn: "EPF Employee", keyMs: "KWSP Pekerja", field: "epfEeSen" },
  { keyEn: "EPF Employer", keyMs: "KWSP Majikan", field: "epfErSen" },
  {
    keyEn: "SOCSO Employee",
    keyMs: "PERKESO Pekerja",
    field: "socsoEeCoreSen",
  },
  { keyEn: "EIS Employee", keyMs: "EIS Pekerja", field: "eisEeSen" },
  { keyEn: "PCB / MTD", keyMs: "PCB / MTD", field: "pcbNetSen" },
  { keyEn: "CP38", keyMs: "CP38", field: "cp38Sen" },
];

function YtdSummary({ dto, lang }: YtdSummaryProps) {
  const { ytd } = dto;
  if (!ytd) {
    return null;
  }
  const H = HEADING[lang];
  const heading = ytd.isProvisional ? H.provisional : H.final;
  return (
    <div
      style={{
        padding: "0.75rem 2rem",
        background: "var(--doc-fill-subtotal)",
      }}
    >
      <div
        style={{
          fontSize: "0.75rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--doc-ink-secondary)",
          marginBottom: "0.5rem",
        }}
      >
        {heading}
      </div>
      <table
        style={{
          width: "100%",
          fontSize: "0.8125rem",
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                color: "var(--doc-ink-secondary)",
                fontWeight: 400,
                padding: "0.2rem 0",
                borderBottom: "1px solid var(--doc-rule-hairline)",
              }}
            >
              {lang === "en" ? "Item" : "Perkara"}
            </th>
            <th
              style={{
                textAlign: "right",
                color: "var(--doc-ink-secondary)",
                fontWeight: 400,
                padding: "0.2rem 0",
                borderBottom: "1px solid var(--doc-rule-hairline)",
              }}
            >
              {lang === "en" ? "Amount (RM)" : "Jumlah (RM)"}
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ keyEn, keyMs, field }) => (
            <tr key={field}>
              <td style={{ padding: "0.2rem 0", color: "var(--doc-ink)" }}>
                {String(lang === "en" ? keyEn : keyMs)}
              </td>
              <td style={{ textAlign: "right", padding: "0.2rem 0" }}>
                <MoneyCell sen={ytd[field] as number} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {ytd.incomplete ? (
        <p
          style={{
            marginTop: "0.5rem",
            fontSize: "0.7rem",
            color: "var(--doc-ink-secondary)",
          }}
        >
          {lang === "en"
            ? "Some YTD figures were unknown and omitted from totals — not treated as zero."
            : "Sesetengah angka YTD tidak diketahui dan dikecualikan daripada jumlah — tidak dianggap sifar."}
        </p>
      ) : null}
    </div>
  );
}

export { YtdSummary };
