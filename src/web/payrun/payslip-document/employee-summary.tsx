// Section 2 — employee & payment summary
import type { Lang } from "@/domain/derive/i18n/render";
import type { PayslipDocumentDto } from "./types";

interface EmployeeSummaryProps {
  readonly dto: PayslipDocumentDto;
  readonly lang: Lang;
}

const LABELS: Record<string, Record<Lang, string>> = {
  employee: { en: "EMPLOYEE", ms: "PEKERJA" },
  id: { en: "Employee ID", ms: "No. Pekerja" },
  designation: { en: "Designation", ms: "Jawatan" },
  department: { en: "Department", ms: "Jabatan" },
  nric: { en: "NRIC/Passport", ms: "KP/Pasport" },
  epfNo: { en: "EPF No.", ms: "No. KWSP" },
  socsoNo: { en: "SOCSO No.", ms: "No. PERKESO" },
  gender: { en: "Gender", ms: "Jantina" },
  citizenship: { en: "Citizenship", ms: "Kewarganegaraan" },
  payBasis: { en: "Pay Basis", ms: "Asas Gaji" },
  payPeriod: { en: "Pay Period", ms: "Tempoh Gaji" },
  workingDays: { en: "Working Days", ms: "Hari Bekerja" },
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
      }}
    >
      <span
        style={{ color: "var(--doc-ink-secondary)", fontSize: "0.8125rem" }}
      >
        {label}
      </span>
      <span style={{ color: "var(--doc-ink)", fontSize: "0.8125rem" }}>
        {value}
      </span>
    </div>
  );
}

function EmployeeSummary({ dto, lang }: EmployeeSummaryProps) {
  const { employee: emp, payPeriod } = dto;
  return (
    <div style={{ padding: "1rem 2rem" }}>
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
        {LABELS.employee[lang]}
      </div>
      <div
        style={{
          fontWeight: 600,
          color: "var(--doc-ink-heading)",
          marginBottom: "0.5rem",
        }}
      >
        {emp.name}
      </div>
      <Field label={LABELS.id[lang]} value={emp.code} />
      <Field label={LABELS.designation[lang]} value={emp.designation} />
      <Field label={LABELS.department[lang]} value={emp.department} />
      <Field label={LABELS.nric[lang]} value={emp.maskedNric} />
      <Field label={LABELS.epfNo[lang]} value={emp.epfNumber} />
      <Field label={LABELS.socsoNo[lang]} value={emp.socsoNumber} />
      <Field label={LABELS.gender[lang]} value={emp.gender} />
      <Field label={LABELS.citizenship[lang]} value={emp.citizenship} />
      <Field label={LABELS.payBasis[lang]} value={emp.payBasis} />
      <Field
        label={LABELS.payPeriod[lang]}
        value={`${payPeriod.periodStart} \u2013 ${payPeriod.periodEnd}`}
      />
      <Field
        label={LABELS.workingDays[lang]}
        value={String(payPeriod.workingDays)}
      />
    </div>
  );
}

export { EmployeeSummary };
