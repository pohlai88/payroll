/**
 * Employee roster datatable — adapted from shadcn-studio
 * `@ss-blocks/datatable-component-01` for Clarity payroll directory rows.
 * Presentational only; I/O stays in `employees-page.tsx`.
 */

import { UsersIcon } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { EmployeeSummary } from "@/web/api/types";

interface EmployeeDatatableProps {
  readonly data: readonly EmployeeSummary[];
  readonly title?: string;
  readonly showCompanyColumn?: boolean;
  readonly companyNameById?: ReadonlyMap<string, string>;
  readonly loading?: boolean;
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

function EmployeeDatatable({
  data,
  title = "Directory",
  showCompanyColumn = false,
  companyNameById,
  loading = false,
}: EmployeeDatatableProps) {
  const colSpan = showCompanyColumn ? 4 : 3;
  const rows = useMemo(() => data, [data]);

  let body: ReactNode;
  if (loading) {
    body = (
      <TableRow>
        <TableCell
          className="h-24 text-center text-muted-foreground"
          colSpan={colSpan}
        >
          Loading roster…
        </TableCell>
      </TableRow>
    );
  } else if (rows.length === 0) {
    body = (
      <TableRow>
        <TableCell
          className="h-24 text-center text-muted-foreground"
          colSpan={colSpan}
        >
          No results.
        </TableCell>
      </TableRow>
    );
  } else {
    body = rows.map((employee) => (
      <TableRow key={employee.id}>
        <TableCell className="first:pl-4">
          <div className="flex items-center gap-2">
            <Avatar className="size-9">
              <AvatarFallback className="text-xs">
                {initials(employee.name)}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">{employee.name}</span>
          </div>
        </TableCell>
        <TableCell className="font-mono text-muted-foreground text-xs">
          {employee.code}
        </TableCell>
        {showCompanyColumn ? (
          <TableCell className="text-muted-foreground text-sm">
            {companyNameById?.get(employee.companyId) ?? employee.companyId}
          </TableCell>
        ) : null}
        <TableCell>
          <Badge
            className={cn(
              "h-auto rounded-sm px-1.5 capitalize",
              employee.status === "ACTIVE"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {employee.status.toLowerCase()}
          </Badge>
        </TableCell>
      </TableRow>
    ));
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 border-b px-6 py-4">
        <UsersIcon className="size-5 text-muted-foreground" />
        <span className="font-semibold text-xl">{title}</span>
        <Badge className="ml-auto h-auto rounded-sm" variant="secondary">
          {loading ? "…" : `${rows.length} employees`}
        </Badge>
      </div>
      <div className="border-b">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-14 text-muted-foreground first:pl-4">
                Employee
              </TableHead>
              <TableHead className="h-14 text-muted-foreground">Code</TableHead>
              {showCompanyColumn ? (
                <TableHead className="h-14 text-muted-foreground">
                  Company
                </TableHead>
              ) : null}
              <TableHead className="h-14 text-muted-foreground">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{body}</TableBody>
        </Table>
      </div>
    </div>
  );
}

export default EmployeeDatatable;
