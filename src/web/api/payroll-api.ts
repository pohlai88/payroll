/**
 * Production API client — real VITE_API_BASE, no mock bypass.
 */

import { acquireAccessToken } from "@/web/auth/client";
import { createApiClient } from "./client";

function requireApiBase(): string {
  const base = import.meta.env.VITE_API_BASE;
  if (typeof base !== "string" || base.trim() === "") {
    throw new Error("VITE_API_BASE is not set");
  }
  return base.trim();
}

type PayrollApi = ReturnType<typeof createApiClient>;

let payrollApiSingleton: PayrollApi | null = null;

export function getPayrollApi(): PayrollApi {
  if (payrollApiSingleton === null) {
    payrollApiSingleton = createApiClient({
      apiBase: requireApiBase(),
      acquireToken: acquireAccessToken,
    });
  }
  return payrollApiSingleton;
}

/** Convenience alias for shell code — same lazy singleton. */
export const payrollApi = {
  getMe: () => getPayrollApi().getMe(),
  getPermissions: (companyId?: string | null) =>
    getPayrollApi().getPermissions(companyId),
  getAdminUsers: () => getPayrollApi().getAdminUsers(),
  downloadEmployeeImportTemplate: (companyId?: string | null) =>
    getPayrollApi().downloadEmployeeImportTemplate(companyId),
  importEmployees: (body: string, contentType: string) =>
    getPayrollApi().importEmployees(body, contentType),
};
