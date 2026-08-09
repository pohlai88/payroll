/**
 * @feature admin-users
 * @layer ui
 * @hub src/server/routes/admin-users.ts
 *
 * Advanced admin users datatable — studio datatable-component-04/06 DNA
 * extended with: a column chooser validated against `AdminUserRow` (mirrors
 * the `users` DB schema + role join), multi-select filters, bulk row
 * selection, drag-to-reorder columns, pinnable columns, expandable role
 * sub-rows, CSV/JSON/Excel export, and click-to-edit name/email/status cells.
 */

import type {
  ColumnFiltersState,
  ColumnOrderState,
  ColumnPinningState,
  ColumnVisibilityState,
  PaginationState,
  RowSelectionState,
} from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import type {
  LegacyColumnDef as ColumnDef,
  LegacyHeader,
  LegacyRow,
} from "@tanstack/react-table/legacy";
import {
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useLegacyTable,
} from "@tanstack/react-table/legacy";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ColumnsIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  FileJsonIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  GripVerticalIcon,
  Link2Icon,
  Link2OffIcon,
  PinIcon,
  PinOffIcon,
  PowerIcon,
  PowerOffIcon,
  RefreshCcwIcon,
  SearchIcon,
  UserCogIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePagination } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";
import type { AdminUserRow } from "@/web/api/types";

const WHITESPACE_REGEX = /\s+/;

function initials(name: string): string {
  const parts = name.trim().split(WHITESPACE_REGEX).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}

function statusBadgeClass(status: string): string {
  const key = status.toLowerCase();
  if (key === "active" || key === "accepted" || key === "enabled") {
    return "bg-secondary text-secondary-foreground";
  }
  if (key === "pending" || key === "invited") {
    return "bg-muted text-foreground";
  }
  if (key === "disabled" || key === "revoked" || key === "inactive") {
    return "bg-destructive/10 text-destructive";
  }
  return "bg-muted text-muted-foreground";
}

// ---------------------------------------------------------------------------
// Column catalog — every toggleable column id must be a key of `AdminUserRow`
// (or the explicitly derived "linked" id). If the DTO changes shape, this
// mapping fails to compile, so the chooser can never drift from the backend.
// ---------------------------------------------------------------------------
const TOGGLEABLE_COLUMN_LABELS = {
  name: "Name",
  email: "Email",
  status: "Status",
  roles: "Roles",
  linked: "Auth link",
  authSubject: "Auth subject",
  createdAt: "Created",
  id: "Id",
} as const;

type ToggleableColumnId = keyof typeof TOGGLEABLE_COLUMN_LABELS;

type _AssertColumnsMatchSchema =
  Exclude<ToggleableColumnId, "linked"> extends keyof AdminUserRow
    ? true
    : never;
const _assertColumnsMatchSchema: _AssertColumnsMatchSchema = true;

const TOGGLEABLE_COLUMN_IDS = Object.keys(
  TOGGLEABLE_COLUMN_LABELS
) as ToggleableColumnId[];

const STRUCTURAL_COLUMN_IDS = ["select", "expand", "actions"] as const;

const DEFAULT_COLUMN_ORDER: string[] = [
  "select",
  "expand",
  "name",
  "email",
  "status",
  "roles",
  "linked",
  "authSubject",
  "createdAt",
  "id",
  "actions",
];

// ---------------------------------------------------------------------------
// Editable cells
// ---------------------------------------------------------------------------

function EditableTextCell({
  value,
  onCommit,
  className,
}: {
  readonly value: string;
  readonly onCommit?: (next: string) => void;
  readonly className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  const startEdit = useCallback(() => {
    if (onCommit === undefined) {
      return;
    }
    setDraft(value);
    setEditing(true);
  }, [onCommit, value]);

  const commit = useCallback(() => {
    setEditing(false);
    const next = draft.trim();
    if (next.length > 0 && next !== value) {
      onCommit?.(next);
    }
  }, [draft, onCommit, value]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(value);
  }, [value]);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.currentTarget.value);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        commit();
      } else if (event.key === "Escape") {
        cancel();
      }
    },
    [cancel, commit]
  );

  if (editing) {
    return (
      <Input
        className="h-8 min-w-0 flex-1"
        onBlur={commit}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        ref={inputRef}
        value={draft}
      />
    );
  }

  return (
    <button
      className={cn(
        "min-w-0 flex-1 truncate rounded px-1 text-left",
        onCommit === undefined ? "" : "hover:bg-muted/60",
        className
      )}
      onClick={startEdit}
      type="button"
    >
      {value}
    </button>
  );
}

