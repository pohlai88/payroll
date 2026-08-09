// Shared type — mirrors PayslipDocumentDto from the server route.
// Keep in sync with src/server/routes/pay-run-payslip.ts.
export interface PayslipDocumentDto {
  documentId: string;
  generatedAt: string;
  documentStatus: "APPROVED" | "CLOSED" | "DRAFT_PREVIEW";
  employerSourceWarning: "LIVE_COMPANY_RECORD" | null;
  legalEmployer: {
    name: string;
    registrationNumber: string | null;
    epfReference: string | null;
    socsoReference: string | null;
    eisReference: string | null;
    lhdnReference: string | null;
    representativeName: string | null;
  };
  employee: {
    id: string;
    name: string;
    code: string;
    designation: string | null;
    department: string | null;
    maskedNric: string | null;
    gender: string | null;
    citizenship: string | null;
    epfNumber: string | null;
    socsoNumber: string | null;
    payBasis: string | null;
  };
  payPeriod: {
    reportingMonth: string;
    periodStart: string;
    periodEnd: string;
    paymentDate: string | null;
    runId: string;
    label: string;
    workingDays: number;
  };
  payment: {
    method: string | null;
    maskedBankAccount: string | null;
    statementDate: string | null;
  };
  lineItems: Array<{
    kind: string;
    codeSnap: string;
    nameEnSnap: string;
    nameMsSnap: string;
    resolvedAmountSen: number;
    quantity: string | null;
    rateSen: number | null;
  }>;
  roots: Record<string, { sen: number | null; notApplicable: boolean }>;
  statutoryWageBases: {
    epfWagesSen: number | null;
    socsoWagesSen: number | null;
    eisWagesSen: number | null;
  };
  ytd: {
    grossSen: number;
    netSen: number;
    epfEeSen: number;
    epfErSen: number;
    socsoEeCoreSen: number;
    eisEeSen: number;
    pcbNetSen: number;
    cp38Sen: number;
    isProvisional: boolean;
  } | null;
  approval: {
    reviewedBy: string | null;
    reviewedAt: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    closedBy: string | null;
    closedAt: string | null;
  };
  auditIdentity: {
    runId: string;
    calcRevision: string | null;
    rulePackId: string;
    rulePackHash: string | null;
    calcEngineVersion: string | null;
  };
}

export interface PayslipIndexRow {
  lineId: string;
  employeeCode: string;
  employeeName: string;
  netSen: number | null;
}
