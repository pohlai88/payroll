/**
 * Employees — searchable roster (`GET /v1/employees`, scoped by
 * `ScopeContext`) with the create-only import panel underneath. See
 * `docs/superpowers/specs/2026-08-08-phase5b-payroll-ui-shell-workspace-design.md`.
 */

import { SearchIcon, UsersIcon } from "lucide-react";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatApiError } from "@/web/api/format-error";
import { payrollApi } from "@/web/api/payroll-api";
import type { EmployeeSummary } from "@/web/api/types";
import { useAuthContext } from "@/web/context/auth-context";
import { useScopeContext } from "@/web/context/scope-context";
import { EmployeeImportPanel } from "@/web/employee-import-panel";
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

  // The API only accepts a single `companyId`; when the scope names several
  // companies we fetch everything and filter client-side below (same
  // approach as `PayRunListPage`).
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

  // `reloadToken` is intentionally unused inside the effect — bumping it
  // is how `onImportInfo` forces a refetch after a successful import.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadToken is a refetch trigger, not a read dependency
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
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Directory</CardTitle>
        </CardHeader>
        <CardContent>
          {error !== null && (
            <p className="mb-3 text-destructive text-sm">{error}</p>
          )}
          {!loading && visibleEmployees.length === 0 ? (
            <EmptyState
              description="No employees found for the current scope. Import employees below to get started."
              icon={<UsersIcon />}
              title="No employees"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  {showCompanyColumn && <TableHead>Company</TableHead>}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleEmployees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {employee.code}
                    </TableCell>
                    <TableCell className="font-medium">
                      {employee.name}
                    </TableCell>
                    {showCompanyColumn && (
                      <TableCell className="text-muted-foreground text-sm">
                        {companyNameById.get(employee.companyId) ??
                          employee.companyId}
                      </TableCell>
                    )}
                    <TableCell>
                      {employee.status === "ACTIVE" ? (
                        <Badge variant="secondary">ACTIVE</Badge>
                      ) : (
                        <Badge
                          className="text-muted-foreground"
                          variant="outline"
                        >
                          TERMINATED
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
