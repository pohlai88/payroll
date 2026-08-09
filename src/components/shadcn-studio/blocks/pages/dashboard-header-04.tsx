import ActivityDialog from "@/components/shadcn-studio/blocks/dialog-activity";
import SearchDialog from "@/components/shadcn-studio/blocks/dialog-search";
import LanguageDropdown from "@/components/shadcn-studio/blocks/dropdown-language";
import NotificationDropdown from "@/components/shadcn-studio/blocks/dropdown-notification";
import ProfileDropdown from "@/components/shadcn-studio/blocks/dropdown-profile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { IconPlaceholder } from "@/registry/icons/icon-placeholder";

const Header = () => (
  <div className="flex min-h-dvh w-full">
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <div className="m-6 h-full rounded-md border border-sidebar-foreground/10 bg-[repeating-linear-gradient(45deg,color-mix(in_oklab,var(--sidebar-foreground)10%,transparent),color-mix(in_oklab,var(--sidebar-foreground)10%,transparent)_1px,var(--sidebar)_2px,var(--sidebar)_15px)]" />
      </Sidebar>
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-50 flex items-center justify-between gap-6 border-b bg-card px-4 py-2 sm:px-6">
          <div className="flex items-center gap-4">
            <SidebarTrigger className="[&_svg]:size-5!" />
            <Separator
              className="hidden h-4! data-vertical:self-center sm:block md:max-lg:hidden"
              orientation="vertical"
            />
            <SearchDialog
              className="w-full max-w-72"
              trigger={
                <>
                  <Button
                    className="w-full justify-start bg-transparent! font-normal text-muted-foreground! active:not-aria-[haspopup]:translate-y-0 max-lg:hidden"
                    variant="ghost"
                  >
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

                  <Button className="lg:hidden" size="icon" variant="ghost">
                    <IconPlaceholder
                      hugeicons="SearchIcon"
                      lucide="SearchIcon"
                      phosphor="MagnifyingGlassIcon"
                      remixicon="RiSearchLine"
                      tabler="IconSearch"
                    />
                    <span className="sr-only">Search</span>
                  </Button>
                </>
              }
            />
          </div>
          <div className="flex items-center gap-1.5">
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
                <Button
                  className="h-full gap-2 border-0 p-0! hover:bg-transparent focus:bg-transparent focus-visible:ring-0 aria-expanded:bg-transparent"
                  variant="ghost"
                >
                  <Avatar
                    className="rounded-lg after:rounded-[inherit]"
                    size="lg"
                  >
                    <AvatarImage
                      className="rounded-[inherit]"
                      src="https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-8.png"
                    />
                    <AvatarFallback className="rounded-[inherit]">
                      JD
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden flex-col items-start gap-0.5 sm:flex">
                    <span className="font-medium text-sm">John Doe</span>
                    <span className="text-muted-foreground text-xs">Admin</span>
                  </div>
                </Button>
              }
            />
          </div>
        </header>
        <main className="size-full flex-1 px-4 py-6 sm:px-6">
          <Card className="h-250">
            <CardContent className="h-full">
              <div className="h-full rounded-md border border-card-foreground/10 bg-[repeating-linear-gradient(45deg,color-mix(in_oklab,var(--card-foreground)10%,transparent),color-mix(in_oklab,var(--card-foreground)10%,transparent)_1px,var(--card)_2px,var(--card)_15px)]" />
            </CardContent>
          </Card>
        </main>
        <footer className="h-10 border-t bg-card px-4 sm:px-6">
          <div className="h-full border-card-foreground/10 bg-[repeating-linear-gradient(45deg,color-mix(in_oklab,var(--card-foreground)10%,transparent),color-mix(in_oklab,var(--card-foreground)10%,transparent)_1px,var(--card)_2px,var(--card)_15px)]" />
        </footer>
      </div>
    </SidebarProvider>
  </div>
);

export default Header;
