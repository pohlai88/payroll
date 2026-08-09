import {
  CirclePlusIcon,
  CreditCardIcon,
  LogOutIcon,
  SettingsIcon,
  SquarePenIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactElement } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  trigger: ReactElement;
  defaultOpen?: boolean;
  align?: "start" | "center" | "end";
}

const ProfileDropdown = ({ trigger, defaultOpen, align = "end" }: Props) => (
  <DropdownMenu defaultOpen={defaultOpen}>
    <DropdownMenuTrigger render={trigger} />
    <DropdownMenuContent align={align || "end"} className="w-80">
      <DropdownMenuGroup>
        <DropdownMenuLabel className="flex items-center gap-4 px-4 py-2.5 font-normal">
          <div className="relative">
            <Avatar size="lg">
              <AvatarImage
                alt="Clarity user"
                src="https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png"
              />
              <AvatarFallback>CP</AvatarFallback>
            </Avatar>
            <span className="absolute right-0 bottom-0 block size-2 rounded-full bg-status-ok-ink ring-2 ring-card" />
          </div>
          <div className="flex flex-1 flex-col items-start">
            <span className="font-semibold text-foreground text-lg">
              Clarity user
            </span>
            <span className="text-base text-muted-foreground">
              user@clarity.payroll
            </span>
          </div>
        </DropdownMenuLabel>
      </DropdownMenuGroup>

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        <DropdownMenuItem className="gap-2 px-4 py-2.5 text-base">
          <UserIcon className="size-5 text-foreground" />
          <span>My account</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 px-4 py-2.5 text-base">
          <SettingsIcon className="size-5 text-foreground" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 px-4 py-2.5 text-base">
          <CreditCardIcon className="size-5 text-foreground" />
          <span>Billing</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        <DropdownMenuItem className="gap-2 px-4 py-2.5 text-base">
          <UsersIcon className="size-5 text-foreground" />
          <span>Manage team</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 px-4 py-2.5 text-base">
          <SquarePenIcon className="size-5 text-foreground" />
          <span>Customization</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 px-4 py-2.5 text-base">
          <CirclePlusIcon className="size-5 text-foreground" />
          <span>Add team account</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        <DropdownMenuItem
          className="gap-2 px-4 py-2.5 text-base"
          variant="destructive"
        >
          <LogOutIcon className="size-5" />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default ProfileDropdown;
