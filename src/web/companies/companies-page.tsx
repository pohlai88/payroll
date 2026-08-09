/**
 * @feature companies
 * @layer ui
 * @hub src/server/routes/admin-companies.ts
 *
 * Companies — multicompany directory for SYSTEM_ADMIN.
 * Studio DNA: statistics-with-status, form-layout-01, empty-state-01,
 * datatable-company (iui: datatable-component-06 actions/toolbar).
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
import StatisticsWithStatus, {
  type StatCard,
} from "@/components/shadcn-studio/blocks/statistics-with-status";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsyncLoad } from "@/hooks/use-async-load";
import { useDialogSubmit } from "@/hooks/use-dialog-submit";
import { payrollApi } from "@/web/api/payroll-api";
import type { AdminCompanyRow, CreateAdminCompanyBody } from "@/web/api/types";
import { useAuthContext } from "@/web/context/auth-context";
import { PageTitle } from "@/web/shell/page-title";

function CompaniesPage() {
  const { isSystemAdmin, loading: authLoading } = useAuthContext();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCompanyRow | null>(null);
  const [deleting, setDeleting] = useState<AdminCompanyRow | null>(null);

  const loadCompanies = useCallback(async () => {
    const result = await payrollApi.getAdminCompanies();
    return result.companies;
  }, []);

  const {
    data: companies,
    loading,
    error: loadError,
    reload,
  } = useAsyncLoad(loadCompanies, "Failed to load companies");

  const formSubmit = useDialogSubmit();
  const deleteSubmit = useDialogSubmit();

  useEffect(() => {
    if (authLoading || !isSystemAdmin) {
      return;
    }
    void reload();
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
    formSubmit.reset();
    setFormOpen(true);
  };

  const openEdit = (company: AdminCompanyRow) => {
    setEditing(company);
    formSubmit.reset();
    setFormOpen(true);
  };

  const openDelete = (company: AdminCompanyRow) => {
    setDeleting(company);
    deleteSubmit.reset();
  };

  const onFormSubmit = async (values: CreateAdminCompanyBody) => {
    await formSubmit.run(async () => {
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
      setFormOpen(false);
      setEditing(null);
      await reload();
    }, "Failed to save company");
  };

  const onConfirmDelete = async () => {
    if (deleting === null) {
      return;
    }
    const companyId = deleting.id;
    await deleteSubmit.run(async () => {
      await payrollApi.deleteAdminCompany(companyId);
      setDeleting(null);
      await reload();
    }, "Failed to delete company");
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

  const statCards: readonly StatCard[] = [
    {
      title: "Companies",
      value: stats.total,
      icon: <Building2Icon />,
      status: stats.total > 0 ? "pending" : "neutral",
      caption:
        stats.total === 1
          ? "1 legal entity"
          : `${String(stats.total)} legal entities`,
    },
    {
      title: "HRDF on",
      value: stats.hrdfOn,
      icon: <PercentIcon />,
      status: stats.hrdfOn > 0 ? "ok" : "neutral",
      caption: stats.hrdfOn > 0 ? "Levy enabled" : "No company has the levy on",
    },
    {
      title: "HRDF off",
      value: stats.hrdfOff,
      icon: <Building2Icon />,
      status: stats.hrdfOff > 0 ? "attention" : "ok",
      caption: stats.hrdfOff > 0 ? "Exempt from levy" : "All companies covered",
    },
  ];

  const pageError = loadError ?? formSubmit.error ?? deleteSubmit.error;

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

      {pageError === null ? null : (
        <Alert role="alert" variant="destructive">
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {companies === null || loading
          ? Array.from({ length: 3 }, (_, index) => (
              <Skeleton className="h-36 w-full rounded-xl" key={index} />
            ))
          : statCards.map((card) => (
              <StatisticsWithStatus
                caption={card.caption}
                icon={card.icon}
                key={card.title}
                status={card.status}
                title={card.title}
                value={String(card.value)}
              />
            ))}
      </div>

      {companies === null || loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : companies.length === 0 ? (
        <div className="flex justify-center py-6">
          <EmptyState01
            action={
              <Button onClick={openCreate} type="button">
                <PlusIcon className="size-4" />
                Add company
              </Button>
            }
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
              onDelete={openDelete}
              onEdit={openEdit}
              title="Company directory"
            />
          </CardContent>
        </Card>
      )}

      <Dialog
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditing(null);
            formSubmit.reset();
          }
        }}
        open={formOpen}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing === null ? "Add company" : `Edit ${editing.code}`}
            </DialogTitle>
            <DialogDescription>
              {editing === null
                ? "Create a legal entity for imports and pay-run scope."
                : "Update statutory identifiers and HRDF settings."}
            </DialogDescription>
          </DialogHeader>
          {formSubmit.error === null ? null : (
            <Alert variant="destructive">
              <AlertDescription>{formSubmit.error}</AlertDescription>
            </Alert>
          )}
          <CompanyForm
            busy={formSubmit.submitting}
            initial={editing}
            key={editing?.id ?? "create"}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
              formSubmit.reset();
            }}
            onSubmit={onFormSubmit}
            submitLabel={editing === null ? "Create company" : "Save changes"}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            deleteSubmit.reset();
          }
        }}
        open={deleting !== null}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleting?.code}?</DialogTitle>
            <DialogDescription>
              Hard-delete is only allowed when the company has no employments
              and no pay runs. Otherwise the API returns 409.
            </DialogDescription>
          </DialogHeader>
          {deleteSubmit.error === null ? null : (
            <Alert variant="destructive">
              <AlertDescription>{deleteSubmit.error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              disabled={deleteSubmit.submitting}
              onClick={() => {
                setDeleting(null);
                deleteSubmit.reset();
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deleteSubmit.submitting}
              onClick={() => {
                void onConfirmDelete();
              }}
              type="button"
              variant="destructive"
            >
              Delete company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { CompaniesPage };
