/**
 * @feature shell
 * @layer ui
 *
 * Top bar — MenuTrigger (application-shell-05) + scope / reporting month /
 * ⌘K search (dashboard-header-04 patterns) + user menu.
 */

import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import SimpleProfileDropdown from "@/components/shadcn-studio/blocks/dashboard-dropdown-10/simple-profile-dropdown";
import MenuTrigger from "@/components/shadcn-studio/blocks/menu-trigger";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/web/context/auth-context";
import { useScopeContext } from "@/web/context/scope-context";
import { CommandPalette } from "./command-palette";
import { ShellBreadcrumb } from "./shell-breadcrumb";

function formatReportingMonth(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (year === undefined || month === undefined || Number.isNaN(year)) {
    return value;
  }
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function initialsOf(me: { name: string; email: string } | null): string {
  if (me === null) {
    return "??";
  }
  const source = me.name.trim() === "" ? me.email : me.name;
  return source.slice(0, 2).toUpperCase();
}

function computeScopeLabel(
  allSelected: boolean,
  selectedNames: readonly string[]
): string {
  if (allSelected) {
    return "All Companies";
  }
  if (selectedNames.length === 0) {
    return "Select at least one company";
  }
  const shown = selectedNames.slice(0, 3).join(", ");
  const remainder = selectedNames.length - 3;
  return remainder > 0 ? `${shown} +${remainder} more` : shown;
}

function firstNameOf(me: { name: string; email: string } | null): string {
  if (me === null) {
    return "there";
  }
  const name = me.name.trim();
  if (name === "") {
    return me.email.split("@")[0] || "there";
  }
  return name.split(/\s+/)[0] ?? name;
}

function TopBar() {
  const { me, signOut } = useAuthContext();
  const { scope, reportingMonth, setScope, setReportingMonth } =
    useScopeContext();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [dark, toggleDark] = useDarkMode();

  const companies = me?.companies ?? [];
  const selectedIds = scope.mode === "selected" ? scope.companyIds : [];
  const allSelected = scope.mode === "all";

  const toggleCompany = useCallback(
    (id: string) => {
      if (allSelected) {
        setScope({ mode: "selected", companyIds: [id] });
        return;
      }
      const next = selectedIds.includes(id)
        ? selectedIds.filter((c) => c !== id)
        : [...selectedIds, id];
      if (next.length === 0) {
        return;
      }
      setScope({ mode: "selected", companyIds: next });
    },
    [allSelected, selectedIds, setScope]
  );

  const selectAll = useCallback(() => setScope({ mode: "all" }), [setScope]);

  const openCommandPalette = useCallback(() => setCmdOpen(true), []);

  const onReportingMonthChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.currentTarget.value !== "") {
        setReportingMonth(event.currentTarget.value);
      }
    },
    [setReportingMonth]
  );

  const selectedNames = companies
    .filter((c) => selectedIds.includes(c.id))
    .map((c) => c.name);
  const scopeLabel = computeScopeLabel(allSelected, selectedNames);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setCmdOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <header className="text-primary-foreground">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <MenuTrigger
            className="border-primary-foreground! bg-primary-foreground! text-primary! shadow-none hover:bg-primary-foreground/90! hover:text-primary! aria-expanded:bg-primary-foreground/90! aria-expanded:text-primary!"
            variant="outline"
          />
          <div className="hidden min-w-0 sm:flex sm:flex-col sm:items-start">
            <p className="truncate font-semibold text-lg">
              Hey, {firstNameOf(me)}
            </p>
            <ShellBreadcrumb />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
          <Popover onOpenChange={setScopeOpen} open={scopeOpen}>
            <PopoverTrigger
              render={
                <Button
                  className="h-8 max-w-48 gap-1 truncate border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground aria-expanded:bg-primary-foreground/20 aria-expanded:text-primary-foreground"
                  size="sm"
                  variant="outline"
                />
              }
            >
              <span className="truncate text-xs">{scopeLabel}</span>
              <ChevronsUpDownIcon className="size-3 shrink-0" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-0">
              <Command>
                <CommandInput placeholder="Search companies…" />
                <CommandList>
                  <CommandEmpty>No companies found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem onSelect={selectAll} value="__all__">
                      <CheckIcon
                        className={cn(
                          "mr-2 size-4",
                          allSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      All Companies
                    </CommandItem>
                    {companies.map((company) => {
                      const checked = selectedIds.includes(company.id);
                      return (
                        <CommandItem
                          key={company.id}
                          onSelect={() => {
                            toggleCompany(company.id);
                          }}
                          value={`${company.code} ${company.name}`}
                        >
                          <CheckIcon
                            className={cn(
                              "mr-2 size-4",
                              checked ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate">{company.name}</span>
                            <span className="truncate font-mono text-muted-foreground text-xs">
                              {company.code}
                            </span>
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Popover onOpenChange={setMonthOpen} open={monthOpen}>
            <PopoverTrigger
              render={
                <Button
                  className="h-8 border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground aria-expanded:bg-primary-foreground/20 aria-expanded:text-primary-foreground"
                  size="sm"
                  variant="outline"
                />
              }
            >
              <span className="text-xs">
                {formatReportingMonth(reportingMonth)}
              </span>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-3">
              <label
                className="flex flex-col gap-1.5 text-xs"
                htmlFor="reporting-month"
              >
                <span className="text-muted-foreground">Reporting month</span>
                <input
                  className="rounded-md border border-input bg-background px-2 py-1 text-foreground text-sm"
                  id="reporting-month"
                  onChange={onReportingMonthChange}
                  type="month"
                  value={reportingMonth}
                />
              </label>
            </PopoverContent>
          </Popover>

          <Button
            className="h-8 gap-2 border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground aria-expanded:bg-primary-foreground/20 aria-expanded:text-primary-foreground"
            onClick={openCommandPalette}
            size="sm"
            type="button"
            variant="outline"
          >
            <SearchIcon className="size-3" />
            <span className="hidden text-xs lg:inline">Search or jump…</span>
            <Badge className="ml-1 border-0 bg-primary-foreground/20 px-1 py-0 text-primary-foreground text-xs">
              ⌘K
            </Badge>
          </Button>

          <SimpleProfileDropdown
            dark={dark}
            email={me?.email ?? "—"}
            initials={initialsOf(me)}
            name={me?.name ?? me?.email ?? "—"}
            onSignOut={signOut}
            onToggleTheme={toggleDark}
            trigger={
              <Button
                aria-label="User menu"
                className="ml-0.5 size-8 rounded-full border-0 bg-transparent p-0 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground aria-expanded:bg-primary-foreground/15 aria-expanded:text-primary-foreground"
                size="icon"
                type="button"
                variant="ghost"
              >
                <Avatar className="size-8 after:border-primary-foreground/35">
                  <AvatarFallback className="bg-primary-foreground/15 text-primary-foreground text-xs">
                    {initialsOf(me)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            }
          />
        </div>
      </div>

      <CommandPalette onOpenChange={setCmdOpen} open={cmdOpen} />
    </header>
  );
}

export { TopBar };
