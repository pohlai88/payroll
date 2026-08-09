/**
 * @feature admin-users
 * @layer ui
 * @hub src/server/routes/admin-users.ts
 *
 * Invite user dialog — creates a new app user row with a role assignment.
 */

import type { ChangeEvent } from "react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SYSTEM_ADMIN_ROLE_CODE } from "@/domain/rbac/types";
import type { MeCompany } from "@/web/api/types";

const ROLE_OPTIONS = [SYSTEM_ADMIN_ROLE_CODE] as const;

interface InviteDialogProps {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly busy: boolean;
  readonly companies: readonly MeCompany[];
  readonly onSubmit: (body: {
    email: string;
    name: string;
    roleCode: string;
    companyId: string | null;
  }) => void;
}

function InviteDialog({
  open,
  setOpen,
  busy,
  companies,
  onSubmit,
}: InviteDialogProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>(SYSTEM_ADMIN_ROLE_CODE);
  const [companyId, setCompanyId] = useState("");

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setEmail("");
        setName("");
        setRole(SYSTEM_ADMIN_ROLE_CODE);
        setCompanyId("");
      }
      setOpen(next);
    },
    [setOpen]
  );

  const onEmailChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setEmail(e.currentTarget.value);
  }, []);

  const onNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setName(e.currentTarget.value);
  }, []);

  const onRoleChange = useCallback((v: string | null) => {
    setRole(v ?? SYSTEM_ADMIN_ROLE_CODE);
  }, []);

  const onCompanyChange = useCallback((v: string | null) => {
    setCompanyId(v ?? "");
  }, []);

  const handleCancel = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const handleSubmit = useCallback(() => {
    let resolvedCompanyId: string | null = null;
    if (role !== SYSTEM_ADMIN_ROLE_CODE && companyId !== "") {
      resolvedCompanyId = companyId;
    }
    onSubmit({
      email: email.trim(),
      name: name.trim(),
      roleCode: role,
      companyId: resolvedCompanyId,
    });
  }, [companyId, email, name, onSubmit, role]);

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>
            Creates an app user row. They must sign in with Neon Auth using this
            email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              onChange={onEmailChange}
              type="email"
              value={email}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Name</Label>
            <Input id="invite-name" onChange={onNameChange} value={name} />
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
            disabled={busy}
            onClick={handleCancel}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={busy || email.trim() === "" || name.trim() === ""}
            onClick={handleSubmit}
            type="button"
          >
            {busy ? "Inviting…" : "Invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { InviteDialog };
