/**
 * ⌘K command palette — navigation only in Phase 5B (see design doc §3.3).
 * The "Pay Runs" / "Employees" / "Actions" groups depend on data-fetching
 * screens that land in later SPA tasks; this only wires the chrome.
 */

import { useCallback } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuthContext } from "@/web/context/auth-context";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface NavigateItem {
  label: string;
  href: string;
  adminOnly?: boolean;
}

const NAVIGATE_ITEMS: readonly NavigateItem[] = [
  { label: "Pay Runs", href: "/pay-runs" },
  { label: "Employees", href: "/employees" },
  { label: "Reports", href: "/reports" },
  { label: "Control", href: "/control" },
  { label: "Admin", href: "/admin", adminOnly: true },
];

function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [, navigate] = useLocation();
  const { isSystemAdmin } = useAuthContext();

  const goTo = useCallback(
    (href: string) => {
      navigate(href);
      onOpenChange(false);
    },
    [navigate, onOpenChange]
  );

  return (
    <CommandDialog onOpenChange={onOpenChange} open={open}>
      <CommandInput placeholder="Search or jump…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {NAVIGATE_ITEMS.filter(
            (item) => !item.adminOnly || isSystemAdmin
          ).map((item) => (
            <CommandItem key={item.href} onSelect={goTo} value={item.href}>
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export { CommandPalette };
