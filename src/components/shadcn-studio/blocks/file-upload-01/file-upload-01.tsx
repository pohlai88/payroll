/**
 * @feature employee-import
 * @layer ui
 * @hub src/server/routes/employee-import.ts
 *
 * File upload card — from `@ss-blocks/file-upload-01`, customized for
 * Clarity employee CSV/JSON import. Presentational; parent owns I/O.
 */

import type { ChangeEvent } from "react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface EmployeeFileUploadProps {
  readonly title?: string;
  readonly description?: string;
  readonly fileLabel?: string;
  readonly fileHint?: string;
  readonly accept?: string;
  readonly disabled?: boolean;
  readonly fileName?: string | null;
  readonly canUpload?: boolean;
  readonly uploadLabel?: string;
  readonly onFileChange: (file: File | null) => void;
  readonly onUpload: () => void;
  readonly onCancel?: () => void;
}

function EmployeeFileUpload({
  title = "Import employees",
  description = "Upload a filled CSV or JSON file to create employee records.",
  fileLabel = "Employee file",
  fileHint = "Accepts .csv or .json. Create-only — existing rows are skipped.",
  accept = ".csv,.json,text/csv,application/json",
  disabled = false,
  fileName = null,
  canUpload = false,
  uploadLabel = "Import",
  onFileChange,
  onUpload,
  onCancel,
}: EmployeeFileUploadProps) {
  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.files?.[0] ?? null;
      onFileChange(next);
    },
    [onFileChange]
  );

  const handleCancel = useCallback(() => {
    onFileChange(null);
    onCancel?.();
  }, [onCancel, onFileChange]);

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="font-semibold">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="w-full space-y-2">
          <Label className="gap-1" htmlFor="employee-import-file">
            {fileLabel} <span className="text-destructive">*</span>
          </Label>
          <Input
            accept={accept}
            className="p-0 pr-3 text-muted-foreground italic file:mr-3 file:h-full file:border-0 file:border-input file:border-r file:border-solid file:bg-transparent file:px-3 file:font-medium file:text-foreground file:text-sm file:not-italic"
            disabled={disabled}
            id="employee-import-file"
            onChange={handleInputChange}
            type="file"
          />
          <p className="text-muted-foreground text-xs">
            {fileName === null || fileName === ""
              ? fileHint
              : `Selected: ${fileName}`}
          </p>
        </div>
      </CardContent>
      <CardContent className="flex justify-end gap-2 max-sm:justify-center">
        <Button
          className="max-sm:flex-1"
          disabled={disabled}
          onClick={handleCancel}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          className="max-sm:flex-1"
          disabled={disabled || !canUpload}
          onClick={onUpload}
          type="button"
        >
          {uploadLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

export default EmployeeFileUpload;
