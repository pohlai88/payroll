/**
 * @feature shell
 * @layer ui
 *
 * dashboard-dropdown-10 — Clarity header/sidebar profile menu.
 * Circular avatars only (no rounded-lg vs after:rounded-full clash).
 */

import { LogOutIcon, MoonIcon, SunIcon } from "lucide-react";
import type { ReactElement } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SimpleProfileDropdownProps {
  trigger: ReactElement;
  name: string;
  email: string;
  initials: string;
  dark: boolean;
  onToggleTheme: () => void;
  onSignOut: () => void;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  defaultOpen?: boolean;
}

const SimpleProfileDropdown = ({
  trigger,
  name,
  email,
  initials,
  dark,
  onToggleTheme,
  onSignOut,
  align = "end",
  side,
  sideOffset,
  defaultOpen,
}: SimpleProfileDropdownProps) => (
  <DropdownMenu defaultOpen={defaultOpen}>
    <DropdownMenuTrigger render={trigger} />
    <DropdownMenuContent
      align={align}
      className="w-72"
      side={side}
      sideOffset={sideOffset}
    >
      <DropdownMenuGroup>
        <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2.5 font-normal">
          <Avatar size="lg">
            <AvatarFallback className="text-sm">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col items-start">
            <span className="truncate font-semibold text-popover-foreground text-sm">
              {name}
            </span>
            <span className="truncate text-muted-foreground text-xs">
              {email}
            </span>
          </div>
        </DropdownMenuLabel>
      </DropdownMenuGroup>

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        <DropdownMenuItem className="gap-2" onClick={onToggleTheme}>
          {dark ? (
            <SunIcon className="size-4 text-popover-foreground" />
          ) : (
            <MoonIcon className="size-4 text-popover-foreground" />
          )}
          <span>{dark ? "Use light theme" : "Use dark theme"}</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        <DropdownMenuItem
          className="gap-2"
          onClick={onSignOut}
          variant="destructive"
        >
          <LogOutIcon className="size-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default SimpleProfileDropdown;
