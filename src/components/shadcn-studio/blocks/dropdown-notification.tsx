import { LinkIcon, SettingsIcon, XIcon } from "lucide-react";
import type { ReactElement } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  trigger: ReactElement;
  defaultOpen?: boolean;
  align?: "start" | "center" | "end";
}

const NotificationDropdown = ({
  trigger,
  defaultOpen,
  align = "end",
}: Props) => (
  <DropdownMenu defaultOpen={defaultOpen}>
    <DropdownMenuTrigger render={trigger} />
    <DropdownMenuContent
      align={align || "end"}
      className="w-full max-w-xs sm:max-w-122"
    >
      <Tabs className="gap-0" defaultValue="inbox">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col pb-0">
            <div className="flex items-center justify-between gap-6 pb-2.5">
              <span className="font-normal text-muted-foreground text-sm uppercase">
                Notifications
              </span>
              <Badge
                className="bg-primary/10 font-normal text-primary"
                variant="secondary"
              >
                8 New
              </Badge>
            </div>
            <div className="-mb-0.5 flex items-center justify-between gap-4">
              <TabsList variant="line">
                <TabsTrigger
                  className="group-data-horizontal/tabs:after:-bottom-1"
                  value="inbox"
                >
                  Inbox
                </TabsTrigger>
                <TabsTrigger
                  className="group-data-horizontal/tabs:after:-bottom-1"
                  value="general"
                >
                  General
                </TabsTrigger>
              </TabsList>
              <a href="/#">
                <SettingsIcon className="size-5 text-foreground" />
              </a>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="mt-0 h-0.5" />

        <TabsContent value="inbox">
          <DropdownMenuItem className="gap-3 px-2 py-3 text-base not-data-[variant=destructive]:focus:**:text-[revert-rule]">
            <Avatar className="size-9.5">
              <AvatarImage src="https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-19.png" />
              <AvatarFallback>MB</AvatarFallback>
            </Avatar>
            <div className="flex w-full flex-col items-start">
              <span className="font-medium text-base">Mark Bush</span>
              <div className="flex items-center gap-2.5">
                <span className="text-muted-foreground text-sm">
                  12 Minutes ago
                </span>
                <div className="size-1.5 rounded-full bg-primary/30" />
                <span className="text-muted-foreground text-sm">New post</span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <XIcon className="size-3.5 text-foreground" />
              <div className="size-1.5 rounded-full bg-primary" />
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-3 px-2 py-3 text-base not-data-[variant=destructive]:focus:**:text-[revert-rule]">
            <Avatar className="size-9.5">
              <AvatarImage src="https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-5.png" />
              <AvatarFallback>AB</AvatarFallback>
            </Avatar>
            <div className="flex w-full flex-col items-start">
              <span className="font-medium text-base">Aaron Black</span>
              <div className="flex items-center gap-2.5">
                <span className="text-muted-foreground text-sm">
                  27 Minutes ago
                </span>
                <div className="size-1.5 rounded-full bg-primary/30" />
                <span className="text-muted-foreground text-sm">
                  New comment
                </span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <XIcon className="size-3.5 text-foreground" />
              <div className="size-1.5 rounded-full bg-primary" />
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="items-start gap-3 px-2 py-3 text-base not-data-[variant=destructive]:focus:**:text-[revert-rule]">
            <Avatar className="size-9.5">
              <AvatarImage src="https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png" />
              <AvatarFallback>A</AvatarFallback>
            </Avatar>
            <div className="flex w-full flex-col items-start">
              <span className="font-medium text-base">
                Anna has applied to create an ad for your campaign
              </span>
              <div className="flex items-center gap-2.5">
                <span className="text-muted-foreground text-sm">
                  2 hours ago
                </span>
                <div className="size-1.5 rounded-full bg-primary/30" />
                <span className="text-muted-foreground text-sm">
                  New request for campaign
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <Button size="sm" variant="secondary">
                  Decline
                </Button>
                <Button className="text-primary-foreground!" size="sm">
                  Accept
                </Button>
              </div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="items-start gap-3 px-2 py-3 text-base not-data-[variant=destructive]:focus:**:text-[revert-rule]">
            <Avatar className="size-9.5">
              <AvatarImage src="https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png" />
              <AvatarFallback>J</AvatarFallback>
            </Avatar>
            <div className="flex w-full flex-col items-start">
              <span className="font-medium text-base">
                Jason attached the file
              </span>
              <div className="flex items-center gap-2.5">
                <span className="text-muted-foreground text-sm">
                  6 hours ago
                </span>
                <div className="size-1.5 rounded-full bg-primary/30" />
                <span className="text-muted-foreground text-sm">
                  Attached files
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <LinkIcon className="text-foreground" />
                <span className="text-sm">Work examples.com</span>
              </div>
            </div>
          </DropdownMenuItem>
        </TabsContent>

        <TabsContent value="general">
          <DropdownMenuItem className="gap-3 px-2 py-3 text-base not-data-[variant=destructive]:focus:**:text-[revert-rule]">
            <Avatar className="size-9.5">
              <AvatarImage src="https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-7.png" />
              <AvatarFallback>FC</AvatarFallback>
            </Avatar>
            <div className="flex w-full flex-col items-start">
              <span className="font-medium text-base">Fred Campbell</span>
              <div className="flex items-center gap-2.5">
                <span className="text-muted-foreground text-sm">
                  39 Minutes ago
                </span>
                <div className="size-1.5 rounded-full bg-primary/30" />
                <span className="text-muted-foreground text-sm">
                  New comment
                </span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <XIcon className="size-3.5 text-foreground" />
              <div className="size-1.5 rounded-full bg-primary" />
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="items-start gap-3 px-2 py-3 text-base not-data-[variant=destructive]:focus:**:text-[revert-rule]">
            <Avatar className="size-9.5">
              <AvatarImage src="https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-15.png" />
              <AvatarFallback>S</AvatarFallback>
            </Avatar>
            <div className="flex w-full flex-col items-start">
              <span className="font-medium text-base">
                Scott attached the file
              </span>
              <div className="flex items-center gap-2.5">
                <span className="text-muted-foreground text-sm">
                  3 hours ago
                </span>
                <div className="size-1.5 rounded-full bg-primary/30" />
                <span className="text-muted-foreground text-sm">
                  Attached files
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <LinkIcon className="text-foreground" />
                <span className="text-sm">Work examples.com</span>
              </div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-3 px-2 py-3 text-base not-data-[variant=destructive]:focus:**:text-[revert-rule]">
            <Avatar className="size-9.5">
              <AvatarImage src="https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-11.png" />
              <AvatarFallback>HL</AvatarFallback>
            </Avatar>
            <div className="flex w-full flex-col items-start">
              <span className="font-medium text-base">Harold Larson</span>
              <div className="flex items-center gap-2.5">
                <span className="text-muted-foreground text-sm">
                  5 hours ago
                </span>
                <div className="size-1.5 rounded-full bg-primary/30" />
                <span className="text-muted-foreground text-sm">New post</span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <XIcon className="size-3.5 text-foreground" />
              <div className="size-1.5 rounded-full bg-primary" />
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="items-start gap-3 px-2 py-3 text-base not-data-[variant=destructive]:focus:**:text-[revert-rule]">
            <Avatar className="size-9.5">
              <AvatarImage src="https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-6.png" />
              <AvatarFallback>R</AvatarFallback>
            </Avatar>
            <div className="flex w-full flex-col items-start">
              <span className="font-medium text-base">
                Rosie has applied to create an ad for your campaign
              </span>
              <div className="flex items-center gap-2.5">
                <span className="text-muted-foreground text-sm">
                  8 hours ago
                </span>
                <div className="size-1.5 rounded-full bg-primary/30" />
                <span className="text-muted-foreground text-sm">
                  New request for campaign
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <Button size="sm" variant="secondary">
                  Decline
                </Button>
                <Button className="text-primary-foreground!" size="sm">
                  Accept
                </Button>
              </div>
            </div>
          </DropdownMenuItem>
        </TabsContent>
      </Tabs>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default NotificationDropdown;
