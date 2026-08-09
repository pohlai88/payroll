/**
 * @feature shell
 * @layer ui
 *
 * ⌘K command palette — navigation only in Phase 5B (see design doc §3.3).
 * Destinations come from `app-nav` via ShellNavProvider (not a second list).
 */

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useShellNav } from "./shell-nav-context";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { items, navigateTo } = useShellNav();

  return (
    <CommandDialog onOpenChange={onOpenChange} open={open}>
      <CommandInput placeholder="Search or jump…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {items.map((item) => (
            <CommandItem
              key={item.id}
              onSelect={() => {
                navigateTo(item.href);
                onOpenChange(false);
              }}
              value={`${item.label} ${item.href}`}
            >
              <item.icon className="size-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export { CommandPalette };
