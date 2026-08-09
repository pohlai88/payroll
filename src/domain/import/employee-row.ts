/**
 * @feature employee-import
 * @layer domain
 *
 * Pure mapping/validation from a raw spreadsheet row (string-keyed,
 * string-valued) to a typed row ready for `repo/employee-profile.ts`.
 *
 * No database access and no I/O — this is what `tests/domain/employee-row.test.ts`
 * exercises without Postgres, and what both the template generator and the
 * import script share so the two can never drift out of sync.
 */

import { isIsoDate } from "@/domain/date";
import { parseRM } from "@/domain/money";

export type PayBasisValue = "MONTHLY" | "DAILY" | "HOURLY";

export interface EmployeeProfileFields {
  jobTitle: string | null;
  department: string | null;
  superiorName: string | null;
  gender: string | null;
  race: string | null;
  religion: string | null;
  maritalStatus: string | null;
  email: string | null;
  mobileNo: string | null;
  phoneNo: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  paymentMethod: string | null;
  finalCompanyCode: string | null;
  masterPrimaryCompanyCode: string | null;
  payrollNotes: string | null;
  importSourceNotes: string | null;
}

export interface ParsedEmployeeRow {
  employeeCode: string;
  payrollCompanyCode: string;
  personIc: string | null;
  personName: string;
  personPassport: string | null;
  personDob: string | null;
  personNationality: string | null;
  joinDate: string;
  payBasis: PayBasisValue;
  baseRateSen: number;
  isMalaysian: boolean;
  isPermanentResident: boolean;
  epfApplicable: boolean;
  socsoApplicable: boolean;
  eisApplicable: boolean;
  pcbApplicable: boolean;
  epfNo: string | null;
  socsoNo: string | null;
  tin: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  profile: EmployeeProfileFields;
  extraAttributes: Record<string, string | number | boolean>;
}

export interface CustomFieldDef {
  fieldKey: string;
  label: string;
  dataType: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN";
  required: boolean;
}

export interface RowError {
  field: string;
  reason: string;
}

/** Header order fixes the template's column order; `required` drives validation. */
export const FIXED_HEADERS: ReadonlyArray<{
  header: string;
  key: string;
  required: boolean;
}> = [
  { header: "Employee Code", key: "employeeCode", required: true },
  { header: "Payroll Company Code", key: "payrollCompanyCode", required: true },
  { header: "Person IC", key: "personIc", required: false },
  { header: "Person Name", key: "personName", required: true },
  { header: "Person Passport", key: "personPassport", required: false },
  { header: "Person DOB", key: "personDob", required: false },
  { header: "Person Nationality", key: "personNationality", required: false },
  { header: "Join Date", key: "joinDate", required: true },
  { header: "Pay Basis", key: "payBasis", required: true },
  { header: "Base Rate RM", key: "baseRateRm", required: true },
  { header: "Is Malaysian", key: "isMalaysian", required: false },
  {
    header: "Is Permanent Resident",
    key: "isPermanentResident",
    required: false,
  },
  { header: "EPF Applicable", key: "epfApplicable", required: false },
  { header: "SOCSO Applicable", key: "socsoApplicable", required: false },
  { header: "EIS Applicable", key: "eisApplicable", required: false },
  { header: "PCB Applicable", key: "pcbApplicable", required: false },
  { header: "EPF No", key: "epfNo", required: false },
  { header: "SOCSO No", key: "socsoNo", required: false },
  { header: "TIN", key: "tin", required: false },
  { header: "Bank Name", key: "bankName", required: false },
  { header: "Bank Account No", key: "bankAccountNo", required: false },
  { header: "Job Title", key: "jobTitle", required: false },
  { header: "Department", key: "department", required: false },
  { header: "Superior Name", key: "superiorName", required: false },
  { header: "Gender", key: "gender", required: false },
  { header: "Race", key: "race", required: false },
  { header: "Religion", key: "religion", required: false },
  { header: "Marital Status", key: "maritalStatus", required: false },
  { header: "Email", key: "email", required: false },
  { header: "Mobile No", key: "mobileNo", required: false },
  { header: "Phone No", key: "phoneNo", required: false },
  { header: "Address Line", key: "addressLine", required: false },
  { header: "City", key: "city", required: false },
  { header: "State", key: "state", required: false },
  { header: "Postal Code", key: "postalCode", required: false },
  { header: "Country", key: "country", required: false },
  { header: "Payment Method", key: "paymentMethod", required: false },
  { header: "Final Company Code", key: "finalCompanyCode", required: false },
  {
    header: "Master Primary Company Code",
    key: "masterPrimaryCompanyCode",
    required: false,
  },
  { header: "Payroll Notes", key: "payrollNotes", required: false },
  { header: "Import Source Notes", key: "importSourceNotes", required: false },
];

