/**
 * `ShellLayout` — sidebar + top bar + scrollable content slot.
 * Wraps every routed screen once the user is signed in (see `app.tsx`).
 */

import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SidebarNav } from "./sidebar-nav";
import { TopBar } from "./top-bar";

function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <SidebarNav />
        <SidebarInset className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export { ShellLayout };
