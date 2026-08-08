/**
 * Thin create-only employee import panel — presentation only; API enforces authZ.
 */

import { type ChangeEvent, useCallback, useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { payrollApi } from "@/web/api/payroll-api";
import {
  ApiClientError,
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

function formatImportError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Import failed";
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

  const onFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
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
      onError(formatImportError(error));
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
      onError(formatImportError(error));
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee master import (create-only)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTitle>
            ⓘ Server enforces EMPLOYMENT CREATE per company. Re-upload never
            updates existing rows. Custom-field auto-register is CLI-only.
          </AlertTitle>
        </Alert>

        <div className="flex flex-wrap items-end gap-4">
          <Button
            disabled={busy}
            onClick={onDownloadClick}
            type="button"
            variant="outline"
          >
            Download template
          </Button>

          <div className="space-y-2">
            <Label htmlFor="import-file">Import file</Label>
            <Input
              accept=".csv,.json,text/csv,application/json"
              disabled={busy}
              id="import-file"
              onChange={onFileChange}
              type="file"
            />
          </div>

          <Button
            disabled={busy || file === null}
            onClick={onImportClick}
            type="button"
          >
            Import
          </Button>
        </div>

        {report === null ? null : (
          <div className="space-y-4">
            <Alert>
              <AlertTitle>
                ⓘ Created {report.created} · Skipped {report.skippedExisting} ·
                Failed {report.failed}
              </AlertTitle>
            </Alert>
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
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>{row.employeeCode ?? "—"}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>
                      {row.status === "CREATED" ? (
                        <code className="text-xs">{row.employmentId}</code>
                      ) : null}
                      {row.status === "FAILED"
                        ? row.errors
                            .map((e) => `${e.field}: ${e.reason}`)
                            .join("; ")
                        : null}
                      {row.status === "SKIPPED_EXISTING" ? "unchanged" : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
