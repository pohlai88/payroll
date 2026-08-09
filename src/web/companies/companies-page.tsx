/**
 * @feature companies
 * @layer ui
 * @hub src/server/routes/admin-companies.ts
 *
 * Companies — multicompany directory for SYSTEM_ADMIN.
 * Studio blocks: statistics-component-03, form-layout-01 (company-form),
 * empty-state-01, datatable-company.
 */

import {
  Building2Icon,
  PercentIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import CompanyDatatable from "@/components/shadcn-studio/blocks/datatable-company";
import EmptyState01 from "@/components/shadcn-studio/blocks/empty-state-01/empty-state-01";
import CompanyForm from "@/components/shadcn-studio/blocks/form-layout-01/company-form";
import StatisticsCard from "@/components/shadcn-studio/blocks/statistics-card-03";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatApiError } from "@/web/api/format-error";
import { payrollApi } from "@/web/api/payroll-api";
import type { AdminCompanyRow, CreateAdminCompanyBody } from "@/web/api/types";
import { useAuthContext } from "@/web/context/auth-context";
import { PageTitle } from "@/web/shell/page-title";

function CompaniesPage() {
  const { isSystemAdmin, loading: authLoading } = useAuthContext();
  const [companies, setCompanies] = useState<readonly AdminCompanyRow[] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCompanyRow | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const result = await payrollApi.getAdminCompanies();
    setCompanies(result.companies);
    setError(null);
  }, []);

  useEffect(() => {
    if (authLoading || !isSystemAdmin) {
      return;
    }
    let cancelled = false;
    reload().catch((cause: unknown) => {
      if (!cancelled) {
        setError(formatApiError(cause));
        setCompanies([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isSystemAdmin, reload]);

  const stats = useMemo(() => {
    const list = companies ?? [];
    const hrdfOn = list.filter((c) => c.hrdfEnabled).length;
    return {
      total: list.length,
      hrdfOn,
      hrdfOff: list.length - hrdfOn,
    };
  }, [companies]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (company: AdminCompanyRow) => {
    setEditing(company);
    setDialogOpen(true);
  };

  const onSubmit = async (values: CreateAdminCompanyBody) => {
    setBusy(true);
    setError(null);
    try {
      if (editing === null) {
        await payrollApi.createAdminCompany(values);
      } else {
        await payrollApi.updateAdminCompany(editing.id, {
          name: values.name,
          epfNo: values.epfNo,
          socsoNo: values.socsoNo,
          lhdnNo: values.lhdnNo,
          hrdfEnabled: values.hrdfEnabled,
          hrdfLevyPct: values.hrdfLevyPct,
        });
      }
      setDialogOpen(false);
      setEditing(null);
      await reload();
    } catch (cause) {
      setError(formatApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton className="h-36 w-full rounded-xl" key={index} />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!isSystemAdmin) {
    return (
      <div className="flex justify-center py-10">
        <EmptyState01
          description="Company management"
          emptyDetail="Only system administrators can manage group companies."
          emptyTitle="Admin access required"
          icon={
            <ShieldCheckIcon className="mx-auto size-12 text-muted-foreground" />
          }
          title="Restricted"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle
        actions={
          <Button onClick={openCreate} type="button">
            <PlusIcon className="size-4" />
            Add company
          </Button>
        }
        description="Multicompany directory — scope selector, imports, and pay runs."
        title="Companies"
      />

      {error === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {companies === null ? (
          Array.from({ length: 3 }, (_, index) => (
            <Skeleton className="h-36 w-full rounded-xl" key={index} />
          ))
        ) : (
          <>
            <StatisticsCard
              badgeContent="Group"
              changePercentage={`${String(stats.total)} legal entities`}
              icon={<Building2Icon />}
              title="Companies"
              trend="up"
              value={String(stats.total)}
            />
            <StatisticsCard
              badgeContent="Levy"
              changePercentage={`${String(stats.hrdfOn)} enabled`}
              icon={<PercentIcon />}
              iconClassName="bg-status-ok-fill text-status-ok-ink"
              title="HRDF on"
              trend="up"
              value={String(stats.hrdfOn)}
            />
            <StatisticsCard
              badgeContent="Exempt"
              changePercentage={`${String(stats.hrdfOff)} without levy`}
              icon={<Building2Icon />}
              iconClassName="bg-muted text-muted-foreground"
              title="HRDF off"
              trend={stats.hrdfOff > 0 ? "down" : "up"}
              value={String(stats.hrdfOff)}
            />
          </>
        )}
      </div>

      {companies === null ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : companies.length === 0 && error === null ? (
        <div className="flex justify-center py-6">
          <EmptyState01
            description="Payroll companies"
            emptyDetail="Seed db/seed/companies.json or add the first company here."
            emptyTitle="No companies yet"
            icon={
              <Building2Icon className="mx-auto size-12 text-muted-foreground" />
            }
            title="0"
          />
        </div>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <CompanyDatatable
              data={companies}
              onEdit={openEdit}
              title="Company directory"
            />
          </CardContent>
        </Card>
      )}

      <Dialog
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
          }
        }}
        open={dialogOpen}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing === null ? "Add company" : `Edit ${editing.code}`}
            </DialogTitle>
          </DialogHeader>
          <CompanyForm
            busy={busy}
            initial={editing}
            onCancel={() => {
              setDialogOpen(false);
              setEditing(null);
            }}
            onSubmit={onSubmit}
            submitLabel={editing === null ? "Create company" : "Save changes"}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { CompaniesPage };
