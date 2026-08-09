/**
 * Employees — searchable roster (`GET /v1/employees`, scoped by
 * `ScopeContext`) with the create-only import panel underneath.
 * Studio: datatable-employee + empty-state-01 + file-upload-01.
 */

import { SearchIcon, UsersIcon } from "lucide-react";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import EmployeeDatatable from "@/components/shadcn-studio/blocks/datatable-employee";
import EmptyState01 from "@/components/shadcn-studio/blocks/empty-state-01/empty-state-01";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatApiError } from "@/web/api/format-error";
import { payrollApi } from "@/web/api/payroll-api";
import type { EmployeeSummary } from "@/web/api/types";
import { useAuthContext } from "@/web/context/auth-context";
import { useScopeContext } from "@/web/context/scope-context";
import { EmployeeImportPanel } from "@/web/employees/employee-import-panel";
import { PageTitle } from "@/web/shell/page-title";

const IMPORT_COMPLETE_PREFIX = "Import finished:";

function EmployeesPage() {
  const { scope } = useScopeContext();
  const { me, signOut } = useAuthContext();
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const singleCompanyId =
    scope.mode === "selected" && scope.companyIds.length === 1
      ? scope.companyIds[0]
      : undefined;

  const companyNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const company of me?.companies ?? []) {
      map.set(company.id, company.name);
    }
    return map;
  }, [me]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadToken is a refetch trigger
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    payrollApi
      .getEmployees({ companyId: singleCompanyId, search: search || undefined })
      .then((result) => {
        if (!cancelled) {
          setEmployees(result);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(formatApiError(cause, "Failed to load employees"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [singleCompanyId, search, reloadToken]);

  const visibleEmployees =
    scope.mode === "all" || singleCompanyId !== undefined
      ? employees
      : employees.filter((employee) =>
          scope.companyIds.includes(employee.companyId)
        );

  const showCompanyColumn = scope.mode === "all";

  const onSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.currentTarget.value);
  }, []);

  const onSessionExpired = useCallback(() => {
    signOut();
  }, [signOut]);

  const onImportInfo = useCallback((message: string | null) => {
    setInfo(message);
    if (message?.startsWith(IMPORT_COMPLETE_PREFIX)) {
      setReloadToken((token) => token + 1);
    }
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        actions={
          <div className="relative w-64">
            <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-3.5 text-muted-foreground" />
            <Input
              className="pl-7"
              onChange={onSearchChange}
              placeholder="Search by name or code…"
              value={search}
            />
          </div>
        }
        description="Roster for the current company scope."
        title="Employees"
      />

      {error !== null && <p className="text-destructive text-sm">{error}</p>}

      {!loading && visibleEmployees.length === 0 ? (
        <EmptyState01
          className="max-w-none"
          description="Employee directory"
          emptyDetail="Import employees below to get started for this scope."
          emptyTitle="No employees found"
          icon={<UsersIcon className="mx-auto size-12 text-muted-foreground" />}
          title="0"
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <EmployeeDatatable
            companyNameById={companyNameById}
            data={visibleEmployees}
            loading={loading}
            showCompanyColumn={showCompanyColumn}
            title="Directory"
          />
        </Card>
      )}

      <Separator />

      {info !== null && <p className="text-muted-foreground text-sm">{info}</p>}

      <EmployeeImportPanel
        busy={busy}
        companyId={singleCompanyId ?? ""}
        onError={setError}
        onInfo={onImportInfo}
        onSessionExpired={onSessionExpired}
        setBusy={setBusy}
      />
    </div>
  );
}

export { EmployeesPage };
