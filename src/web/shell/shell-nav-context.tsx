/**
 * @feature shell
 * @layer ui
 *
 * Shell navigation context — sits inside SidebarProvider so route changes
 * can close the mobile sheet and share one nav model with the sidebar /
 * command palette / breadcrumb.
 */

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useLocation } from "wouter";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuthContext } from "@/web/context/auth-context";
import {
  APP_NAV_ITEMS,
  type AppNavItem,
  isAppNavItemActive,
  resolveAppNavItem,
  visibleAppNavItems,
} from "./app-nav";

interface ShellNavContextValue {
  location: string;
  items: readonly AppNavItem[];
  currentItem: AppNavItem | null;
  authReady: boolean;
  isActive: (item: AppNavItem) => boolean;
  navigateTo: (href: string) => void;
}

const ShellNavContext = createContext<ShellNavContextValue | null>(null);

function ShellNavProvider({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { isSystemAdmin, loading: authLoading } = useAuthContext();
  const { isMobile, setOpenMobile } = useSidebar();

  const authReady = !authLoading;
  // Until permissions resolve, hide admin-only destinations so we never
  // hardcode Admin into the chrome for non-admins (or flash it early).
  const items = useMemo(
    () => visibleAppNavItems(authReady && isSystemAdmin, APP_NAV_ITEMS),
    [authReady, isSystemAdmin]
  );

  const currentItem = useMemo(
    () => resolveAppNavItem(location, APP_NAV_ITEMS),
    [location]
  );

  // Close the mobile sheet whenever the route changes (sidebar context
  // alone does not observe the router).
  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  const isActive = useCallback(
    (item: AppNavItem) => isAppNavItemActive(location, item),
    [location]
  );

  const navigateTo = useCallback(
    (href: string) => {
      navigate(href);
      if (isMobile) {
        setOpenMobile(false);
      }
    },
    [navigate, isMobile, setOpenMobile]
  );

  const value = useMemo(
    () => ({
      location,
      items,
      currentItem,
      authReady,
      isActive,
      navigateTo,
    }),
    [location, items, currentItem, authReady, isActive, navigateTo]
  );

  return (
    <ShellNavContext.Provider value={value}>
      {children}
    </ShellNavContext.Provider>
  );
}

function useShellNav(): ShellNavContextValue {
  const ctx = useContext(ShellNavContext);
  if (ctx === null) {
    throw new Error("useShellNav must be used within ShellNavProvider");
  }
  return ctx;
}

export type { ShellNavContextValue };
export { ShellNavProvider, useShellNav };
