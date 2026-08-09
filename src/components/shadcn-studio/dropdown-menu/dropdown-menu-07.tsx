/**
 * @feature shell
 * @layer ui
 *
 * Shell dropdown menu block.
 */

import {
  BellIcon,
  CreditCardIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const listItems = [
  {
    icon: <UserIcon />,
    property: "Profile",
  },
  {
    icon: <SettingsIcon />,
    property: "Settings",
  },
  {
    icon: <CreditCardIcon />,
    property: "Billing",
  },
  {
    icon: <BellIcon />,
    property: "Notifications",
  },
  {
    icon: <LogOutIcon />,
    property: "Sign Out",
  },
];

const DropdownMenuUserMenuDemo = () => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button className="rounded-full" size="icon" variant="ghost">
          <Avatar>
            <AvatarImage
              alt="Hallie Richards"
              src="https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-5.png"
            />
            <AvatarFallback className="text-xs">HR</AvatarFallback>
          </Avatar>
        </Button>
      }
    />
    <DropdownMenuContent className="w-56">
      <DropdownMenuGroup>
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        {listItems.map((item) => (
          <DropdownMenuItem
            className="*:[svg]:text-muted-foreground"
            key={item.property}
          >
            {item.icon}
            <span className="text-popover-foreground">{item.property}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default DropdownMenuUserMenuDemo;