/** Mirrors `EditableSelectCell` from shadcn-studio's editable-datatable block. */
const STATUS_SELECT_ITEMS = [
  { label: "Active", value: "ACTIVE" },
  { label: "Disabled", value: "DISABLED" },
] as const;

function EditableStatusCell({
  status,
  onCommit,
}: {
  readonly status: string;
  readonly onCommit?: (next: "ACTIVE" | "DISABLED") => void;
}) {
  const handleValueChange = useCallback(
    (next: string | null) => {
      if (next !== null && next !== status) {
        onCommit?.(next as "ACTIVE" | "DISABLED");
      }
    },
    [onCommit, status]
  );

  const badgeClass = cn(
    "h-auto rounded-sm border-none capitalize focus-visible:outline-none",
    statusBadgeClass(status)
  );

  if (onCommit === undefined) {
    return <Badge className={badgeClass}>{status}</Badge>;
  }

  return (
    <Select onValueChange={handleValueChange} value={status}>
      <SelectTrigger
        aria-label={`Change status (currently ${status})`}
        className={cn(badgeClass, "h-7 gap-1 px-2 py-0.5 text-xs")}
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_SELECT_ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Row actions + selection
// ---------------------------------------------------------------------------

interface UserRowHandlers {
  readonly onManage?: (user: AdminUserRow) => void;
  readonly onStatusChange?: (
    user: AdminUserRow,
    status: "ACTIVE" | "DISABLED"
  ) => void;
  readonly onUpdateUser?: (
    user: AdminUserRow,
    patch: { name?: string; email?: string }
  ) => void;
}

function RowActions({
  user,
  onManage,
  onStatusChange,
}: Pick<UserRowHandlers, "onManage" | "onStatusChange"> & {
  user: AdminUserRow;
}) {
  const isActive = user.status.toLowerCase() === "active";

  const handleManage = useCallback(() => {
    onManage?.(user);
  }, [onManage, user]);

  const handleToggleStatus = useCallback(() => {
    onStatusChange?.(user, isActive ? "DISABLED" : "ACTIVE");
  }, [isActive, onStatusChange, user]);

  if (onManage === undefined && onStatusChange === undefined) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${user.email}`}
        className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <EllipsisVerticalIcon aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {onManage === undefined ? null : (
            <DropdownMenuItem onClick={handleManage}>
              <UserCogIcon className="size-4" />
              Manage
            </DropdownMenuItem>
          )}
          {onStatusChange === undefined ? null : (
            <DropdownMenuItem onClick={handleToggleStatus}>
              {isActive ? (
                <PowerOffIcon className="size-4" />
              ) : (
                <PowerIcon className="size-4" />
              )}
              {isActive ? "Disable" : "Enable"}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SelectAllCheckbox({
  table,
}: {
  table: {
    getIsAllPageRowsSelected: () => boolean;
    toggleAllPageRowsSelected: (value: boolean) => void;
  };
}) {
  const handleChange = useCallback(
    (value: boolean | "indeterminate") => {
      table.toggleAllPageRowsSelected(value === true);
    },
    [table]
  );

  return (
    <Checkbox
      aria-label="Select all rows"
      checked={table.getIsAllPageRowsSelected()}
      onCheckedChange={handleChange}
    />
  );
}

function SelectRowCheckbox({ row }: { row: LegacyRow<AdminUserRow> }) {
  const handleChange = useCallback(
    (value: boolean | "indeterminate") => {
      row.toggleSelected(value === true);
    },
    [row]
  );

  return (
    <Checkbox
      aria-label={`Select ${row.original.email}`}
      checked={row.getIsSelected()}
      onCheckedChange={handleChange}
    />
  );
}

function ExpandRowButton({
  userId,
  expanded,
  onToggleExpand,
}: {
  readonly userId: string;
  readonly expanded: boolean;
  readonly onToggleExpand: (userId: string) => void;
}) {
  const handleClick = useCallback(() => {
    onToggleExpand(userId);
  }, [onToggleExpand, userId]);

  return (
    <Button
      aria-expanded={expanded}
      aria-label={expanded ? "Collapse roles" : "Expand roles"}
      className="size-7"
      onClick={handleClick}
      size="icon"
      type="button"
      variant="ghost"
    >
      {expanded ? (
        <ChevronUpIcon className="size-4" />
      ) : (
        <ChevronDownIcon className="size-4" />
      )}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

interface BuildColumnsArgs extends UserRowHandlers {
  readonly expandedIds: ReadonlySet<string>;
  readonly onToggleExpand: (userId: string) => void;
}

function buildColumns(args: BuildColumnsArgs): ColumnDef<AdminUserRow>[] {
  const {
    onManage,
    onStatusChange,
    onUpdateUser,
    expandedIds,
    onToggleExpand,
  } = args;

  return [
    {
      id: "select",
      header: ({ table }) => <SelectAllCheckbox table={table} />,
      cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => (
        <SelectRowCheckbox row={row} />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      id: "expand",
      header: "",
      enableSorting: false,
      enableHiding: false,
      size: 40,
      cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => (
        <ExpandRowButton
          expanded={expandedIds.has(row.original.id)}
          onToggleExpand={onToggleExpand}
          userId={row.original.id}
        />
      ),
    },
    {
      id: "name",
      header: "Name",
      accessorFn: (row: AdminUserRow) => row.name,
      cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className="size-9 shrink-0">
            <AvatarFallback className="text-xs">
              {initials(row.original.name)}
            </AvatarFallback>
          </Avatar>
          <EditableTextCell
            className="font-medium"
            onCommit={
              onUpdateUser === undefined
                ? undefined
                : (next) => onUpdateUser(row.original, { name: next })
            }
            value={row.original.name}
          />
        </div>
      ),
      size: 240,
    },
    {
      id: "email",
      header: "Email",
      accessorFn: (row: AdminUserRow) => row.email,
      cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => (
        <EditableTextCell
          className="text-muted-foreground text-sm"
          onCommit={
            onUpdateUser === undefined
              ? undefined
              : (next) => onUpdateUser(row.original, { email: next })
          }
          value={row.original.email}
        />
      ),
      size: 260,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row: AdminUserRow) => row.status,
      size: 130,
      filterFn: (row, columnId, filterValue: string[]) =>
        filterValue.length === 0 ||
        filterValue.includes(String(row.getValue(columnId))),
      cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => (
        <EditableStatusCell
          onCommit={
            onStatusChange === undefined
              ? undefined
              : (next) => onStatusChange(row.original, next)
          }
          status={row.original.status}
        />
      ),
    },
    {
      id: "roles",
      header: "Roles",
      accessorFn: (row: AdminUserRow) =>
        row.roles.map((r) => r.roleCode).join(","),
      size: 220,
      enableSorting: false,
      filterFn: (row, _columnId, filterValue: string[]) =>
        filterValue.length === 0 ||
        row.original.roles.some((r) => filterValue.includes(r.roleCode)),
      cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => {
        const { roles } = row.original;
        if (roles.length === 0) {
          return <span className="text-muted-foreground text-sm">—</span>;
        }
        const visible = roles.slice(0, 2);
        const hiddenCount = roles.length - visible.length;
        return (
          <div className="flex items-center gap-1 overflow-hidden">
            {visible.map((r) => (
              <Badge
                className="shrink-0 rounded-sm"
                key={`${r.roleCode}-${r.companyId ?? "global"}`}
                variant="secondary"
              >
                {r.roleCode}
              </Badge>
            ))}
            {hiddenCount > 0 && (
              <Badge className="shrink-0 rounded-sm" variant="outline">
                +{String(hiddenCount)}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: "linked",
      header: "Auth link",
      accessorFn: (row: AdminUserRow) =>
        row.authSubject === null ? "unlinked" : "linked",
      size: 130,
      filterFn: (row, columnId, filterValue: string[]) =>
        filterValue.length === 0 ||
        filterValue.includes(String(row.getValue(columnId))),
      cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => {
        const linked = row.original.authSubject !== null;
        return (
          <div className="flex items-center gap-2 text-sm">
            {linked ? (
              <Link2Icon className="size-4 shrink-0 text-secondary-foreground" />
            ) : (
              <Link2OffIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate text-muted-foreground">
              {linked ? "Linked" : "Unlinked"}
            </span>
          </div>
        );
      },
    },
    {
      id: "authSubject",
      header: "Auth subject",
      accessorFn: (row: AdminUserRow) => row.authSubject ?? "",
      size: 200,
      enableSorting: false,
      cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => (
        <code className="block truncate text-xs">
          {row.original.authSubject ?? "—"}
        </code>
      ),
    },
    {
      id: "createdAt",
      header: "Created",
      accessorFn: (row: AdminUserRow) => row.createdAt,
      size: 120,
      cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => (
        <span className="truncate text-muted-foreground text-sm">
          {new Date(row.original.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "id",
      header: "Id",
      accessorFn: (row: AdminUserRow) => row.id,
      size: 160,
      enableSorting: false,
      cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => (
        <code className="block truncate text-xs">{row.original.id}</code>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      size: 56,
      cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => (
        <RowActions
          onManage={onManage}
          onStatusChange={onStatusChange}
          user={row.original}
        />
      ),
    },
  ];
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const EXPORT_FIELDS = [
  "id",
  "name",
  "email",
  "status",
  "authSubject",
  "createdAt",
] as const satisfies readonly (keyof AdminUserRow)[];

function exportRowsValue(
  user: AdminUserRow,
  field: (typeof EXPORT_FIELDS)[number]
): string {
  const value = user[field];
  return value === null ? "" : String(value);
}

function rolesSummary(user: AdminUserRow): string {
  return user.roles.map((r) => r.roleCode).join("; ");
}

const CSV_NEEDS_QUOTING_REGEX = /[",\n]/;
const CSV_QUOTE_REGEX = /"/g;

function csvEscape(value: string): string {
  if (CSV_NEEDS_QUOTING_REGEX.test(value)) {
    return `"${value.replace(CSV_QUOTE_REGEX, '""')}"`;
  }
  return value;
}

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportCsv(users: readonly AdminUserRow[]): void {
  const header = [...EXPORT_FIELDS, "roles"];
  const lines = [header.join(",")];
  for (const user of users) {
    const cells = [
      ...EXPORT_FIELDS.map((field) => csvEscape(exportRowsValue(user, field))),
      csvEscape(rolesSummary(user)),
    ];
    lines.push(cells.join(","));
  }
  downloadFile("admin-users.csv", lines.join("\n"), "text/csv;charset=utf-8");
}

function exportJson(users: readonly AdminUserRow[]): void {
  downloadFile(
    "admin-users.json",
    JSON.stringify(users, null, 2),
    "application/json;charset=utf-8"
  );
}

/** Excel opens an HTML table saved with an .xls extension natively — no extra dependency needed. */
function exportExcel(users: readonly AdminUserRow[]): void {
  const header = [...EXPORT_FIELDS, "roles"];
  const headerRow = header.map((h) => `<th>${h}</th>`).join("");
  const bodyRows = users
    .map((user) => {
      const cells = [
        ...EXPORT_FIELDS.map(
          (field) => `<td>${exportRowsValue(user, field)}</td>`
        ),
        `<td>${rolesSummary(user)}</td>`,
      ].join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  const html = `<html><head><meta charset="utf-8" /></head><body><table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
  downloadFile("admin-users.xls", html, "application/vnd.ms-excel");
}

function ExportMenu({ rows }: { readonly rows: readonly AdminUserRow[] }) {
  const handleCsv = useCallback(() => exportCsv(rows), [rows]);
  const handleJson = useCallback(() => exportJson(rows), [rows]);
  const handleExcel = useCallback(() => exportExcel(rows), [rows]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant="outline">
            <DownloadIcon />
            Export
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleCsv}>
          <FileTextIcon className="size-4" />
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExcel}>
          <FileSpreadsheetIcon className="size-4" />
          Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleJson}>
          <FileJsonIcon className="size-4" />
          JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Column chooser
// ---------------------------------------------------------------------------

function ColumnChooserItem({
  columnId,
  visible,
  onToggle,
}: {
  readonly columnId: ToggleableColumnId;
  readonly visible: boolean;
  readonly onToggle: (columnId: ToggleableColumnId, visible: boolean) => void;
}) {
  const handleCheckedChange = useCallback(
    (checked: boolean | "indeterminate") => {
      onToggle(columnId, checked === true);
    },
    [columnId, onToggle]
  );

  const handleSelect = useCallback((event: { preventDefault: () => void }) => {
    event.preventDefault();
  }, []);

  return (
    <DropdownMenuCheckboxItem
      checked={visible}
      onCheckedChange={handleCheckedChange}
      onSelect={handleSelect}
    >
      {TOGGLEABLE_COLUMN_LABELS[columnId]}
    </DropdownMenuCheckboxItem>
  );
}

function ColumnChooser({
  visibility,
  onToggle,
  onReset,
}: {
  readonly visibility: ColumnVisibilityState;
  readonly onToggle: (columnId: ToggleableColumnId, visible: boolean) => void;
  readonly onReset: () => void;
}) {
  const [search, setSearch] = useState("");

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearch(event.currentTarget.value);
    },
    []
  );

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
    },
    []
  );

  const handleReset = useCallback(() => {
    onReset();
    setSearch("");
  }, [onReset]);

  const query = search.trim().toLowerCase();
  const visibleIds = TOGGLEABLE_COLUMN_IDS.filter((columnId) =>
    query === ""
      ? true
      : TOGGLEABLE_COLUMN_LABELS[columnId].toLowerCase().includes(query)
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant="outline">
            <ColumnsIcon />
            Columns
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <div className="relative px-1 pb-1">
          <Input
            className="pl-8"
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search columns…"
            value={search}
          />
          <SearchIcon className="absolute inset-y-0 left-3 my-auto size-4 text-muted-foreground" />
        </div>
        <DropdownMenuSeparator />
        {visibleIds.length === 0 ? (
          <p className="px-2 py-1.5 text-muted-foreground text-sm">
            No columns match “{search}”.
          </p>
        ) : (
          visibleIds.map((columnId) => (
            <ColumnChooserItem
              columnId={columnId}
              key={columnId}
              onToggle={onToggle}
              visible={visibility[columnId] !== false}
            />
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleReset}>
          <RefreshCcwIcon className="size-4" />
          Reset
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Multi-select filter (status / roles / auth link)
// ---------------------------------------------------------------------------

function MultiSelectOption({
  option,
  selected,
  onToggle,
}: {
  readonly option: string;
  readonly selected: boolean;
  readonly onToggle: (option: string) => void;
}) {
  const id = useId();

  const handleCheckedChange = useCallback(() => {
    onToggle(option);
  }, [onToggle, option]);

  return (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm capitalize hover:bg-muted"
      htmlFor={id}
    >
      <Checkbox
        checked={selected}
        id={id}
        onCheckedChange={handleCheckedChange}
      />
      {option}
    </label>
  );
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly string[];
  readonly selected: readonly string[];
  readonly onChange: (next: string[]) => void;
}) {
  const toggleValue = useCallback(
    (value: string) => {
      onChange(
        selected.includes(value)
          ? selected.filter((v) => v !== value)
          : [...selected, value]
      );
    },
    [onChange, selected]
  );

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          buttonVariants({ size: "sm", variant: "outline" }),
          "w-full justify-between capitalize sm:w-auto"
        )}
      >
        {label}
        {selected.length > 0 && (
          <Badge className="rounded-sm" variant="secondary">
            {String(selected.length)}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {options.map((option) => (
          <MultiSelectOption
            key={option}
            onToggle={toggleValue}
            option={option}
            selected={selected.includes(option)}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Sub-row (expanded role detail)
// ---------------------------------------------------------------------------

function RoleSubRow({
  user,
  colSpan,
}: {
  readonly user: AdminUserRow;
  readonly colSpan: number;
}) {
  return (
    <TableRow className="bg-muted/30">
      <TableCell className="py-3 pl-14" colSpan={colSpan}>
        {user.roles.length === 0 ? (
          <p className="text-muted-foreground text-sm">No role assignments.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {user.roles.map((role) => (
              <div
                className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1 text-xs"
                key={`${role.roleCode}-${role.companyId ?? "global"}`}
              >
                <span className="font-medium">{role.roleName}</span>
                <span className="text-muted-foreground">
                  {role.companyId === null
                    ? "GLOBAL"
                    : `company ${role.companyId.slice(0, 8)}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Draggable + pinnable header cell
// ---------------------------------------------------------------------------

function pinClass(pinned: false | "start" | "end"): string {
  if (pinned === false) {
    return "";
  }
  return "sticky z-10 bg-background";
}

/**
 * Cumulative px offset for a pinned column, so multiple start/end-pinned
 * columns stack correctly instead of all landing on `left: 0`/`right: 0`.
 */
function pinOffsetStyle(
  table: {
    getStartVisibleLeafColumns: () => { id: string; getSize: () => number }[];
    getEndVisibleLeafColumns: () => { id: string; getSize: () => number }[];
  },
  column: { id: string; getIsPinned: () => false | "start" | "end" },
  size: number
): { width: string; left?: string; right?: string } {
  const pinned = column.getIsPinned();
  const base = { width: `${String(size)}px` };
  if (pinned === "start") {
    const cols = table.getStartVisibleLeafColumns();
    const index = cols.findIndex((c) => c.id === column.id);
    const offset = cols
      .slice(0, index)
      .reduce((sum, c) => sum + c.getSize(), 0);
    return { ...base, left: `${String(offset)}px` };
  }
  if (pinned === "end") {
    const cols = table.getEndVisibleLeafColumns();
    const index = cols.findIndex((c) => c.id === column.id);
    const offset = cols
      .slice(index + 1)
      .reduce((sum, c) => sum + c.getSize(), 0);
    return { ...base, right: `${String(offset)}px` };
  }
  return base;
}

function DraggableHeaderCell({
  header,
  draggable,
  onDragStartColumn,
  onDropColumn,
}: {
  readonly header: LegacyHeader<AdminUserRow, unknown>;
  readonly draggable: boolean;
  readonly onDragStartColumn: (columnId: string) => void;
  readonly onDropColumn: (columnId: string) => void;
}) {
  const pinned = header.column.getIsPinned();
  const canPin = header.column.getCanHide();

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer.setData("text/plain", header.column.id);
      onDragStartColumn(header.column.id);
    },
    [header.column.id, onDragStartColumn]
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      onDropColumn(header.column.id);
    },
    [header.column.id, onDropColumn]
  );

  const handlePinLeft = useCallback(() => {
    header.column.pin("start");
  }, [header.column]);

  const handlePinRight = useCallback(() => {
    header.column.pin("end");
  }, [header.column]);

  const handleUnpin = useCallback(() => {
    header.column.pin(false);
  }, [header.column]);

  if (header.isPlaceholder) {
    return null;
  }

  const label = flexRender(header.column.columnDef.header, header.getContext());
  const canSort = header.column.getCanSort();

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: HTML5 drag-and-drop reorder handle; the grip icon signals affordance and the header text stays keyboard/sort-operable.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: see above.
    <div
      className="flex h-full w-full items-center gap-1"
      draggable={draggable}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      onDrop={handleDrop}
    >
      {draggable ? (
        <GripVerticalIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 cursor-grab text-muted-foreground/60"
        />
      ) : null}
      {canSort ? (
        <button
          className="flex h-full flex-1 cursor-pointer select-none items-center justify-between gap-2 border-0 bg-transparent p-0 text-left font-inherit text-inherit"
          onClick={header.column.getToggleSortingHandler()}
          type="button"
        >
          {label}
          {
            {
              asc: (
                <ChevronUpIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 opacity-60"
                />
              ),
              desc: (
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 opacity-60"
                />
              ),
            }[header.column.getIsSorted() as string]
          }
        </button>
      ) : (
        <span className="flex-1 truncate">{label}</span>
      )}
      {canPin && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Pin options for ${header.column.id}`}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
          >
            {pinned ? (
              <PinIcon className="size-3" />
            ) : (
              <PinOffIcon className="size-3 opacity-0 group-hover:opacity-100" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handlePinLeft}>
              Pin left
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handlePinRight}>
              Pin right
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!pinned} onClick={handleUnpin}>
              Unpin
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table shell
// ---------------------------------------------------------------------------

interface UserDatatableProps {
  data: readonly AdminUserRow[];
  title?: string;
  onManage?: (user: AdminUserRow) => void;
  onStatusChange?: (user: AdminUserRow, status: "ACTIVE" | "DISABLED") => void;
  onBulkStatusChange?: (
    users: readonly AdminUserRow[],
    status: "ACTIVE" | "DISABLED"
  ) => void;
  onUpdateUser?: (
    user: AdminUserRow,
    patch: { name?: string; email?: string }
  ) => void;
}

function PaginationPageButton({
  page,
  isActive,
  onSelect,
}: {
  page: number;
  isActive: boolean;
  onSelect: (page: number) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect(page);
  }, [onSelect, page]);

  return (
    <PaginationItem key={page}>
      <Button
        aria-current={isActive ? "page" : undefined}
        className={
          isActive
            ? undefined
            : "bg-primary/10 text-primary hover:bg-primary/20 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40"
        }
        onClick={handleClick}
        size="icon"
        variant={isActive ? "default" : "ghost"}
      >
        {page}
      </Button>
    </PaginationItem>
  );
}

const UserDatatable = ({
  data,
  title = "Admin users",
  onManage,
  onStatusChange,
  onBulkStatusChange,
  onUpdateUser,
}: UserDatatableProps) => {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>({});
  const [columnOrder, setColumnOrder] =
    useState<ColumnOrderState>(DEFAULT_COLUMN_ORDER);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
    start: [],
    end: [],
  });
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const [globalQuery, setGlobalQuery] = useState("");
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const pageSize = 8;
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  const tableData = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (q === "") {
      return [...data];
    }
    return data.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q)
    );
  }, [data, globalQuery]);

  const handleToggleExpand = useCallback((userId: string) => {
    setExpandedIds((prev: ReadonlySet<string>) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const columns = useMemo(
    () =>
      buildColumns({
        onManage,
        onStatusChange,
        onUpdateUser,
        expandedIds,
        onToggleExpand: handleToggleExpand,
      }),
    [expandedIds, handleToggleExpand, onManage, onStatusChange, onUpdateUser]
  );

  const table = useLegacyTable({
    data: tableData,
    columns,
    state: {
      columnFilters,
      pagination,
      rowSelection,
      columnVisibility,
      columnOrder,
      columnPinning,
    },
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnPinningChange: setColumnPinning,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    enableSortingRemoval: false,
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
  });

  const visibleColumnCount = table.getVisibleFlatColumns().length;
  const filteredRows = table.getFilteredRowModel().rows.map((r) => r.original);
  const selectedUsers = table
    .getSelectedRowModel()
    .rows.map((row) => row.original);

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setGlobalQuery(event.currentTarget.value);
    },
    []
  );

  const handleBulkEnable = useCallback(() => {
    onBulkStatusChange?.(selectedUsers, "ACTIVE");
    setRowSelection({});
  }, [onBulkStatusChange, selectedUsers]);

  const handleBulkDisable = useCallback(() => {
    onBulkStatusChange?.(selectedUsers, "DISABLED");
    setRowSelection({});
  }, [onBulkStatusChange, selectedUsers]);

  const handleToggleColumn = useCallback(
    (columnId: ToggleableColumnId, visible: boolean) => {
      setColumnVisibility((prev) => ({ ...prev, [columnId]: visible }));
    },
    []
  );

  const handleResetColumns = useCallback(() => {
    setColumnVisibility({});
    setColumnOrder(DEFAULT_COLUMN_ORDER);
    setColumnPinning({ start: [], end: [] });
  }, []);

  const handleDragStartColumn = useCallback((columnId: string) => {
    setDraggingColumnId(columnId);
  }, []);

  const handleDropColumn = useCallback(
    (targetColumnId: string) => {
      const sourceId = draggingColumnId;
      setDraggingColumnId(null);
      if (
        sourceId === null ||
        sourceId === targetColumnId ||
        STRUCTURAL_COLUMN_IDS.includes(
          sourceId as (typeof STRUCTURAL_COLUMN_IDS)[number]
        ) ||
        STRUCTURAL_COLUMN_IDS.includes(
          targetColumnId as (typeof STRUCTURAL_COLUMN_IDS)[number]
        )
      ) {
        return;
      }
      setColumnOrder((prev) => {
        const order = [...prev];
        const fromIndex = order.indexOf(sourceId);
        const toIndex = order.indexOf(targetColumnId);
        if (fromIndex === -1 || toIndex === -1) {
          return prev;
        }
        order.splice(fromIndex, 1);
        order.splice(toIndex, 0, sourceId);
        return order;
      });
    },
    [draggingColumnId]
  );

  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: table.getState().pagination.pageIndex + 1,
    totalPages: Math.max(table.getPageCount(), 1),
    paginationItemsToDisplay: 2,
  });

  const statusColumn = table.getColumn("status");
  const linkedColumn = table.getColumn("linked");
  const rolesColumn = table.getColumn("roles");

  const statusFilterValue = (statusColumn?.getFilterValue() ?? []) as string[];
  const linkedFilterValue = (linkedColumn?.getFilterValue() ?? []) as string[];
  const rolesFilterValue = (rolesColumn?.getFilterValue() ?? []) as string[];

  const handleStatusFilterChange = useCallback(
    (next: string[]) => {
      statusColumn?.setFilterValue(next);
    },
    [statusColumn]
  );
  const handleLinkedFilterChange = useCallback(
    (next: string[]) => {
      linkedColumn?.setFilterValue(next);
    },
    [linkedColumn]
  );
  const handleRolesFilterChange = useCallback(
    (next: string[]) => {
      rolesColumn?.setFilterValue(next);
    },
    [rolesColumn]
  );

  const statusOptions = useMemo(
    () => Array.from(new Set(data.map((u) => u.status))).sort(),
    [data]
  );
  const roleOptions = useMemo(
    () =>
      Array.from(
        new Set(data.flatMap((u) => u.roles.map((r) => r.roleCode)))
      ).sort(),
    [data]
  );

  function handlePreviousPage() {
    table.previousPage();
  }

  function handleNextPage() {
    table.nextPage();
  }

  function handlePageSelect(page: number) {
    table.setPageIndex(page - 1);
  }

  return (
    <div className="w-full">
      <div className="border-b">
        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xl">{title}</span>
              <Badge className="rounded-sm" variant="secondary">
                {String(filteredRows.length)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="max-w-sm"
                onChange={handleQueryChange}
                placeholder="Search name or email…"
                type="search"
                value={globalQuery}
              />
              <ColumnChooser
                onReset={handleResetColumns}
                onToggle={handleToggleColumn}
                visibility={columnVisibility}
              />
              <ExportMenu rows={filteredRows} />
            </div>
          </div>
          {selectedUsers.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <MultiSelectFilter
                label="Status"
                onChange={handleStatusFilterChange}
                options={statusOptions}
                selected={statusFilterValue}
              />
              <MultiSelectFilter
                label="Auth link"
                onChange={handleLinkedFilterChange}
                options={["linked", "unlinked"]}
                selected={linkedFilterValue}
              />
              {roleOptions.length > 0 && (
                <MultiSelectFilter
                  label="Roles"
                  onChange={handleRolesFilterChange}
                  options={roleOptions}
                  selected={rolesFilterValue}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2">
              <span className="text-sm">{selectedUsers.length} selected</span>
              <Button
                disabled={onBulkStatusChange === undefined}
                onClick={handleBulkEnable}
                size="sm"
                type="button"
                variant="outline"
              >
                <PowerIcon className="size-4" />
                Enable
              </Button>
              <Button
                disabled={onBulkStatusChange === undefined}
                onClick={handleBulkDisable}
                size="sm"
                type="button"
                variant="outline"
              >
                <PowerOffIcon className="size-4" />
                Disable
              </Button>
            </div>
          )}
        </div>
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow className="h-14 border-t" key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className={cn(
                      "group text-muted-foreground first:pl-4 last:px-4",
                      pinClass(header.column.getIsPinned())
                    )}
                    key={header.id}
                    style={pinOffsetStyle(
                      table,
                      header.column,
                      header.getSize()
                    )}
                  >
                    <DraggableHeaderCell
                      draggable={
                        !STRUCTURAL_COLUMN_IDS.includes(
                          header.column
                            .id as (typeof STRUCTURAL_COLUMN_IDS)[number]
                        )
                      }
                      header={header}
                      onDragStartColumn={handleDragStartColumn}
                      onDropColumn={handleDropColumn}
                    />
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.flatMap((row) => {
                const rows = [
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        className={cn(
                          "h-14 overflow-hidden first:pl-4 last:px-4",
                          pinClass(cell.column.getIsPinned())
                        )}
                        key={cell.id}
                        style={pinOffsetStyle(
                          table,
                          cell.column,
                          cell.column.getSize()
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>,
                ];
                if (expandedIds.has(row.original.id)) {
                  rows.push(
                    <RoleSubRow
                      colSpan={visibleColumnCount}
                      key={`${row.id}-sub`}
                      user={row.original}
                    />
                  );
                }
                return rows;
              })
            ) : (
              <TableRow>
                <TableCell
                  className="h-24 text-center"
                  colSpan={visibleColumnCount}
                >
                  No users match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3 px-6 py-4 max-sm:flex-col md:max-lg:flex-col">
        <p
          aria-live="polite"
          className="whitespace-nowrap text-muted-foreground text-sm"
        >
          Showing{" "}
          <span>
            {table.getRowCount() === 0
              ? 0
              : table.getState().pagination.pageIndex *
                  table.getState().pagination.pageSize +
                1}{" "}
            to{" "}
            {Math.min(
              table.getState().pagination.pageIndex *
                table.getState().pagination.pageSize +
                table.getState().pagination.pageSize,
              table.getRowCount()
            )}
          </span>{" "}
          of <span>{String(table.getRowCount())} entries</span>
        </p>

        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <Button
                aria-label="Go to previous page"
                className="disabled:pointer-events-none disabled:opacity-50"
                disabled={!table.getCanPreviousPage()}
                onClick={handlePreviousPage}
                variant="ghost"
              >
                <ChevronLeftIcon aria-hidden="true" />
                Previous
              </Button>
            </PaginationItem>

            {showLeftEllipsis ? (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            ) : null}

            {pages.map((page) => (
              <PaginationPageButton
                isActive={page === table.getState().pagination.pageIndex + 1}
                key={page}
                onSelect={handlePageSelect}
                page={page}
              />
            ))}

            {showRightEllipsis ? (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            ) : null}

            <PaginationItem>
              <Button
                aria-label="Go to next page"
                className="disabled:pointer-events-none disabled:opacity-50"
                disabled={!table.getCanNextPage()}
                onClick={handleNextPage}
                variant="ghost"
              >
                Next
                <ChevronRightIcon aria-hidden="true" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
};

export default UserDatatable;
