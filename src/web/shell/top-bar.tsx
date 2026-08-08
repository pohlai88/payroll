/**
 * Top bar — logo, company scope selector, reporting-month picker, ⌘K
 * trigger, user menu. See design doc §3.1. Full-width, `bg-primary`.
 */

import {
  CheckIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
} from "lucide-react";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useState } from "react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/web/context/auth-context";
import { useScopeContext } from "@/web/context/scope-context";
import { CommandPalette } from "./command-palette";

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

function useIsDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
  };
  return [dark, toggle];
}

function TopBar() {
  const { me, signOut } = useAuthContext();
  const { scope, reportingMonth, setScope, setReportingMonth } =
    useScopeContext();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [dark, toggleDark] = useIsDarkMode();

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
        // Disallow silently falling back to "all" — see ScopeContext contract.
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
    <header className="flex h-12 shrink-0 items-center gap-3 border-primary-foreground/20 border-b bg-primary px-4 text-primary-foreground">
      <span className="shrink-0 font-heading font-semibold text-sm">
        Clarity Payroll
      </span>

      <div className="mx-2 h-5 w-px bg-primary-foreground/20" />

      <Popover onOpenChange={setScopeOpen} open={scopeOpen}>
        <PopoverTrigger
          render={
            <Button
              className="h-8 max-w-56 gap-1 truncate border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
              size="sm"
              variant="outline"
            />
          }
        >
          <span className="truncate text-xs">{scopeLabel}</span>
          <ChevronsUpDownIcon className="size-3 shrink-0" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
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
                      onSelect={toggleCompany}
                      value={company.id}
                    >
                      <CheckIcon
                        className={cn(
                          "mr-2 size-4",
                          checked ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {company.name}
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
              className="h-8 border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
              size="sm"
              variant="outline"
            />
          }
        >
          <span className="text-xs">
            {formatReportingMonth(reportingMonth)}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
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

      <div className="flex-1" />

      <Button
        className="h-8 gap-2 border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
        onClick={openCommandPalette}
        size="sm"
        type="button"
        variant="outline"
      >
        <SearchIcon className="size-3" />
        <span className="hidden text-xs sm:inline">Search or jump…</span>
        <Badge className="ml-1 border-0 bg-primary-foreground/20 px-1 py-0 text-primary-foreground text-xs">
          ⌘K
        </Badge>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button aria-label="User menu" className="ml-1" type="button" />
          }
        >
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground text-xs">
              {initialsOf(me)}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            <p className="font-medium text-sm">{me?.name ?? me?.email}</p>
            <p className="text-muted-foreground text-xs">{me?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={toggleDark}>
            {dark ? (
              <SunIcon className="size-4" />
            ) : (
              <MoonIcon className="size-4" />
            )}
            {dark ? "Use light theme" : "Use dark theme"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} variant="destructive">
            <LogOutIcon className="size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CommandPalette onOpenChange={setCmdOpen} open={cmdOpen} />
    </header>
  );
}

export { TopBar };
