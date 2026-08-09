/**
 * @feature shell
 * @layer ui
 *
 * `ShellLayout` — application-shell-05 chrome: floating sidebar + primary
 * band header + scrollable content. Wraps every signed-in route.
 */

import type { CSSProperties, ReactNode } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { useAuthContext } from "@/web/context/auth-context";
import { ShellNavProvider } from "./shell-nav-context";
import { SidebarNav } from "./sidebar-nav";
import { TopBar } from "./top-bar";

function IdentityBanner() {
  const { loading, identityError } = useAuthContext();
  if (loading || identityError === null) {
    return null;
  }
  return (
    <Alert className="mx-4 mb-2 sm:mx-6" variant="destructive">
      <AlertTitle>
        App identity failed — Admin and Companies stay hidden until this is
        fixed. {identityError}
      </AlertTitle>
    </Alert>
  );
}

function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-muted before:fixed before:inset-x-0 before:top-0 before:h-[26.25rem] before:bg-primary">
      <SidebarProvider
        style={
          {
            "--sidebar": "var(--card)",
            "--sidebar-width": "17.5rem",
            "--sidebar-width-icon": "3.375rem",
          } as CSSProperties
        }
      >
        <ShellNavProvider>
          <SidebarNav />
          <div className="z-1 flex min-w-0 flex-1 flex-col overflow-hidden py-6">
            <TopBar />
            <IdentityBanner />
            <main className="mx-auto size-full max-w-7xl flex-1 overflow-auto px-4 py-6 sm:px-6">
              {children}
            </main>
          </div>
        </ShellNavProvider>
      </SidebarProvider>
      <Toaster />
    </div>
  );
}

export { ShellLayout };
