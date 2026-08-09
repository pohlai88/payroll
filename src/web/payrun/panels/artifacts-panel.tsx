/**
 * @feature artifacts
 * @layer ui
 * @hub src/server/routes/pay-run-control.ts
 *
 * Artifacts panel — lists run artifacts and attaches manual evidence.
 * Manual upload types are EVIDENCE / EXCEPTION_REPORT only; other types
 * (PAYMENT_REGISTER, MANIFEST, TIMESTAMP_TOKEN, …) are server-produced.
 * Download uses authenticated GET …/content (local FS and R2).
 */

import { FileTextIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { HashChip } from "@/components/payroll/hash-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadDropZone } from "@/components/ui/upload-drop-zone";
import { ARTIFACT_MAX_BODY_BYTES } from "@/domain/artifacts/store";
import { formatApiError } from "@/web/api/format-error";
import type { ArtifactRow, UploadArtifactType } from "@/web/api/payroll-api";
import { payrollApi } from "@/web/api/payroll-api";

interface ArtifactsPanelProps {
  readonly runId: string;
  readonly artifacts: readonly ArtifactRow[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onUploaded: () => void;
  /** When true, hides the upload section (run is CLOSED — read-only mode). */
  readonly readOnly?: boolean;
}

const MANUAL_TYPES: readonly {
  readonly value: UploadArtifactType;
  readonly label: string;
}[] = [
  { value: "EVIDENCE", label: "Evidence" },
  { value: "EXCEPTION_REPORT", label: "Exception report" },
];

function filenameOf(artifact: ArtifactRow): string {
  return artifact.relativePath.split("/").pop() ?? artifact.relativePath;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const { result } = reader;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      // FileReader.readAsDataURL always produces "data:<mime>;base64,<data>"
      // The comma separating the header from the payload is guaranteed to be
      // the first comma in the string, because MIME types and base64 tokens
      // never contain commas.
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

function ArtifactsPanel({
  runId,
  artifacts,
  loading,
  error,
  onUploaded,
  readOnly = false,
}: ArtifactsPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<UploadArtifactType>("EVIDENCE");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleTypeChange = useCallback((value: string | null) => {
    if (value === "EVIDENCE" || value === "EXCEPTION_REPORT") {
      setType(value);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (file === null) {
      return;
    }
    if (file.size > ARTIFACT_MAX_BODY_BYTES) {
      setUploadError(
        `File exceeds ${Math.floor(ARTIFACT_MAX_BODY_BYTES / (1024 * 1024))} MiB limit`
      );
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const base64 = await readAsBase64(file);
      await payrollApi.uploadArtifact(runId, {
        filename: file.name,
        mimeType: file.type === "" ? "application/octet-stream" : file.type,
        base64,
        type,
      });
      setFile(null);
      onUploaded();
    } catch (err) {
      setUploadError(formatApiError(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  }, [file, onUploaded, runId, type]);

  const handleDownload = useCallback(
    async (artifactId: string) => {
      setDownloadError(null);
      try {
        // Bearer /content — do not window.open (noopener orphans a blank tab).
        const { blob, filename } = await payrollApi.downloadArtifact(
          runId,
          artifactId
        );
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.rel = "noopener";
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      } catch (err) {
        setDownloadError(formatApiError(err, "Download failed"));
      }
    },
    [runId]
  );

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2">
        <span className="font-medium text-sm">Artifacts</span>
      </div>

      {error === null ? null : (
        <p className="px-3 py-2 text-destructive text-sm">{error}</p>
      )}
      {downloadError === null ? null : (
        <p className="px-3 py-2 text-destructive text-sm">{downloadError}</p>
      )}

      {loading && artifacts.length === 0 ? (
        <div className="flex flex-col gap-2 px-3 py-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : null}

      {!loading && artifacts.length === 0 ? (
        <div className="p-3">
          <EmptyState
            className="border-0 shadow-none"
            description={
              readOnly
                ? "This run has no stored artifacts."
                : "Attach evidence below, or wait for generated files after release/close."
            }
            icon={<FileTextIcon aria-hidden />}
            title="No artifacts yet"
          />
        </div>
      ) : null}

      {artifacts.length > 0 ? (
        <ul className="divide-y">
          {artifacts.map((artifact) => (
            <ArtifactRowView
              artifact={artifact}
              key={artifact.id}
              onDownload={handleDownload}
            />
          ))}
        </ul>
      ) : null}

      {readOnly ? null : (
        <div className="flex flex-col gap-2 border-t p-3">
          <span className="font-medium text-sm">Attach evidence</span>
          <Select onValueChange={handleTypeChange} value={type}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MANUAL_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <UploadDropZone file={file} onChange={setFile} />
          {uploadError === null ? null : (
            <p className="text-destructive text-xs">{uploadError}</p>
          )}
          <Button
            disabled={file === null || uploading}
            onClick={handleUpload}
            size="sm"
          >
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      )}
    </div>
  );
}

interface ArtifactRowViewProps {
  readonly artifact: ArtifactRow;
  readonly onDownload: (artifactId: string) => void;
}

function ArtifactRowView({ artifact, onDownload }: ArtifactRowViewProps) {
  const handleClick = useCallback(
    () => onDownload(artifact.id),
    [artifact.id, onDownload]
  );

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="outline">{artifact.type}</Badge>
          <span className="truncate">{filenameOf(artifact)}</span>
          <span className="shrink-0 text-muted-foreground text-xs">
            {formatBytes(artifact.byteSize)}
          </span>
        </div>
        {/* The hash, not the filename, is what a manifest commits to. */}
        <HashChip
          className="self-start"
          label={`sha256 of ${filenameOf(artifact)}`}
          value={artifact.sha256}
        />
      </div>
      <Button onClick={handleClick} size="sm" variant="ghost">
        Download
      </Button>
    </li>
  );
}

export type { ArtifactsPanelProps };
export { ArtifactsPanel };
