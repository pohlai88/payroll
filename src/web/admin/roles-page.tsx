/**
 * @feature rbac
 * @layer ui
 * @hub src/server/routes/admin-roles.ts
 *
 * Roles & permission matrix — SYSTEM_ADMIN only. Resource × action checkbox
 * grid per custom role; SYSTEM_ADMIN itself is shown read-only (implicit
 * full access, never stored as matrix cells).
 */

import { PlusIcon, ShieldCheckIcon, ShieldIcon } from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import EmptyState01 from "@/components/shadcn-studio/blocks/empty-state-01/empty-state-01";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PERMISSION_ACTIONS,
  type PermissionAction,
  PERMISSION_RESOURCES,
  type PermissionResource,
  type RoleScope,
} from "@/domain/rbac/types";
import { useAsyncLoad } from "@/hooks/use-async-load";
import { useDialogSubmit } from "@/hooks/use-dialog-submit";
import { payrollApi } from "@/web/api/payroll-api";
import type { AdminRoleRow } from "@/web/api/types";
import { useAuthContext } from "@/web/context/auth-context";
import { PageTitle } from "@/web/shell/page-title";

const SKELETON_KEYS = ["role-sk-1", "role-sk-2"] as const;

function hasCell(
  role: AdminRoleRow,
  resource: PermissionResource,
  action: PermissionAction
): boolean {
  return role.permissions.some(
    (cell) => cell.resource === resource && cell.action === action
  );
}

type ToggleHandler = (
  roleId: string,
  resource: PermissionResource,
  action: PermissionAction,
  granted: boolean
) => void;

function PermissionCell({
  roleId,
  resource,
  action,
  checked,
  disabled,
  onToggle,
}: {
  readonly roleId: string;
  readonly resource: PermissionResource;
  readonly action: PermissionAction;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onToggle: ToggleHandler;
}) {
  const handleChange = useCallback(
    (next: boolean | "indeterminate") => {
      onToggle(roleId, resource, action, next === true);
    },
    [action, onToggle, resource, roleId]
  );

  return (
    <Checkbox
      aria-label={`${resource} ${action}`}
      checked={checked}
      disabled={disabled}
      onCheckedChange={handleChange}
    />
  );
}

