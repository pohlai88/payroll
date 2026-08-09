/**
 * Admin — read-only admin-users table. SYSTEM_ADMIN only (see
 * `isSystemAdminPresentation` — a UI presentation predicate, not an
 * authorization mechanism; the API enforces access independently).
 *
 * Studio blocks: statistics-component-03, datatable-component-04,
 * empty-state-01 — wired to getAdminUsers.
 */

import {
  Link2Icon,
  Link2OffIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import UserDatatable from "@/components/shadcn-studio/blocks/datatable-user";
import EmptyState01 from "@/components/shadcn-studio/blocks/empty-state-01/empty-state-01";
import StatisticsCard from "@/components/shadcn-studio/blocks/statistics-card-03";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatApiError } from "@/web/api/format-error";
import { payrollApi } from "@/web/api/payroll-api";
import type { AdminUserRow } from "@/web/api/types";
import { useAuthContext } from "@/web/context/auth-context";
import { PageTitle } from "@/web/shell/page-title";

function AdminPage() {
  const { isSystemAdmin, loading: authLoading } = useAuthContext();
  const [users, setUsers] = useState<readonly AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !isSystemAdmin) {
      return;
    }
    let cancelled = false;
    payrollApi
      .getAdminUsers()
      .then((result) => {
        if (!cancelled) {
          setUsers(result.users);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(formatApiError(cause));
          setUsers([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isSystemAdmin]);

  const stats = useMemo(() => {
    const list = users ?? [];
    const pending = list.filter((user) =>
      ["pending", "invited"].includes(user.status.toLowerCase())
    ).length;
    const linked = list.filter((user) => user.authSubject !== null).length;
    const unlinked = list.length - linked;
    return {
      total: list.length,
      pending,
      linked,
      unlinked,
    };
  }, [users]);

  if (authLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
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
        description="Directory of invited application users and roles."
        title="Admin"
      />

      {error === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {users === null ? (
          Array.from({ length: 4 }, (_, index) => (
            <Skeleton className="h-36 w-full rounded-xl" key={index} />
          ))
        ) : (
          <>
            <StatisticsCard
              badgeContent="Directory"
              changePercentage={`${String(stats.total)} total`}
              icon={<UsersIcon />}
              title="Users"
              trend="up"
              value={String(stats.total)}
            />
            <StatisticsCard
              badgeContent="Invite state"
              changePercentage={`${String(stats.pending)} open`}
              icon={<ShieldCheckIcon />}
              iconClassName="bg-status-warn-fill text-status-warn-ink"
              title="Pending"
              trend={stats.pending > 0 ? "down" : "up"}
              value={String(stats.pending)}
            />
            <StatisticsCard
              badgeContent="Neon Auth"
              changePercentage={`${String(stats.linked)} linked`}
              icon={<Link2Icon />}
              iconClassName="bg-status-ok-fill text-status-ok-ink"
              title="Linked"
              trend="up"
              value={String(stats.linked)}
            />
            <StatisticsCard
              badgeContent="Needs bind"
              changePercentage={`${String(stats.unlinked)} open`}
              icon={<Link2OffIcon />}
              iconClassName="bg-muted text-muted-foreground"
              title="Unlinked"
              trend={stats.unlinked > 0 ? "down" : "up"}
              value={String(stats.unlinked)}
            />
          </>
        )}
      </div>

      {users === null ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : users.length === 0 && error === null ? (
        <div className="flex justify-center py-6">
          <EmptyState01
            description="Invited application users"
            emptyDetail="Invite a user with scripts/invite-user.ts or setup-dev-user.ts."
            emptyTitle="No users yet"
            icon={
              <UsersIcon className="mx-auto size-12 text-muted-foreground" />
            }
            title="0"
          />
        </div>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <UserDatatable data={users} title="Admin users (read-only)" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export { AdminPage };
