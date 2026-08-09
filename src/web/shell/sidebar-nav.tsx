/**
 * Application sidebar — Clarity Payroll nav + signed-in user footer.
 * Structure adapted from application-shell-05; routes from `app-nav`.
 */

import { Link } from "wouter";
import LogoSvg from "@/assets/svg/logo";
import SimpleProfileDropdown from "@/components/shadcn-studio/blocks/dashboard-dropdown-10/simple-profile-dropdown";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { useAuthContext } from "@/web/context/auth-context";
import { useShellNav } from "./shell-nav-context";

function initialsOf(me: { name: string; email: string } | null): string {
  if (me === null) {
    return "??";
  }
  const source = me.name.trim() === "" ? me.email : me.name;
  return source.slice(0, 2).toUpperCase();
}

function SidebarUserMenu() {
  const { me, signOut } = useAuthContext();
  const { isMobile } = useSidebar();
  const [dark, toggleDark] = useDarkMode();
  const name = me?.name ?? me?.email ?? "—";
  const email = me?.email ?? "—";
  const initials = initialsOf(me);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SimpleProfileDropdown
          align="end"
          dark={dark}
          email={email}
          initials={initials}
          name={name}
          onSignOut={signOut}
          onToggleTheme={toggleDark}
          side={isMobile ? "bottom" : "right"}
          sideOffset={isMobile ? 8 : 16}
          trigger={
            <SidebarMenuButton
              className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              size="lg"
            >
              <Avatar>
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {email}
                </span>
              </div>
            </SidebarMenuButton>
          }
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function SidebarNav() {
  const { items, isActive, authReady } = useShellNav();

  return (
    <Sidebar
      className="p-6 pr-0 *:data-[slot=sidebar-inner]:group-data-[variant=floating]:rounded-xl"
      collapsible="icon"
      variant="floating"
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="gap-2.5 bg-transparent! [&>svg]:size-8"
              render={<Link href="/" />}
              size="lg"
            >
              <LogoSvg className="[&_rect:first-child]:fill-primary [&_rect]:fill-sidebar" />
              <span className="font-semibold text-base">Clarity Payroll</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = isActive(item);
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      aria-current={active ? "page" : undefined}
                      isActive={active}
                      render={<Link href={item.href} />}
                      tooltip={item.label}
                    >
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {!authReady ? (
                <SidebarMenuItem>
                  <Skeleton className="h-8 w-full rounded-md" />
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarUserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}

export { SidebarNav };
