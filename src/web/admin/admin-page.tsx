/**
 * @feature admin-users
 * @layer ui
 * @hub src/server/routes/admin-users.ts
 *
 * Admin users directory — SYSTEM_ADMIN presentation gate only; API enforces.
 * Wired: getAdminUsers, createAdminUser, updateAdminUser, assignUserRole,
 * revokeUserRole.
 */

import { PlusIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import UserDatatable from "@/components/shadcn-studio/blocks/datatable-user";
import EmptyState01 from "@/components/shadcn-studio/blocks/empty-state-01/empty-state-01";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatApiError } from "@/web/api/format-error";
import { payrollApi } from "@/web/api/payroll-api";
import type { AdminUserRow, MeCompany } from "@/web/api/types";
import { useAuthContext } from "@/web/context/auth-context";
import { PageTitle } from "@/web/shell/page-title";
import { InviteDialog } from "./invite-dialog";
import { ManageDialog } from "./manage-dialog";

function AdminPage() {
  const { isSystemAdmin, loading: authLoading, me } = useAuthContext();
  const [users, setUsers] = useState<readonly AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageUserId, setManageUserId] = useState<string | null>(null);

  const companies: readonly MeCompany[] = me?.companies ?? [];

  const reload = useCallback(async () => {
    const result = await payrollApi.getAdminUsers();
    setUsers(result.users);
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
        setUsers([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isSystemAdmin, reload]);

  const openInvite = useCallback(() => {
    setInviteOpen(true);
  }, []);

  const openManage = useCallback((user?: AdminUserRow) => {
    setManageUserId(user?.id ?? null);
    setManageOpen(true);
  }, []);

  const openManageAny = useCallback(() => {
    openManage();
  }, [openManage]);

  const handleInviteSubmit = useCallback(
    async (body: {
      email: string;
      name: string;
      roleCode: string;
      companyId: string | null;
    }) => {
      setBusy(true);
      setError(null);
      try {
        await payrollApi.createAdminUser(body);
        setInviteOpen(false);
        await reload();
      } catch (cause) {
        setError(formatApiError(cause, "Invite failed"));
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  const handleStatusChange = useCallback(
    async (userId: string, status: "ACTIVE" | "DISABLED") => {
      setBusy(true);
      setError(null);
      try {
        await payrollApi.updateAdminUser(userId, { status });
        await reload();
      } catch (cause) {
        setError(formatApiError(cause, "Status update failed"));
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  const handleRowStatusChange = useCallback(
    (user: AdminUserRow, status: "ACTIVE" | "DISABLED") => {
      handleStatusChange(user.id, status).catch(() => undefined);
    },
    [handleStatusChange]
  );

  const runUpdateUser = useCallback(
    async (user: AdminUserRow, patch: { name?: string; email?: string }) => {
      setBusy(true);
      setError(null);
      try {
        await payrollApi.updateAdminUser(user.id, patch);
        await reload();
      } catch (cause) {
        setError(formatApiError(cause, "Update failed"));
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  const handleUpdateUser = useCallback(
    (user: AdminUserRow, patch: { name?: string; email?: string }) => {
      runUpdateUser(user, patch).catch(() => undefined);
    },
    [runUpdateUser]
  );

  const runBulkStatusChange = useCallback(
    async (targets: readonly AdminUserRow[], status: "ACTIVE" | "DISABLED") => {
      setBusy(true);
      setError(null);
      try {
        await Promise.all(
          targets.map((user) => payrollApi.updateAdminUser(user.id, { status }))
        );
        await reload();
      } catch (cause) {
        setError(formatApiError(cause, "Bulk status update failed"));
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  const handleBulkStatusChange = useCallback(
    (targets: readonly AdminUserRow[], status: "ACTIVE" | "DISABLED") => {
      runBulkStatusChange(targets, status).catch(() => undefined);
    },
    [runBulkStatusChange]
  );

  const handleAssignRole = useCallback(
    async (userId: string, roleCode: string, companyId: string | null) => {
      setBusy(true);
      setError(null);
      try {
        await payrollApi.assignUserRole(userId, { roleCode, companyId });
        await reload();
      } catch (cause) {
        setError(formatApiError(cause, "Assign role failed"));
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  const handleRevokeRole = useCallback(
    async (userId: string, roleCode: string, companyId: string | null) => {
      setBusy(true);
      setError(null);
      try {
        await payrollApi.revokeUserRole(userId, { roleCode, companyId });
        await reload();
      } catch (cause) {
        setError(formatApiError(cause, "Revoke role failed"));
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  if (authLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!isSystemAdmin) {
    return (
      <div className="flex justify-center py-10">
        <EmptyState01
          description="System administration"
          emptyDetail="This page is only available to system administrators."
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
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={users === null || users.length === 0}
              onClick={openManageAny}
              type="button"
              variant="outline"
            >
              Manage user
            </Button>
            <Button onClick={openInvite} type="button">
              <PlusIcon className="size-4" />
              Invite user
            </Button>
          </div>
        }
        description="Invite users, toggle status, and assign or revoke roles."
        title="Admin"
      />

      {error !== null && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {users === null && <Skeleton className="h-96 w-full rounded-xl" />}
      {users !== null && users.length === 0 && error === null && (
        <div className="flex justify-center py-6">
          <EmptyState01
            description="Invited application users"
            emptyDetail="Invite the first user with the button above."
            emptyTitle="No users yet"
            icon={
              <UsersIcon className="mx-auto size-12 text-muted-foreground" />
            }
            title="0"
          />
        </div>
      )}
      {users !== null && users.length > 0 && (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <UserDatatable
              data={users}
              onBulkStatusChange={handleBulkStatusChange}
              onManage={openManage}
              onStatusChange={handleRowStatusChange}
              onUpdateUser={handleUpdateUser}
              title="Admin users"
            />
          </CardContent>
        </Card>
      )}

      <InviteDialog
        busy={busy}
        companies={companies}
        onSubmit={handleInviteSubmit}
        open={inviteOpen}
        setOpen={setInviteOpen}
      />

      <ManageDialog
        busy={busy}
        companies={companies}
        initialUserId={manageUserId}
        onAssignRole={handleAssignRole}
        onRevokeRole={handleRevokeRole}
        onStatusChange={handleStatusChange}
        open={manageOpen}
        setOpen={setManageOpen}
        users={users ?? []}
      />
    </div>
  );
}

export { AdminPage };
