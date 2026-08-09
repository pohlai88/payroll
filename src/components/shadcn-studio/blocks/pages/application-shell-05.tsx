import type { CSSProperties, ReactElement } from "react";
import FacebookIcon from "@/assets/svg/facebook-icon";
import InstagramIcon from "@/assets/svg/instagram-icon";
import LinkedinIcon from "@/assets/svg/linkedin-icon";
import LogoSvg from "@/assets/svg/logo";
import TwitterIcon from "@/assets/svg/twitter-icon";
import ActivityDialog from "@/components/shadcn-studio/blocks/dialog-activity";
import SearchDialog from "@/components/shadcn-studio/blocks/dialog-search";
import LanguageDropdown from "@/components/shadcn-studio/blocks/dropdown-language";
import NotificationDropdown from "@/components/shadcn-studio/blocks/dropdown-notification";
import ProfileDropdown from "@/components/shadcn-studio/blocks/dropdown-profile";
import MenuTrigger from "@/components/shadcn-studio/blocks/menu-trigger";
import SidebarUserDropdown from "@/components/shadcn-studio/blocks/sidebar-user-dropdown";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { IconPlaceholder } from "@/registry/icons/icon-placeholder";

interface MenuSubItem {
  label: string;
  href: string;
  badge?: string;
}

type MenuItem = {
  icon: ReactElement;
  label: string;
} & (
  | {
      href: string;
      badge?: string;
      items?: never;
    }
  | { href?: never; badge?: never; items: MenuSubItem[] }
);

interface RecipientsItem {
  name: string;
  avatarSrc: string;
  href: string;
}

const pagesItems: MenuItem[] = [
  {
    icon: (
      <IconPlaceholder
        hugeicons="Home03Icon"
        lucide="HomeIcon"
        phosphor="HouseIcon"
        remixicon="RiHome4Line"
        tabler="IconHome"
      />
    ),
    label: "Home",
    href: "#",
  },
  {
    icon: (
      <IconPlaceholder
        hugeicons="WalletIcon"
        lucide="WalletIcon"
        phosphor="WalletIcon"
        remixicon="RiWalletLine"
        tabler="IconWallet"
      />
    ),
    label: "Wallet Management",
    items: [
      { label: "Account Overview", href: "#" },
      { label: "Available Funds", href: "#" },
      { label: "Transaction History", href: "#" },
    ],
  },
  {
    icon: (
      <IconPlaceholder
        hugeicons="ArrowLeftRightIcon"
        lucide="ArrowRightLeftIcon"
        phosphor="ArrowsLeftRightIcon"
        remixicon="RiArrowLeftRightLine"
        tabler="IconArrowsRightLeft"
      />
    ),
    label: "Money Transfers",
    items: [
      { label: "Transfer Overview", href: "#" },
      { label: "Transfer Methods", href: "#" },
    ],
  },
  {
    icon: (
      <IconPlaceholder
        hugeicons="AddCircleIcon"
        lucide="CirclePlusIcon"
        phosphor="PlusCircleIcon"
        remixicon="RiAddCircleLine"
        tabler="IconCirclePlus"
      />
    ),
    label: "Deposit Funds",
    items: [
      { label: "Deposit Amount", href: "#" },
      { label: "Payment Method", href: "#" },
      { label: "Confirmation", href: "#" },
    ],
  },
  {
    icon: (
      <IconPlaceholder
        hugeicons="ArrowDownLeft01Icon"
        lucide="ArrowDownLeftIcon"
        phosphor="ArrowDownLeftIcon"
        remixicon="RiArrowLeftDownLongLine"
        tabler="IconArrowDownLeft"
      />
    ),
    label: "Request Funds",
    items: [
      { label: "Request Details", href: "#" },
      { label: "Amount to Request", href: "#" },
      { label: "Share Request", href: "#" },
    ],
  },
  {
    icon: (
      <IconPlaceholder
        hugeicons="Dollar02Icon"
        lucide="DollarSignIcon"
        phosphor="CurrencyDollarIcon"
        remixicon="RiMoneyDollarCircleLine"
        tabler="IconCurrencyDollar"
      />
    ),
    label: "Payment Requests",
    items: [
      { label: "Request Overview", href: "#" },
      { label: "Payment Details", href: "#" },
    ],
  },
  {
    icon: (
      <IconPlaceholder
        hugeicons="PackageIcon"
        lucide="PackageIcon"
        phosphor="PackageIcon"
        remixicon="RiBox3Line"
        tabler="IconPackage"
      />
    ),
    label: "Order Management",
    items: [
      { label: "Order Overview", href: "#" },
      { label: "Add New Order", href: "#" },
      { label: "View Orders", href: "#" },
    ],
  },
  {
    icon: (
      <IconPlaceholder
        hugeicons="UserMultiple03Icon"
        lucide="UsersIcon"
        phosphor="UsersIcon"
        remixicon="RiGroupLine"
        tabler="IconUsers"
      />
    ),
    label: "User Management",
    items: [
      { label: "Users Overview", href: "#" },
      { label: "Active Users", href: "#" },
    ],
  },
];

