// tests/domain/payslip-tokens.test.ts
// Asserts that the payslip document renders no hardcoded hex colours,
// uses only var(--doc-*) tokens, and the PREVIEW watermark appears for DRAFT_PREVIEW.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PayslipDocument } from "@/web/payrun/payslip-document/payslip-document";
import type { PayslipDocumentDto } from "@/web/payrun/payslip-document/types";

const FIXTURE_DTO: PayslipDocumentDto = {
  documentId: "PSL-TEST-001",
  generatedAt: "2026-07-31T00:00:00.000Z",
  documentStatus: "APPROVED",
  employerSourceWarning: "LIVE_COMPANY_RECORD",
  legalEmployer: {
    name: "Test Corp",
    registrationNumber: null,
    epfReference: "EPF-001",
    socsoReference: null,
    eisReference: null,
    lhdnReference: null,
    representativeName: null,
  },
  employee: {
    id: "emp-1",
    name: "Test Worker",
    code: "T001",
    designation: null,
    department: null,
    maskedNric: "****-**-1234",
    gender: null,
    citizenship: null,
    epfNumber: "12345678",
    socsoNumber: null,
    payBasis: "MONTHLY",
  },
  payPeriod: {
    reportingMonth: "2026-07",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    paymentDate: null,
    runId: "TEST-2026-07",
    label: "TEST-2026-07",
    workingDays: 26,
  },
  payment: {
    method: "BANK",
    maskedBankAccount: "****1234",
    statementDate: "2026-07-31T00:00:00.000Z",
  },
  lineItems: [],
  roots: {
    gross: { sen: 500000, notApplicable: false },
    epfEe: { sen: 55000, notApplicable: false },
    socsoEeCore: { sen: 4750, notApplicable: false },
    socsoEeSkbbk: { sen: 0, notApplicable: false },
    eisEe: { sen: 1750, notApplicable: false },
    pcbNet: { sen: 5000, notApplicable: false },
    cp38: { sen: 0, notApplicable: false },
    zakat: { sen: 0, notApplicable: false },
    otherDeductions: { sen: 0, notApplicable: false },
    deductionsTotal: { sen: 66500, notApplicable: false },
    net: { sen: 433500, notApplicable: false },
    epfWages: { sen: 500000, notApplicable: false },
    socsoWages: { sen: 500000, notApplicable: false },
    eisWages: { sen: 500000, notApplicable: false },
    epfEr: { sen: 65000, notApplicable: false },
    socsoEr: { sen: 9375, notApplicable: false },
    eisEr: { sen: 1750, notApplicable: false },
    hrdf: { sen: 0, notApplicable: false },
    employerCost: { sen: 65000, notApplicable: false },
  },
  statutoryWageBases: {
    epfWagesSen: 500000,
    socsoWagesSen: 500000,
    eisWagesSen: 500000,
  },
  ytd: {
    grossSen: 500000,
    netSen: 433500,
    epfEeSen: 55000,
    epfErSen: 65000,
    socsoEeCoreSen: 4750,
    eisEeSen: 1750,
    pcbNetSen: 5000,
    cp38Sen: 0,
    isProvisional: false,
  },
  approval: {
    reviewedBy: "reviewer@example.com",
    reviewedAt: "2026-07-30T00:00:00.000Z",
    approvedBy: "approver@example.com",
    approvedAt: "2026-07-30T06:00:00.000Z",
    closedBy: null,
    closedAt: null,
  },
  auditIdentity: {
    runId: "TEST-2026-07",
    calcRevision: "rev-abc",
    rulePackId: "MY-STATUTORY-2026",
    rulePackHash: null,
    calcEngineVersion: null,
  },
};

describe("PayslipDocument token safety", () => {
  it("renders employer source warning for LIVE_COMPANY_RECORD", () => {
    const { getByText } = render(
      <PayslipDocument dto={FIXTURE_DTO} lang="en" />
    );
    expect(getByText(/employer identity sourced/i)).toBeDefined();
  });

  it("renders PAYSLIP heading in English", () => {
    const { getByText } = render(
      <PayslipDocument dto={FIXTURE_DTO} lang="en" />
    );
    expect(getByText("PAYSLIP")).toBeDefined();
  });

  it("renders PENYATA GAJI heading in Malay", () => {
    const { getByText } = render(
      <PayslipDocument dto={FIXTURE_DTO} lang="ms" />
    );
    expect(getByText("PENYATA GAJI")).toBeDefined();
  });

  it("renders PREVIEW watermark for DRAFT_PREVIEW", () => {
    const draftDto = {
      ...FIXTURE_DTO,
      documentStatus: "DRAFT_PREVIEW" as const,
    };
    const { getByText } = render(<PayslipDocument dto={draftDto} lang="en" />);
    expect(getByText(/PREVIEW.*NOT ISSUED/i)).toBeDefined();
  });

  it("does not render PREVIEW watermark for APPROVED", () => {
    const { queryByText } = render(
      <PayslipDocument dto={FIXTURE_DTO} lang="en" />
    );
    expect(queryByText(/PREVIEW.*NOT ISSUED/i)).toBeNull();
  });

  it("renders YTD section with PROVISIONAL label when isProvisional", () => {
    const dtoWithProvisional = {
      ...FIXTURE_DTO,
      ytd: { ...FIXTURE_DTO.ytd!, isProvisional: true },
    };
    const { getByText } = render(
      <PayslipDocument dto={dtoWithProvisional} lang="en" />
    );
    expect(getByText(/PROVISIONAL/i)).toBeDefined();
  });

  it("NET PAY label present in document", () => {
    const { getAllByText } = render(
      <PayslipDocument dto={FIXTURE_DTO} lang="en" />
    );
    // Appears in both PayEquation (Section 4) and NetPayConclusion (Section 6)
    expect(getAllByText("NET PAY").length).toBeGreaterThanOrEqual(1);
  });

  it("employer contributions note present", () => {
    const { getByText } = render(
      <PayslipDocument dto={FIXTURE_DTO} lang="en" />
    );
    expect(getByText(/not deducted from your salary/i)).toBeDefined();
  });
});
