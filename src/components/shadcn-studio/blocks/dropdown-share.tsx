import { InfoIcon, LinkIcon, MoreHorizontalIcon } from "lucide-react";
import type { ReactElement } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const WHITESPACE_REGEX = /\s/;

function initialsFromName(name: string): string {
  return name
    .split(WHITESPACE_REGEX)
    .reduce((response, word) => `${response}${word.slice(0, 1)}`, "");
}

interface Props {
  trigger: ReactElement;
  defaultOpen?: boolean;
  align?: "start" | "center" | "end";
  morePeople?: {
    img: string;
    name: string;
  }[];
  data: {
    img: string;
    name: string;
    email: string;
    role: string;
  }[];
}

const roleItems = [
  { label: "Owner", value: "owner" },
  { label: "Admin", value: "admin" },
  { label: "Can Edit", value: "can-edit" },
  { label: "Can View", value: "can-view" },
];

const ShareDropdown = ({
  defaultOpen,
  align,
  trigger,
  data,
  morePeople,
}: Props) => (
  <DropdownMenu defaultOpen={defaultOpen}>
    <DropdownMenuTrigger render={trigger} />
    <DropdownMenuContent align={align || "end"} className="w-xs sm:w-116">
      <DropdownMenuGroup>
        <DropdownMenuLabel className="font-normal text-muted-foreground text-sm uppercase">
          Share Read-only Link
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <div className="mt-4 flex flex-col gap-3 px-2">
        <div className="flex items-center gap-2.5">
          <Input className="h-8" placeholder="Enter email" type="email" />
          <Button>Send</Button>
        </div>
        <p className="font-medium text-sm">Team Members</p>
        <div className="flex flex-col gap-3">
          {data.map((item) => (
            <div
              className="flex flex-wrap items-center gap-4 px-3 py-1"
              key={item.email}
            >
              <Avatar className="size-9.5">
                <AvatarImage src={item.img} />
                <AvatarFallback>{initialsFromName(item.name)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col gap-x-4 gap-y-2 sm:flex-row sm:items-center">
                <div className="flex flex-1 flex-col items-start">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-muted-foreground">{item.email}</p>
                </div>
                <Select defaultValue={item.role} items={roleItems}>
                  <SelectTrigger
                    className="border-0 px-2 font-medium shadow-none"
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {roleItems.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
          {morePeople != null && morePeople.length > 0 ? (
            <div className="flex items-center gap-4 px-3 py-1">
              <div className="flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background *:data-[slot=avatar]:grayscale">
                {morePeople.map((person) => (
                  <Avatar className="size-7" key={person.name}>
                    <AvatarImage src={person.img} />
                    <AvatarFallback>
                      {initialsFromName(person.name)}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <p className="flex-1 text-muted-foreground">{`${morePeople.length} more people`}</p>
              <MoreHorizontalIcon className="size-4" />
            </div>
          ) : null}
        </div>
      </div>
      <DropdownMenuSeparator />
      <div className="flex items-center gap-4 px-2 py-1">
        <div className="flex flex-1 items-center gap-1.5 text-muted-foreground">
          <InfoIcon className="size-4" />
          <span className="text-sm">Read more about sharing</span>
        </div>
        <Button size="sm" variant="ghost">
          <LinkIcon />
          Copy Link
        </Button>
      </div>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default ShareDropdown;