const PAY_BASIS_VALUES = new Set(["MONTHLY", "DAILY", "HOURLY"]);

function blankToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function parseYesNo(value: string | undefined, fallback: boolean): boolean {
  const v = (value ?? "").trim().toUpperCase();
  if (v === "") {
    return fallback;
  }
  if (v === "YES" || v === "Y" || v === "TRUE") {
    return true;
  }
  if (v === "NO" || v === "N" || v === "FALSE") {
    return false;
  }
  throw new Error(`expected Yes/No, got ${JSON.stringify(value)}`);
}

function parseCustomValue(
  raw: string,
  dataType: CustomFieldDef["dataType"]
): string | number | boolean {
  if (dataType === "TEXT") {
    return raw;
  }
  if (dataType === "NUMBER") {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw new Error(`expected a number, got ${JSON.stringify(raw)}`);
    }
    return n;
  }
  if (dataType === "DATE") {
    if (!isIsoDate(raw)) {
      throw new Error(
        `expected a real calendar date YYYY-MM-DD, got ${JSON.stringify(raw)}`
      );
    }
    return raw;
  }
  // BOOLEAN
  return parseYesNo(raw, false);
}

const BOOLEAN_FIELDS: ReadonlyArray<readonly [string, boolean]> = [
  ["Is Malaysian", true],
  ["Is Permanent Resident", false],
  ["EPF Applicable", true],
  ["SOCSO Applicable", true],
  ["EIS Applicable", true],
  ["PCB Applicable", true],
];

/**
 * Parses one raw row. Never throws: every failure is collected into the
 * returned error list, so the caller can report every problem on a row in
 * one pass rather than stopping at the first.
 */
