/**
 * @feature admin-users
 * @layer ui
 * @hub src/server/routes/admin-users.ts
 *
 * Admin — read-only admin-users table. SYSTEM_ADMIN only (see
 * `isSystemAdminPresentation` — a UI presentation predicate, not an
 * authorization mechanism; the API enforces access independently).
 *
 * Studio blocks: statistics-with-status (12), datatable-component-04,
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
import StatisticsWithStatus, {
  type StatCard,
} from "@/components/shadcn-studio/blocks/statistics-with-status";
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

  // Hoisted out of JSX so the render stays flat: each tile owns its own
  // governance valence rather than repeating ternaries inline.
  const statCards: readonly StatCard[] = [
    {
      title: "Users",
      value: stats.total,
      icon: <UsersIcon />,
      status: stats.total > 0 ? "pending" : "neutral",
      caption: stats.total === 1 ? "1 in directory" : "In directory",
    },
    {
      title: "Pending",
      value: stats.pending,
      icon: <ShieldCheckIcon />,
      status: stats.pending > 0 ? "attention" : "ok",
      caption: stats.pending > 0 ? "Invites not accepted" : "No open invites",
    },
    {
      title: "Linked",
      value: stats.linked,
      icon: <Link2Icon />,
      status: stats.linked > 0 ? "ok" : "neutral",
      caption: stats.linked > 0 ? "Bound to Neon Auth" : "None bound yet",
    },
    {
      title: "Unlinked",
      value: stats.unlinked,
      icon: <Link2OffIcon />,
      status: stats.unlinked > 0 ? "attention" : "ok",
      caption: stats.unlinked > 0 ? "Awaiting first sign-in" : "All bound",
    },
  ];

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
        {users === null
          ? Array.from({ length: 4 }, (_, index) => (
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