function RoleMatrixCard({
  role,
  onToggle,
  busy,
}: {
  readonly role: AdminRoleRow;
  readonly onToggle: ToggleHandler;
  readonly busy: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          {role.isSystem ? (
            <ShieldCheckIcon className="size-4 text-secondary-foreground" />
          ) : (
            <ShieldIcon className="size-4 text-muted-foreground" />
          )}
          <CardTitle className="text-base">{role.name}</CardTitle>
          <Badge className="rounded-sm" variant="secondary">
            {role.scope}
          </Badge>
        </div>
        <code className="text-muted-foreground text-xs">{role.code}</code>
      </CardHeader>
      <CardContent>
        {role.isSystem ? (
          <p className="text-muted-foreground text-sm">
            System role — implicit full access on every resource and action.
            Not editable.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-0">Resource</TableHead>
                {PERMISSION_ACTIONS.map((action) => (
                  <TableHead className="text-center" key={action}>
                    {action}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSION_RESOURCES.map((resource) => (
                <TableRow key={resource}>
                  <TableCell className="pl-0 font-medium text-sm">
                    {resource}
                  </TableCell>
                  {PERMISSION_ACTIONS.map((action) => (
                    <TableCell className="text-center" key={action}>
                      <PermissionCell
                        action={action}
                        checked={hasCell(role, resource, action)}
                        disabled={busy}
                        onToggle={onToggle}
                        resource={resource}
                        roleId={role.id}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CreateRoleDialog({
  open,
  setOpen,
  onCreated,
}: {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly onCreated: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<RoleScope>("COMPANY");
  const submit = useDialogSubmit();

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setCode("");
        setName("");
        setScope("COMPANY");
        submit.reset();
      }
      setOpen(next);
    },
    [setOpen, submit]
  );

  const handleCancel = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  const handleCodeChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCode(event.currentTarget.value);
  }, []);

  const handleNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setName(event.currentTarget.value);
  }, []);

  const handleScopeChange = useCallback((value: string | null) => {
    setScope(value === "GLOBAL" ? "GLOBAL" : "COMPANY");
  }, []);

  const handleCreate = useCallback(() => {
    submit
      .run(async () => {
        await payrollApi.createAdminRole({ code, name, scope });
        handleOpenChange(false);
        await onCreated();
      }, "Failed to create role")
      .catch(() => undefined);
  }, [code, handleOpenChange, name, onCreated, scope, submit]);

  const disableCreate =
    submit.submitting || code.trim() === "" || name.trim() === "";

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>
            Create a custom role, then grant matrix cells below.
          </DialogDescription>
        </DialogHeader>
        {submit.error === null ? null : (
          <Alert variant="destructive">
            <AlertDescription>{submit.error}</AlertDescription>
          </Alert>
        )}
        <FieldGroup className="gap-4">
          <Field className="gap-2">
            <FieldLabel htmlFor="role-code">Role code</FieldLabel>
            <Input
              disabled={submit.submitting}
              id="role-code"
              onChange={handleCodeChange}
              placeholder="PAYROLL_OPERATOR"
              value={code}
            />
          </Field>
          <Field className="gap-2">
            <FieldLabel htmlFor="role-name">Role name</FieldLabel>
            <Input
              disabled={submit.submitting}
              id="role-name"
              onChange={handleNameChange}
              placeholder="Payroll Operator"
              value={name}
            />
          </Field>
          <Field className="gap-2">
            <FieldLabel htmlFor="role-scope">Scope</FieldLabel>
            <Select onValueChange={handleScopeChange} value={scope}>
              <SelectTrigger className="w-full" id="role-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COMPANY">
                  COMPANY — scoped per assignment
                </SelectItem>
                <SelectItem value="GLOBAL">
                  GLOBAL — applies everywhere
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={submit.submitting}
            onClick={handleCancel}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={disableCreate} onClick={handleCreate} type="button">
            Create role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RolesList({
  roles,
  busy,
  onToggle,
}: {
  readonly roles: readonly AdminRoleRow[];
  readonly busy: boolean;
  readonly onToggle: ToggleHandler;
}) {
  return (
    <div className="space-y-4">
      {roles.map((role) => (
        <RoleMatrixCard busy={busy} key={role.id} onToggle={onToggle} role={role} />
      ))}
    </div>
  );
}

function RolesPage() {
  const { isSystemAdmin, loading: authLoading } = useAuthContext();
  const [createOpen, setCreateOpen] = useState(false);
  const toggleSubmit = useDialogSubmit();

  const loadRoles = useCallback(async () => {
    const result = await payrollApi.getAdminRoles();
    return result.roles;
  }, []);

  const { data: roles, loading, error, reload } = useAsyncLoad(
    loadRoles,
    "Failed to load roles"
  );

  useEffect(() => {
    if (authLoading || !isSystemAdmin) {
      return;
    }
    reload().catch(() => undefined);
  }, [authLoading, isSystemAdmin, reload]);

  const handleToggle = useCallback<ToggleHandler>(
    (roleId, resource, action, granted) => {
      toggleSubmit
        .run(async () => {
          if (granted) {
            await payrollApi.grantAdminRolePermission(roleId, {
              resource,
              action,
            });
          } else {
            await payrollApi.revokeAdminRolePermission(roleId, {
              resource,
              action,
            });
          }
          await reload();
        }, "Failed to update permission")
        .catch(() => undefined);
    },
    [reload, toggleSubmit]
  );

  const handleOpenCreate = useCallback(() => {
    setCreateOpen(true);
  }, []);

  if (authLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!isSystemAdmin) {
    return (
      <div className="flex justify-center py-10">
        <EmptyState01
          description="Role & permission management"
          emptyDetail="Only system administrators can manage roles."
          emptyTitle="Admin access required"
          icon={
            <ShieldCheckIcon className="mx-auto size-12 text-muted-foreground" />
          }
          title="Restricted"
        />
      </div>
    );
  }

  const pageError = error ?? toggleSubmit.error;

  let body: ReactNode;
  if (roles === null || loading) {
    body = (
      <div className="space-y-4">
        {SKELETON_KEYS.map((key) => (
          <Skeleton className="h-56 w-full rounded-xl" key={key} />
        ))}
      </div>
    );
  } else if (roles.length === 0) {
    body = (
      <div className="flex justify-center py-6">
        <EmptyState01
          action={
            <Button onClick={handleOpenCreate} type="button">
              <PlusIcon className="size-4" />
              New role
            </Button>
          }
          description="Custom roles"
          emptyDetail="Create a role, then grant matrix cells."
          emptyTitle="No custom roles yet"
          icon={<ShieldIcon className="mx-auto size-12 text-muted-foreground" />}
          title="0"
        />
      </div>
    );
  } else {
    body = (
      <RolesList
        busy={toggleSubmit.submitting}
        onToggle={handleToggle}
        roles={roles}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle
        actions={
          <Button onClick={handleOpenCreate} type="button">
            <PlusIcon className="size-4" />
            New role
          </Button>
        }
        description="Custom roles and their resource × action permission grants."
        title="Roles & permissions"
      />

      {pageError === null ? null : (
        <Alert role="alert" variant="destructive">
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      )}

      {body}

      <CreateRoleDialog onCreated={reload} open={createOpen} setOpen={setCreateOpen} />
    </div>
  );
}

export { RolesPage };
