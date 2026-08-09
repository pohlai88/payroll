/**
 * @feature companies
 * @layer ui
 * @hub src/server/routes/admin-companies.ts
 *
 * Company directory table — search + row actions (edit / delete).
 * Layout DNA inspired by studio datatable-component-06 (toolbar + actions menu).
 */

import {
  Building2Icon,
  EllipsisVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AdminCompanyRow } from "@/web/api/types";

interface CompanyDatatableProps {
  readonly data: readonly AdminCompanyRow[];
  readonly title?: string;
  readonly onEdit?: (company: AdminCompanyRow) => void;
  readonly onDelete?: (company: AdminCompanyRow) => void;
}

function RowActions({
  company,
  onEdit,
  onDelete,
}: {
  company: AdminCompanyRow;
  onEdit?: (company: AdminCompanyRow) => void;
  onDelete?: (company: AdminCompanyRow) => void;
}) {
  if (onEdit === undefined && onDelete === undefined) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${company.code}`}
        className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <EllipsisVerticalIcon aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {onEdit === undefined ? null : (
            <DropdownMenuItem onClick={() => onEdit(company)}>
              <PencilIcon className="size-4" />
              Edit
            </DropdownMenuItem>
          )}
          {onDelete === undefined ? null : (
            <DropdownMenuItem
              onClick={() => onDelete(company)}
              variant="destructive"
            >
              <Trash2Icon className="size-4" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CompanyDatatable({
  data,
  title = "Companies",
  onEdit,
  onDelete,
}: CompanyDatatableProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") {
      return data;
    }
    return data.filter(
      (row) =>
        row.code.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        (row.epfNo ?? "").toLowerCase().includes(q) ||
        (row.lhdnNo ?? "").toLowerCase().includes(q)
    );
  }, [data, query]);

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuery(event.currentTarget.value);
    },
    []
  );

  return (
    <div className="w-full">
      <div className="flex flex-col gap-4 border-b p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Building2Icon className="size-5 text-muted-foreground" />
          <span className="font-semibold text-xl">{title}</span>
          <Badge className="rounded-sm" variant="secondary">
            {String(filtered.length)}
          </Badge>
        </div>
        <Input
          className="max-w-sm"
          onChange={handleQueryChange}
          placeholder="Search code, name, EPF, LHDN…"
          type="search"
          value={query}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow className="h-12">
            <TableHead className="pl-4">Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>EPF</TableHead>
            <TableHead>SOCSO</TableHead>
            <TableHead>LHDN</TableHead>
            <TableHead>HRDF</TableHead>
            <TableHead className="pr-4 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell
                className="h-24 text-center text-muted-foreground"
                colSpan={7}
              >
                No companies match this filter.
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((company) => (
              <TableRow key={company.id}>
                <TableCell className="pl-4 font-mono text-sm">
                  {company.code}
                </TableCell>
                <TableCell className="font-medium">{company.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {company.epfNo ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {company.socsoNo ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {company.lhdnNo ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      "h-auto rounded-sm border-none",
                      company.hrdfEnabled
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {company.hrdfEnabled
                      ? `On · ${company.hrdfLevyPct}%`
                      : "Off"}
                  </Badge>
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <RowActions
                    company={company}
                    onDelete={onDelete}
                    onEdit={onEdit}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default CompanyDatatable;
