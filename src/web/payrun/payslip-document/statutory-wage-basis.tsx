// Section 3 — EPF/SOCSO/EIS statutory wage bases
import { MoneyCell } from "@/components/payroll/money-cell";
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./types";

interface StatutoryWageBasisProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const LABELS: Record<
  Lang,
  { heading: string; note: string; epf: string; socso: string; eis: string }
> = {
  en: {
    heading: "STATUTORY WAGE BASES",
    note: "Statutory contribution wage may differ from gross pay according to the applicable statutory treatment.",
    epf: "EPF Wage",
    socso: "SOCSO Wage",
    eis: "EIS Wage",
  },
  ms: {
    heading: "GAJI BERKANUN",
    note: "Gaji caruman berkanun mungkin berbeza daripada gaji kasar mengikut rawatan berkanun yang terpakai.",
    epf: "Gaji KWSP",
    socso: "Gaji PERKESO",
    eis: "Gaji EIS",
  },
};

function StatutoryWageBasis({ dto, lang }: StatutoryWageBasisProps) {
  const { epfWagesSen, socsoWagesSen, eisWagesSen } = dto.statutoryWageBases;
  const L = LABELS[lang];
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
          color: "var(--doc-ink-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "0.5rem",
        }}
      >
        {L.heading}
      </div>
      {(
        [
          [L.epf, epfWagesSen],
          [L.socso, socsoWagesSen],
          [L.eis, eisWagesSen],
        ] as [string, number | null][]
      ).map(([label, sen]) => (
        <div
          key={label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "0.2rem 0",
            fontSize: "0.8125rem",
          }}
        >
          <span style={{ color: "var(--doc-ink-secondary)" }}>{label}</span>
          <MoneyCell sen={sen} />
        </div>
      ))}
      <p
        style={{
          fontSize: "0.75rem",
          color: "var(--doc-ink-secondary)",
          marginTop: "0.5rem",
        }}
      >
        {L.note}
      </p>
    </div>
  );
}

export { StatutoryWageBasis };
