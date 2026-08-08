/**
 * Application sidebar — navigation + signed-in user footer.
 *
 * See `docs/superpowers/specs/2026-08-08-phase5b-payroll-ui-shell-workspace-design.md`
 * §3.2 for the nav item table and active/inactive tokens.
 */

import {
  FileTextIcon,
  LogOutIcon,
  ReceiptTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link, useLocation } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuthContext } from "@/web/context/auth-context";

interface NavItem {
  icon: ComponentType<{ className?: string }>;
  label: string;
  href: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { icon: ReceiptTextIcon, label: "Pay Runs", href: "/pay-runs" },
  { icon: UsersIcon, label: "Employees", href: "/employees" },
  { icon: FileTextIcon, label: "Reports", href: "/reports" },
  { icon: ShieldCheckIcon, label: "Control", href: "/control" },
  { icon: SettingsIcon, label: "Admin", href: "/admin", adminOnly: true },
];

function isNavItemActive(location: string, href: string): boolean {
  return location === href || location.startsWith(`${href}/`);
}

function initialsOf(me: { name: string; email: string } | null): string {
  if (me === null) {
    return "??";
  }
  const source = me.name.trim() === "" ? me.email : me.name;
  return source.slice(0, 2).toUpperCase();
}

function SidebarNav() {
  const { me, isSystemAdmin, signOut } = useAuthContext();
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <span className="font-heading font-semibold text-primary text-sm">
          Clarity Payroll
        </span>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.filter((item) => !item.adminOnly || isSystemAdmin).map(
                (item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isNavItemActive(location, item.href)}
                      render={<Link href={item.href} />}
                    >
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <Separator />
      <SidebarFooter className="flex items-center gap-3 px-4 py-3">
        <Avatar className="size-8">
          <AvatarFallback className="text-xs">{initialsOf(me)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground text-xs">
            {me?.name ?? me?.email ?? "—"}
          </p>
          <p className="truncate text-muted-foreground text-xs">
            {me?.email ?? "—"}
          </p>
        </div>
        <button
          aria-label="Sign out"
          className="text-muted-foreground hover:text-foreground"
          onClick={signOut}
          type="button"
        >
          <LogOutIcon className="size-4" />
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}

export { SidebarNav };
