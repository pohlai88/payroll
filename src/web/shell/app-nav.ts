/**
 * Canonical signed-in shell navigation — single source for sidebar,
 * command palette, and breadcrumbs. Paths must match `src/web/app.tsx`
 * Route declarations (validated below).
 */

import {
  Building2Icon,
  FileTextIcon,
  LayoutDashboardIcon,
  ReceiptTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import type { ComponentType } from "react";

export interface AppNavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly adminOnly?: boolean;
  /** Match nested routes under this href (default true except dashboard). */
  readonly matchPrefix?: boolean;
}

/**
 * Wouter shell paths the signed-in nav may target. Keep in sync with
 * `<Route path=…>` in `src/web/app.tsx` (top-level shell destinations only).
 * Not Next.js App Router.
 */
const APP_SHELL_ROUTE_PATHS = [
  "/",
  "/pay-runs",
  "/employees",
  "/reports",
  "/control",
  "/companies",
  "/admin",
] as const;

type AppShellRoutePath = (typeof APP_SHELL_ROUTE_PATHS)[number];

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboardIcon,
    matchPrefix: false,
  },
  {
    id: "pay-runs",
    label: "Pay Runs",
    href: "/pay-runs",
    icon: ReceiptTextIcon,
  },
  {
    id: "employees",
    label: "Employees",
    href: "/employees",
    icon: UsersIcon,
  },
  {
    id: "reports",
    label: "Reports",
    href: "/reports",
    icon: FileTextIcon,
  },
  {
    id: "control",
    label: "Control",
    href: "/control",
    icon: ShieldCheckIcon,
  },
  {
    id: "companies",
    label: "Companies",
    href: "/companies",
    icon: Building2Icon,
    adminOnly: true,
  },
  {
    id: "admin",
    label: "Admin",
    href: "/admin",
    icon: SettingsIcon,
    adminOnly: true,
  },
];

function assertNavMatchesRoutes(): void {
  const routes = new Set<string>(APP_SHELL_ROUTE_PATHS);
  for (const item of APP_NAV_ITEMS) {
    if (!routes.has(item.href)) {
      throw new Error(
        `APP_NAV_ITEMS href "${item.href}" is not in APP_SHELL_ROUTE_PATHS`
      );
    }
  }
  for (const path of APP_SHELL_ROUTE_PATHS) {
    if (!APP_NAV_ITEMS.some((item) => item.href === path)) {
      throw new Error(
        `APP_SHELL_ROUTE_PATHS entry "${path}" has no APP_NAV_ITEMS item`
      );
    }
  }
}

assertNavMatchesRoutes();

export function isAppNavItemActive(
  location: string,
  item: Pick<AppNavItem, "href" | "matchPrefix">
): boolean {
  if (item.matchPrefix === false || item.href === "/") {
    return location === "/";
  }
  return location === item.href || location.startsWith(`${item.href}/`);
}

export function resolveAppNavItem(
  location: string,
  items: readonly AppNavItem[] = APP_NAV_ITEMS
): AppNavItem | null {
  // Prefer the most specific (longest) matching href so nested pay-run
  // routes resolve to Pay Runs, not Dashboard.
  let best: AppNavItem | null = null;
  for (const item of items) {
    if (!isAppNavItemActive(location, item)) {
      continue;
    }
    if (best === null || item.href.length > best.href.length) {
      best = item;
    }
  }
  return best;
}

export function visibleAppNavItems(
  isSystemAdmin: boolean,
  items: readonly AppNavItem[] = APP_NAV_ITEMS
): readonly AppNavItem[] {
  return items.filter((item) => item.adminOnly !== true || isSystemAdmin);
}