export function parseEmployeeRow(
  raw: Record<string, string | undefined>,
  customFieldDefs: readonly CustomFieldDef[]
): { row: ParsedEmployeeRow } | { errors: RowError[] } {
  const errors: RowError[] = [];
  const get = (header: string): string | undefined => raw[header];

  for (const h of FIXED_HEADERS) {
    if (h.required && blankToNull(get(h.header)) === null) {
      errors.push({ field: h.header, reason: "required field is blank" });
    }
  }

  let payBasis: PayBasisValue = "MONTHLY";
  const payBasisRaw = (get("Pay Basis") ?? "").trim().toUpperCase();
  if (payBasisRaw !== "") {
    if (PAY_BASIS_VALUES.has(payBasisRaw)) {
      payBasis = payBasisRaw as PayBasisValue;
    } else {
      errors.push({
        field: "Pay Basis",
        reason: `must be one of MONTHLY, DAILY, HOURLY; got ${JSON.stringify(payBasisRaw)}`,
      });
    }
  }

  const joinDateRaw = (get("Join Date") ?? "").trim();
  if (joinDateRaw !== "" && !isIsoDate(joinDateRaw)) {
    errors.push({
      field: "Join Date",
      reason: `must be a real calendar date YYYY-MM-DD, got ${JSON.stringify(joinDateRaw)}`,
    });
  }

  const personDobRaw = blankToNull(get("Person DOB"));
  if (personDobRaw !== null && !isIsoDate(personDobRaw)) {
    errors.push({
      field: "Person DOB",
      reason: `must be a real calendar date YYYY-MM-DD, got ${JSON.stringify(personDobRaw)}`,
    });
  }

  if (
    personDobRaw !== null &&
    isIsoDate(personDobRaw) &&
    joinDateRaw !== "" &&
    isIsoDate(joinDateRaw) &&
    personDobRaw > joinDateRaw
  ) {
    errors.push({
      field: "Person DOB",
      reason: "must be on or before Join Date",
    });
  }

  const baseRateRaw = get("Base Rate RM") ?? "";
  const baseRateTrimmed = baseRateRaw.trim();
  let baseRateSen: number | null = null;
  if (baseRateTrimmed !== "") {
    baseRateSen = parseRM(baseRateTrimmed);
    if (baseRateSen === null) {
      errors.push({
        field: "Base Rate RM",
        reason: `not a valid RM amount: ${JSON.stringify(baseRateRaw)}`,
      });
    } else if (baseRateSen < 0) {
      errors.push({
        field: "Base Rate RM",
        reason: "base rate must be non-negative",
      });
    }
  }

  const booleans: Record<string, boolean> = {};
  for (const [header, fallback] of BOOLEAN_FIELDS) {
    try {
      booleans[header] = parseYesNo(get(header), fallback);
    } catch (cause) {
      errors.push({ field: header, reason: (cause as Error).message });
    }
  }

  const knownHeaders = new Set(FIXED_HEADERS.map((h) => h.header));
  const extraAttributes: Record<string, string | number | boolean> = {};
  const customLabels = new Set(customFieldDefs.map((d) => d.label));
  for (const def of customFieldDefs) {
    const value = blankToNull(get(def.label));
    if (value === null) {
      if (def.required) {
        errors.push({
          field: def.label,
          reason: "required custom field is blank",
        });
      }
      continue;
    }
    try {
      extraAttributes[def.fieldKey] = parseCustomValue(value, def.dataType);
    } catch (cause) {
      errors.push({ field: def.label, reason: (cause as Error).message });
    }
  }

  for (const header of Object.keys(raw)) {
    if (!(knownHeaders.has(header) || customLabels.has(header))) {
      errors.push({ field: header, reason: "unrecognized column" });
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  const isMalaysian = booleans["Is Malaysian"] ?? true;
  const isPermanentResident = booleans["Is Permanent Resident"] ?? false;
  const epfApplicable = booleans["EPF Applicable"] ?? true;
  const socsoApplicable = booleans["SOCSO Applicable"] ?? true;
  const eisApplicable = booleans["EIS Applicable"] ?? true;
  const pcbApplicable = booleans["PCB Applicable"] ?? true;

  return {
    row: {
      employeeCode: (get("Employee Code") ?? "").trim(),
      payrollCompanyCode: (get("Payroll Company Code") ?? "").trim(),
      personIc: blankToNull(get("Person IC")),
      personName: (get("Person Name") ?? "").trim(),
      personPassport: blankToNull(get("Person Passport")),
      personDob: personDobRaw,
      personNationality: blankToNull(get("Person Nationality")),
      joinDate: joinDateRaw,
      payBasis,
      baseRateSen: baseRateSen as number,
      isMalaysian,
      isPermanentResident,
      epfApplicable,
      socsoApplicable,
      eisApplicable,
      pcbApplicable,
      epfNo: blankToNull(get("EPF No")),
      socsoNo: blankToNull(get("SOCSO No")),
      tin: blankToNull(get("TIN")),
      bankName: blankToNull(get("Bank Name")),
      bankAccountNo: blankToNull(get("Bank Account No")),
      profile: {
        jobTitle: blankToNull(get("Job Title")),
        department: blankToNull(get("Department")),
        superiorName: blankToNull(get("Superior Name")),
        gender: blankToNull(get("Gender")),
        race: blankToNull(get("Race")),
        religion: blankToNull(get("Religion")),
        maritalStatus: blankToNull(get("Marital Status")),
        email: blankToNull(get("Email")),
        mobileNo: blankToNull(get("Mobile No")),
        phoneNo: blankToNull(get("Phone No")),
        addressLine: blankToNull(get("Address Line")),
        city: blankToNull(get("City")),
        state: blankToNull(get("State")),
        postalCode: blankToNull(get("Postal Code")),
        country: blankToNull(get("Country")),
        paymentMethod: blankToNull(get("Payment Method")),
        finalCompanyCode: blankToNull(get("Final Company Code")),
        masterPrimaryCompanyCode: blankToNull(
          get("Master Primary Company Code")
        ),
        payrollNotes: blankToNull(get("Payroll Notes")),
        importSourceNotes: blankToNull(get("Import Source Notes")),
      },
      extraAttributes,
    },
  };
}
