/**
 * @feature companies
 * @layer ui
 * @hub src/server/routes/admin-companies.ts
 *
 * Company directory table — multicompany party rows for admin management.
 */

import { Building2Icon, PencilIcon } from "lucide-react";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
}

function EditCompanyButton({
  company,
  onEdit,
}: {
  company: AdminCompanyRow;
  onEdit: (company: AdminCompanyRow) => void;
}) {
  const handleClick = useCallback(() => {
    onEdit(company);
  }, [company, onEdit]);

  return (
    <Button onClick={handleClick} size="sm" type="button" variant="ghost">
      <PencilIcon className="size-4" />
      Edit
    </Button>
  );
}

function CompanyDatatable({
  data,
  title = "Companies",
  onEdit,
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
      <div className="flex flex-col gap-4 border-b p-6">
        <div className="flex items-center gap-2">
          <Building2Icon className="size-5 text-muted-foreground" />
          <span className="font-semibold text-xl">{title}</span>
        </div>
        <input
          className="h-9 max-w-sm rounded-md border border-input bg-background px-3 text-sm"
          onChange={handleQueryChange}
          placeholder="Search code or name…"
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
                  {onEdit === undefined ? null : (
                    <EditCompanyButton company={company} onEdit={onEdit} />
                  )}
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
