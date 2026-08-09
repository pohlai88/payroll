/**
 * Thin create-only employee import panel — presentation only; API enforces authZ.
 */

import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  UploadIcon,
  UsersIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UploadDropZone } from "@/components/ui/upload-drop-zone";
import { formatApiError } from "@/web/api/format-error";
import { payrollApi } from "@/web/api/payroll-api";
import {
  type ImportReportResponse,
  SessionExpiredError,
} from "@/web/api/types";

interface EmployeeImportPanelProps {
  readonly companyId: string;
  readonly busy: boolean;
  readonly setBusy: (busy: boolean) => void;
  readonly onSessionExpired: () => void;
  readonly onError: (message: string) => void;
  readonly onInfo: (message: string | null) => void;
}

function rowStatusVariant(
  status: string
): "success" | "warning" | "destructive" | "secondary" {
  if (status === "CREATED") {
    return "success";
  }
  if (status === "SKIPPED_EXISTING") {
    return "warning";
  }
  if (status === "FAILED") {
    return "destructive";
  }
  return "secondary";
}

export function EmployeeImportPanel({
  companyId,
  busy,
  setBusy,
  onSessionExpired,
  onError,
  onInfo,
}: EmployeeImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReportResponse | null>(null);

  const onFileChange = useCallback((next: File | null) => {
    setFile(next);
    setReport(null);
  }, []);

  const onDownloadTemplate = useCallback(async () => {
    setBusy(true);
    onInfo(null);
    try {
      const csv = await payrollApi.downloadEmployeeImportTemplate(
        companyId === "" ? null : companyId
      );
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "employee-import-template.csv";
      anchor.click();
      URL.revokeObjectURL(url);
      onInfo("Template downloaded.");
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        onSessionExpired();
        return;
      }
      onError(formatApiError(error, "Import failed"));
    } finally {
      setBusy(false);
    }
  }, [companyId, onError, onInfo, onSessionExpired, setBusy]);

  const onImport = useCallback(async () => {
    if (file === null) {
      onError("Choose a CSV or JSON file first.");
      return;
    }
    setBusy(true);
    onInfo(null);
    setReport(null);
    try {
      const text = await file.text();
      const lower = file.name.toLowerCase();
      const contentType = lower.endsWith(".json")
        ? "application/json"
        : "text/csv";
      const nextReport = await payrollApi.importEmployees(text, contentType);
      setReport(nextReport);
      onInfo(
        `Import finished: created ${nextReport.created}, skipped-existing ${nextReport.skippedExisting}, failed ${nextReport.failed}.`
      );
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        onSessionExpired();
        return;
      }
      onError(formatApiError(error, "Import failed"));
    } finally {
      setBusy(false);
    }
  }, [file, onError, onInfo, onSessionExpired, setBusy]);

  const onDownloadClick = useCallback(() => {
    onDownloadTemplate().catch(() => undefined);
  }, [onDownloadTemplate]);

  const onImportClick = useCallback(() => {
    onImport().catch(() => undefined);
  }, [onImport]);

  const hasResults = report !== null;
  const hasFailed = hasResults && report.failed > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Info notice */}
      <Alert variant="info">
        <AlertCircleIcon />
        <AlertTitle>Create-only import</AlertTitle>
        <AlertDescription>
          Server enforces EMPLOYMENT CREATE per company. Re-uploading never
          updates existing rows. Custom-field auto-register is CLI-only.
        </AlertDescription>
      </Alert>

      {/* Step 1 — download template */}
      <Card>
        <CardHeader>
          <CardTitle>Step 1 — Download template</CardTitle>
          <CardDescription>
            Get the CSV template pre-filled with column headers for this
            company.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            disabled={busy}
            onClick={onDownloadClick}
            type="button"
            variant="outline"
          >
            <DownloadIcon />
            Download template
          </Button>
        </CardFooter>
      </Card>

      {/* Step 2 — upload and import */}
      <Card>
        <CardHeader>
          <CardTitle>Step 2 — Import employees</CardTitle>
          <CardDescription>
            Upload a filled CSV or JSON file to create employee records.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <UploadDropZone
            accept=".csv, .json"
            disabled={busy}
            file={file}
            id="import-file"
            onChange={onFileChange}
          />
        </CardContent>
        <CardFooter>
          <Button
            disabled={busy || file === null}
            onClick={onImportClick}
            type="button"
          >
            <UploadIcon />
            Import
          </Button>
        </CardFooter>
      </Card>

      {/* Results */}
      {!hasResults && (
        <EmptyState
          badge="Awaiting import"
          description="Upload a file above and click Import to see results here."
          icon={<UsersIcon />}
          title="No import results yet"
        />
      )}

      {hasResults && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Import results</CardTitle>
              <Badge variant="success">{report.created} created</Badge>
              {report.skippedExisting > 0 ? (
                <Badge variant="warning">
                  {report.skippedExisting} skipped
                </Badge>
              ) : null}
              {hasFailed ? (
                <Badge variant="destructive">{report.failed} failed</Badge>
              ) : null}
            </div>
            <CardDescription>
              {hasFailed ? (
                <span className="flex items-center gap-1">
                  <AlertCircleIcon className="size-3.5 text-destructive" />
                  Some rows failed — review errors below.
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <CheckCircle2Icon className="size-3.5 text-status-ok-ink" />
                  All rows processed successfully.
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow
                    key={`${row.status}-${row.rowNumber}-${row.employeeCode}`}
                  >
                    <TableCell className="tabular-nums">
                      {row.rowNumber}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.employeeCode ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rowStatusVariant(row.status)}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {row.status === "CREATED" && (
                        <code className="font-mono">{row.employmentId}</code>
                      )}
                      {row.status === "FAILED" &&
                        row.errors
                          .map((e) => `${e.field}: ${e.reason}`)
                          .join("; ")}
                      {row.status === "SKIPPED_EXISTING" && "unchanged"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