const recipientsItems: RecipientsItem[] = [
  {
    name: "Liam Anderson",
    avatarSrc: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png",
    href: "#",
  },
  {
    name: "Emma Smith",
    avatarSrc: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-4.png",
    href: "#",
  },
  {
    name: "Ethan Bennett",
    avatarSrc: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-5.png",
    href: "#",
  },
  {
    name: "Olivia Morgan",
    avatarSrc: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-6.png",
    href: "#",
  },
  {
    name: "Noah Carter",
    avatarSrc: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-7.png",
    href: "#",
  },
  {
    name: "Ava Thompson",
    avatarSrc: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-8.png",
    href: "#",
  },
];

const ApplicationShell = () => (
  <div className="relative flex min-h-dvh w-full bg-muted before:fixed before:inset-x-0 before:top-0 before:h-105 before:bg-primary">
    <SidebarProvider
      style={
        {
          "--sidebar": "var(--card)",
          "--sidebar-width": "17.5rem",
          "--sidebar-width-icon": "3.375rem",
        } as CSSProperties
      }
    >
      <Sidebar
        className="p-6 pr-0 *:data-[slot=sidebar-inner]:group-data-[variant=floating]:rounded-xl"
        collapsible="icon"
        variant="floating"
      >
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="gap-2.5 bg-transparent! [&>svg]:size-8"
                render={<a href="/#" />}
                size="lg"
              >
                <LogoSvg className="[&_rect:first-child]:fill-primary [&_rect]:fill-sidebar" />
                <span className="font-semibold text-xl">Payment</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Pages</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {pagesItems.map((item) =>
                  item.items ? (
                    <Collapsible className="group/collapsible" key={item.label}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger render={<SidebarMenuButton />}>
                          {item.icon}
                          <span>{item.label}</span>
                          <IconPlaceholder
                            className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90"
                            hugeicons="ArrowRight01Icon"
                            lucide="ChevronRightIcon"
                            phosphor="CaretRightIcon"
                            remixicon="RiArrowRightSLine"
                            tabler="IconChevronRight"
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.items.map((subItem) => (
                              <SidebarMenuSubItem key={subItem.label}>
                                <SidebarMenuSubButton
                                  className="justify-between"
                                  render={<a href={subItem.href} />}
                                >
                                  {subItem.label}
                                  {subItem.badge == null ? null : (
                                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 text-xs">
                                      {subItem.badge}
                                    </span>
                                  )}
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  ) : (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton render={<a href={item.href} />}>
                        {item.icon}
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.badge == null ? null : (
                        <SidebarMenuBadge className="top-1/2! right-2 -translate-y-1/2! rounded-full bg-primary/10">
                          {item.badge}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  )
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Recipients</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recipientsItems.map((recipient) => (
                  <SidebarMenuItem key={recipient.name}>
                    <SidebarMenuButton render={<a href={recipient.href} />}>
                      <Avatar className="size-6 transition-[width,height] duration-200 [[data-state=collapsed]_&]:size-4">
                        <AvatarImage
                          alt={recipient.name}
                          src={recipient.avatarSrc}
                        />
                        <AvatarFallback>
                          {recipient.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <span>{recipient.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarUserDropdown />
        </SidebarFooter>
      </Sidebar>
      <div className="z-1 flex flex-1 flex-col py-6">
        <header className="text-primary-foreground">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
            <div className="flex items-center gap-4">
              <MenuTrigger
                className="border-primary-foreground! bg-primary-foreground! text-primary! shadow-none"
                variant="outline"
              />
              <div className="hidden sm:flex sm:flex-col sm:items-start">
                <p className="font-semibold text-lg">Hey, John</p>
                <p className="text-primary-foreground/50 md:max-lg:hidden">
                  Welcome back to dashboard
                </p>
              </div>
            </div>
            <SearchDialog
              className="hidden w-full max-w-72 xl:block"
              trigger={
                <Button className="w-full justify-start bg-secondary/20 font-normal text-muted hover:bg-secondary/20 active:not-aria-[haspopup]:translate-y-0 aria-expanded:bg-secondary aria-expanded:text-muted">
                  <IconPlaceholder
                    className="size-4"
                    hugeicons="SearchIcon"
                    lucide="SearchIcon"
                    phosphor="MagnifyingGlassIcon"
                    remixicon="RiSearchLine"
                    tabler="IconSearch"
                  />
                  <span>Type to search...</span>
                </Button>
              }
            />
            <div className="flex items-center gap-1.5">
              <SearchDialog
                className="block xl:hidden"
                trigger={
                  <Button size="icon-lg" variant="ghost">
                    <IconPlaceholder
                      hugeicons="SearchIcon"
                      lucide="SearchIcon"
                      phosphor="MagnifyingGlassIcon"
                      remixicon="RiSearchLine"
                      tabler="IconSearch"
                    />
                    <span className="sr-only">Search</span>
                  </Button>
                }
              />
              <LanguageDropdown
                trigger={
                  <Button size="icon-lg" variant="ghost">
                    <IconPlaceholder
                      hugeicons="LanguageCircleIcon"
                      lucide="LanguagesIcon"
                      phosphor="TranslateIcon"
                      remixicon="RiTranslate2"
                      tabler="IconLanguage"
                    />
                  </Button>
                }
              />
              <ActivityDialog
                trigger={
                  <Button size="icon-lg" variant="ghost">
                    <IconPlaceholder
                      hugeicons="WaveTriangleIcon"
                      lucide="ActivityIcon"
                      phosphor="Pulse"
                      remixicon="RiPulseLine"
                      tabler="IconActivity"
                    />
                  </Button>
                }
              />
              <NotificationDropdown
                trigger={
                  <Button className="relative" size="icon-lg" variant="ghost">
                    <IconPlaceholder
                      hugeicons="Notification01Icon"
                      lucide="BellIcon"
                      phosphor="BellIcon"
                      remixicon="RiNotificationLine"
                      tabler="IconBell"
                    />
                    <span className="absolute top-[14%] right-[23%] size-2 rounded-full bg-destructive" />
                  </Button>
                }
              />
              <ProfileDropdown
                trigger={
                  <Button size="icon-lg" variant="ghost">
                    <Avatar className="size-[inherit] rounded-[inherit] after:rounded-[inherit]">
                      <AvatarImage
                        className="rounded-[inherit]"
                        src="https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png"
                      />
                      <AvatarFallback className="rounded-[inherit]">
                        JD
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                }
              />
            </div>
          </div>
        </header>
        <main className="mx-auto size-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="h-32">
              <CardContent className="h-full">
                <div className="h-full rounded-md border bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_1px,var(--card)_2px,var(--card)_15px)]" />
              </CardContent>
            </Card>
            <Card className="h-32">
              <CardContent className="h-full">
                <div className="h-full rounded-md border bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_1px,var(--card)_2px,var(--card)_15px)]" />
              </CardContent>
            </Card>
            <Card className="h-32">
              <CardContent className="h-full">
                <div className="h-full rounded-md border bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_1px,var(--card)_2px,var(--card)_15px)]" />
              </CardContent>
            </Card>
          </div>
          <Card className="h-250">
            <CardContent className="h-full">
              <div className="h-full rounded-md border bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_1px,var(--card)_2px,var(--card)_15px)]" />
            </CardContent>
          </Card>
        </main>
        <footer>
          <div className="mx-auto flex size-full max-w-7xl items-center justify-between gap-3 px-4 text-muted-foreground max-sm:flex-col sm:gap-6 sm:px-6">
            <p className="text-balance text-sm max-sm:text-center">
              {`©${new Date().getFullYear()}`}{" "}
              <a className="text-primary" href="/#">
                shadcn/studio
              </a>
              , Made for better web design
            </p>
            <div className="flex items-center gap-5">
              <a href="/#">
                <FacebookIcon className="size-4" />
              </a>
              <a href="/#">
                <InstagramIcon className="size-4" />
              </a>
              <a href="/#">
                <LinkedinIcon className="size-4" />
              </a>
              <a href="/#">
                <TwitterIcon className="size-4" />
              </a>
            </div>
          </div>
        </footer>
      </div>
    </SidebarProvider>
  </div>
);

export default ApplicationShell;
