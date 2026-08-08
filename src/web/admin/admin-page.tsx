/**
 * Admin — read-only admin-users table. SYSTEM_ADMIN only (see
 * `isSystemAdminPresentation` — a UI presentation predicate, not an
 * authorization mechanism; the API enforces access independently).
 *
 * Restyled from the Phase 4A single-screen shell into a routed page.
 */

import { ShieldCheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
import type { AdminUserRow } from "@/web/api/types";
import { useAuthContext } from "@/web/context/auth-context";

function statusGlyph(status: string): string {
  switch (status.toLowerCase()) {
    case "pending":
      return "⋯";
    default:
      return "◦";
  }
}

function AdminPage() {
  const { isSystemAdmin } = useAuthContext();
  const [users, setUsers] = useState<readonly AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSystemAdmin) {
      return;
    }
    let cancelled = false;
    payrollApi
      .getAdminUsers()
      .then((result) => {
        if (!cancelled) {
          setUsers(result.users);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(formatApiError(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isSystemAdmin]);

  if (!isSystemAdmin) {
    return (
      <EmptyState
        description="This page is only available to system administrators."
        icon={<ShieldCheckIcon />}
        title="Admin"
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin users (read-only)</CardTitle>
      </CardHeader>
      <CardContent>
        {error !== null && (
          <p className="mb-3 text-destructive text-sm">{error}</p>
        )}
        {users === null ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Auth subject</TableHead>
                <TableHead>Id</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {statusGlyph(user.status)} {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{user.authSubject ?? "—"}</code>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{user.id}</code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export { AdminPage };
