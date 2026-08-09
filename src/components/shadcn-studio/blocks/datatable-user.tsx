/**
 * Studio datatable-component-04 adapted for Clarity admin users (read-only).
 */

import type {
  ColumnFiltersState,
  PaginationState,
} from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import type {
  LegacyColumn as Column,
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
  Link2Icon,
  Link2OffIcon,
} from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectGroup,
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

interface AdminColumnMeta {
  filterVariant?: "text" | "range" | "select";
}

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
    return "bg-status-ok-fill text-status-ok-ink";
  }
  if (key === "pending" || key === "invited") {
    return "bg-status-warn-fill text-status-warn-ink";
  }
  if (key === "disabled" || key === "revoked" || key === "inactive") {
    return "bg-destructive/10 text-destructive";
  }
  return "bg-muted text-muted-foreground";
}

const columns: ColumnDef<AdminUserRow>[] = [
  {
    header: "User",
    accessorKey: "name",
    meta: { filterVariant: "text" } satisfies AdminColumnMeta,
    cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => (
      <div className="flex items-center gap-2">
        <Avatar className="size-9">
          <AvatarFallback className="text-xs">
            {initials(row.original.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.original.name}</span>
          <span className="truncate text-muted-foreground text-sm">
            {row.original.email}
          </span>
        </div>
      </div>
    ),
    size: 320,
  },
  {
    header: "Status",
    accessorKey: "status",
    filterFn: "equalsString",
    meta: { filterVariant: "select" } satisfies AdminColumnMeta,
    cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => (
      <Badge
        className={cn(
          "h-auto rounded-sm border-none capitalize focus-visible:outline-none",
          statusBadgeClass(row.original.status)
        )}
      >
        {row.original.status}
      </Badge>
    ),
  },
  {
    id: "linked",
    header: "Auth link",
    accessorFn: (row: AdminUserRow) =>
      row.authSubject === null ? "unlinked" : "linked",
    filterFn: "equalsString",
    meta: { filterVariant: "select" } satisfies AdminColumnMeta,
    cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => {
      const linked = row.original.authSubject !== null;
      return (
        <div className="flex items-center gap-2 text-sm">
          {linked ? (
            <Link2Icon className="size-4 text-status-ok-ink" />
          ) : (
            <Link2OffIcon className="size-4 text-muted-foreground" />
          )}
          <span className="text-muted-foreground">
            {linked ? "Linked" : "Unlinked"}
          </span>
        </div>
      );
    },
  },
  {
    header: "Auth subject",
    accessorKey: "authSubject",
    enableSorting: false,
    cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => (
      <code className="block max-w-48 truncate text-xs">
        {row.original.authSubject ?? "—"}
      </code>
    ),
  },
  {
    header: "Id",
    accessorKey: "id",
    enableSorting: false,
    cell: ({ row }: { row: LegacyRow<AdminUserRow> }) => (
      <code className="block max-w-36 truncate text-xs">{row.original.id}</code>
    ),
  },
];

interface UserDatatableProps {
  data: readonly AdminUserRow[];
  title?: string;
}

function renderTableHeaderContent(header: LegacyHeader<AdminUserRow, unknown>) {
  if (header.isPlaceholder) {
    return null;
  }

  if (!header.column.getCanSort()) {
    return flexRender(header.column.columnDef.header, header.getContext());
  }

  return (
    <button
      className="flex h-full w-full cursor-pointer select-none items-center justify-between gap-2 border-0 bg-transparent p-0 text-left font-inherit text-inherit"
      onClick={header.column.getToggleSortingHandler()}
      type="button"
    >
      {flexRender(header.column.columnDef.header, header.getContext())}
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
  );
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

const UserDatatable = ({ data, title = "Admin users" }: UserDatatableProps) => {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const pageSize = 8;
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  const tableData = useMemo(() => [...data], [data]);

  const table = useLegacyTable({
    data: tableData,
    columns,
    state: {
      columnFilters,
      pagination,
    },
    onColumnFiltersChange: setColumnFilters,
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

  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: table.getState().pagination.pageIndex + 1,
    totalPages: Math.max(table.getPageCount(), 1),
    paginationItemsToDisplay: 2,
  });

  const statusColumn = table.getColumn("status");
  const linkedColumn = table.getColumn("linked");

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
          <span className="font-semibold text-xl">{title}</span>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {statusColumn === undefined ? null : (
              <Filter column={statusColumn} />
            )}
            {linkedColumn === undefined ? null : (
              <Filter column={linkedColumn} />
            )}
          </div>
        </div>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow className="h-14 border-t" key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className="text-muted-foreground first:pl-4 last:px-4"
                    key={header.id}
                    style={{ width: `${String(header.getSize())}px` }}
                  >
                    {renderTableHeaderContent(header)}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      className="h-14 first:pl-4 last:px-4"
                      key={cell.id}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-24 text-center"
                  colSpan={columns.length}
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

function Filter({ column }: { column: Column<AdminUserRow> }) {
  const id = useId();
  const columnFilterValue = column.getFilterValue();
  const meta = column.columnDef.meta as AdminColumnMeta | undefined;
  const filterVariant = meta?.filterVariant;
  const columnHeader =
    typeof column.columnDef.header === "string" ? column.columnDef.header : "";

  const sortedUniqueValues = useMemo(() => {
    if (filterVariant === "range") {
      return [];
    }

    const values = Array.from(column.getFacetedUniqueValues().keys());
    const flattenedValues = values.reduce<string[]>((acc, curr) => {
      if (Array.isArray(curr)) {
        acc.push(...curr.map(String));
        return acc;
      }
      acc.push(String(curr));
      return acc;
    }, []);

    return Array.from(new Set(flattenedValues)).sort();
  }, [column, filterVariant]);

  const handleValueChange = useCallback(
    (value: string | null) => {
      column.setFilterValue(
        value === "all" || value === null ? undefined : value
      );
    },
    [column]
  );

  return (
    <div className="flex w-full flex-col gap-2">
      <Label htmlFor={`${id}-select`}>Select {columnHeader}</Label>
      <Select
        onValueChange={handleValueChange}
        value={columnFilterValue?.toString() ?? "all"}
      >
        <SelectTrigger className="w-full capitalize" id={`${id}-select`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">All</SelectItem>
            {sortedUniqueValues.map((value) => (
              <SelectItem className="capitalize" key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
