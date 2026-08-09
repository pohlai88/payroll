import {
  ArrowDownIcon,
  ArrowUpIcon,
  MonitorSmartphoneIcon,
  MoreVerticalIcon,
  SearchIcon,
  ShoppingCartIcon,
  Undo2Icon,
  UsersIcon,
} from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useState } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { InputGroupAddon } from "@/components/ui/input-group";

interface Props {
  trigger: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

const SearchDialog = ({ defaultOpen = false, trigger, className }: Props) => {
  const [open, setOpen] = useState(defaultOpen);
  const [search, setSearch] = useState("");

  const searchLower = search.toLowerCase();

  const suggestions = [
    {
      id: "marketing-ui",
      icon: <UsersIcon className="size-4.5! text-foreground" />,
      label: "Marketing UI Page",
    },
    {
      id: "ecommerce-ui",
      icon: <ShoppingCartIcon className="size-4.5! text-foreground" />,
      label: "e-commerce UI Page",
    },
    {
      id: "dashboard-ui",
      icon: <MonitorSmartphoneIcon className="size-4.5! text-foreground" />,
      label: "Dashboard UI Page",
    },
  ].filter((item) => item.label.toLowerCase().includes(searchLower));

  const interactions = [
    {
      id: "jira",
      name: "Jira",
      description: "Project management",
      logo: "https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dashboard-dialog/jira.png",
      avatars: [
        {
          src: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png",
          alt: "Aaron Larson",
          fallback: "AL",
        },
        {
          src: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png",
          alt: "Kathryn Cummings",
          fallback: "KC",
        },
        {
          src: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png",
          alt: "Vincent Boone",
          fallback: "VB",
        },
      ],
    },
    {
      id: "inferno",
      name: "Inferno",
      description: "Real-time photo sharing app",
      logo: "https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dashboard-dialog/inferno.png",
      avatars: [
        {
          src: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png",
          alt: "Walter Newton",
          fallback: "WN",
        },
        {
          src: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png",
          alt: "Ruby Stewart",
          fallback: "RS",
        },
        {
          src: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png",
          alt: "Bernard Clarke",
          fallback: "BC",
        },
        {
          src: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-4.png",
          alt: "Elva Baker",
          fallback: "EB",
        },
      ],
    },
  ].filter(
    (item) =>
      item.name.toLowerCase().includes(searchLower) ||
      item.description.toLowerCase().includes(searchLower)
  );

  const users = [
    {
      id: "barry-barnett",
      name: "Barry Barnett",
      email: "barry@hotmail.com",
      avatar: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png",
      fallback: "BB",
      status: "In office",
      statusVariant: "success" as const,
    },
    {
      id: "maria-donin",
      name: "Maria Donin",
      email: "maria@hotmail.com",
      avatar: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png",
      fallback: "MD",
      status: "On leave",
      statusVariant: "destructive" as const,
    },
  ].filter(
    (user) =>
      user.name.toLowerCase().includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower)
  );

  function handleOpenDialog() {
    setOpen(true);
  }

  function handleCloseDialog() {
    setOpen(false);
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    setSearch(event.target.value);
  }

