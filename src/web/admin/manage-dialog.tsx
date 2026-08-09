/**
 * @feature admin-users
 * @layer ui
 * @hub src/server/routes/admin-users.ts
 *
 * Manage user dialog — toggle status, assign/revoke roles on existing users.
 */

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SYSTEM_ADMIN_ROLE_CODE } from "@/domain/rbac/types";
import type { AdminUserRow, MeCompany } from "@/web/api/types";

const ROLE_OPTIONS = [SYSTEM_ADMIN_ROLE_CODE] as const;

interface ManageDialogProps {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly busy: boolean;
  readonly users: readonly AdminUserRow[];
  readonly companies: readonly MeCompany[];
  readonly initialUserId?: string | null;
  readonly onStatusChange: (
    userId: string,
    status: "ACTIVE" | "DISABLED"
  ) => void;
  readonly onAssignRole: (
    userId: string,
    roleCode: string,
    companyId: string | null
  ) => void;
  readonly onRevokeRole: (
    userId: string,
    roleCode: string,
    companyId: string | null
  ) => void;
}

function ManageDialog({
  open,
  setOpen,
  busy,
  users,
  companies,
  initialUserId,
  onStatusChange,
  onAssignRole,
  onRevokeRole,
}: ManageDialogProps) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<string>(SYSTEM_ADMIN_ROLE_CODE);
  const [companyId, setCompanyId] = useState("");

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setUserId(initialUserId ?? users[0]?.id ?? "");
        setRole(SYSTEM_ADMIN_ROLE_CODE);
        setCompanyId("");
      }
      setOpen(next);
    },
    [initialUserId, setOpen, users]
  );

  const managedUser = useMemo(
    () => users.find((u) => u.id === userId) ?? null,
    [userId, users]
  );

  const resolvedCompanyId: string | null =
    role !== SYSTEM_ADMIN_ROLE_CODE && companyId !== "" ? companyId : null;

  const onUserChange = useCallback((v: string | null) => {
    setUserId(v ?? "");
  }, []);

  const onRoleChange = useCallback((v: string | null) => {
    setRole(v ?? SYSTEM_ADMIN_ROLE_CODE);
  }, []);

  const onCompanyChange = useCallback((v: string | null) => {
    setCompanyId(v ?? "");
  }, []);

  const handleEnable = useCallback(() => {
    if (managedUser !== null) {
      onStatusChange(managedUser.id, "ACTIVE");
    }
  }, [managedUser, onStatusChange]);

  const handleDisable = useCallback(() => {
    if (managedUser !== null) {
      onStatusChange(managedUser.id, "DISABLED");
    }
  }, [managedUser, onStatusChange]);

  const handleAssign = useCallback(() => {
    if (managedUser !== null) {
      onAssignRole(managedUser.id, role, resolvedCompanyId);
    }
  }, [managedUser, onAssignRole, resolvedCompanyId, role]);

  const handleRevoke = useCallback(() => {
    if (managedUser !== null) {
      onRevokeRole(managedUser.id, role, resolvedCompanyId);
    }
  }, [managedUser, onRevokeRole, resolvedCompanyId, role]);

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage user</DialogTitle>
          <DialogDescription>
            Toggle ACTIVE/DISABLED or assign/revoke a role on the selected user.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>User</Label>
            <Select onValueChange={onUserChange} value={userId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {managedUser !== null && (
            <p className="text-muted-foreground text-xs">
              Status: {managedUser.status}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || managedUser === null}
              onClick={handleEnable}
              size="sm"
              type="button"
              variant="outline"
            >
              Enable
            </Button>
            <Button
              disabled={busy || managedUser === null}
              onClick={handleDisable}
              size="sm"
              type="button"
              variant="outline"
            >
              Disable
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select onValueChange={onRoleChange} value={role}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {role === SYSTEM_ADMIN_ROLE_CODE ? (
            <p className="text-muted-foreground text-xs">
              SYSTEM_ADMIN is global — no company scope.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label>Company scope</Label>
              <Select onValueChange={onCompanyChange} value={companyId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={busy || managedUser === null}
            onClick={handleRevoke}
            type="button"
            variant="outline"
          >
            Revoke role
          </Button>
          <Button
            disabled={busy || managedUser === null}
            onClick={handleAssign}
            type="button"
          >
            Assign role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ManageDialog };