  return (
    <div className={className}>
      <button className="contents" onClick={handleOpenDialog} type="button">
        {trigger}
      </button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent
          aria-describedby={undefined}
          className="gap-0 overflow-hidden border-0 p-0 *:data-[slot=dialog-close]:top-1.5 *:data-[slot=dialog-close]:right-1.5 sm:max-w-lg"
        >
          <DialogTitle className="sr-only">Search</DialogTitle>
          <Combobox open={true}>
            <ComboboxInput
              className="h-12 w-full gap-2 rounded-none border-0 border-border border-b px-3 ring-0! has-[[data-slot=input-group-control]:focus-visible]:border-inherit *:data-[align=inline-end]:hidden *:data-[align=inline-start]:p-0 *:data-[slot=input-group-control]:text-base [&_input]:p-0!"
              onChange={handleSearchChange}
              placeholder="Search here..."
              showTrigger={false}
              value={search}
            >
              <InputGroupAddon>
                <SearchIcon className="size-5" />
              </InputGroupAddon>
            </ComboboxInput>
            <ComboboxList className="border-0">
              <ComboboxEmpty>No results found.</ComboboxEmpty>

              {suggestions.length > 0 && (
                <>
                  <ComboboxGroup className="p-4!">
                    <ComboboxLabel>Suggestions</ComboboxLabel>
                    {suggestions.map((item) => (
                      <ComboboxItem
                        className="cursor-pointer p-1.5! text-base"
                        key={item.id}
                        onClick={handleCloseDialog}
                        value={item.id}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </ComboboxItem>
                    ))}
                  </ComboboxGroup>
                  {(interactions.length > 0 || users.length > 0) && (
                    <ComboboxSeparator className="my-0" />
                  )}
                </>
              )}

              {interactions.length > 0 && (
                <>
                  <ComboboxGroup className="p-4!">
                    <ComboboxLabel>Interactions</ComboboxLabel>
                    {interactions.map((item) => (
                      <ComboboxItem
                        className="cursor-pointer gap-3 p-1.5! text-base"
                        key={item.id}
                        onClick={handleCloseDialog}
                        value={item.id}
                      >
                        <Avatar className="size-9.5">
                          <AvatarFallback>
                            <img
                              alt={item.name}
                              className="size-6"
                              height={24}
                              src={item.logo}
                              width={24}
                            />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex w-full flex-col items-start">
                          <span className="font-medium">{item.name}</span>
                          <span className="text-muted-foreground! text-sm">
                            {item.description}
                          </span>
                        </div>
                        <AvatarGroup>
                          {item.avatars.map((avatar) => (
                            <Avatar key={avatar.alt}>
                              <AvatarImage alt={avatar.alt} src={avatar.src} />
                              <AvatarFallback>{avatar.fallback}</AvatarFallback>
                            </Avatar>
                          ))}
                          <AvatarGroupCount>+99</AvatarGroupCount>
                        </AvatarGroup>
                      </ComboboxItem>
                    ))}
                  </ComboboxGroup>
                  {users.length > 0 && <ComboboxSeparator className="my-0" />}
                </>
              )}

              {users.length > 0 && (
                <ComboboxGroup className="p-4!">
                  <ComboboxLabel>Users</ComboboxLabel>
                  {users.map((user) => (
                    <ComboboxItem
                      className="cursor-pointer gap-3 p-1.5! text-base"
                      key={user.id}
                      onClick={handleCloseDialog}
                      value={user.id}
                    >
                      <Avatar className="size-9.5">
                        <AvatarImage alt={user.name} src={user.avatar} />
                        <AvatarFallback>{user.fallback}</AvatarFallback>
                      </Avatar>
                      <div className="flex w-full flex-col items-start">
                        <span className="font-medium">{user.name}</span>
                        <span className="font-light text-muted-foreground! text-sm">
                          {user.email}
                        </span>
                      </div>
                      <Badge
                        className="h-auto px-3 font-normal text-sm"
                        variant={user.statusVariant}
                      >
                        {user.status}
                      </Badge>
                      <MoreVerticalIcon />
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              )}
            </ComboboxList>
          </Combobox>

          <div className="h-px bg-border max-sm:hidden" />

          <div className="flex flex-wrap items-center gap-4 p-4 text-muted-foreground max-sm:hidden">
            <div className="flex flex-1 items-center gap-2">
              <kbd className="rounded border px-1 text-sm">esc</kbd>
              <span>To close</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-sm border">
                <Undo2Icon className="size-4" />
              </div>
              <span>To Select</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-sm border">
                <ArrowUpIcon className="size-4" />
              </div>
              <div className="flex size-6 items-center justify-center rounded-sm border">
                <ArrowDownIcon className="size-4" />
              </div>
              <span>To Navigate</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SearchDialog;
