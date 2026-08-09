/**
 * @feature shell
 * @layer ui
 *
 * UploadDropZone — file-drop target with progress feedback.
 * Inspired by Studio file-upload pattern; no external deps beyond existing primitives.
 */

import { UploadCloudIcon } from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UploadDropZoneProps {
  readonly accept?: string;
  readonly disabled?: boolean;
  readonly file: File | null;
  readonly onChange: (file: File | null) => void;
  readonly progress?: number;
  readonly className?: string;
  readonly id?: string;
}

function UploadDropZone({
  accept,
  disabled = false,
  file,
  onChange,
  progress,
  className,
  id = "upload-drop-zone",
}: UploadDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFileSelect = useCallback(
    (next: File | null) => {
      if (next !== null) {
        onChange(next);
      }
    },
    [onChange]
  );

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      handleFileSelect(e.target.files?.[0] ?? null);
    },
    [handleFileSelect]
  );

  const onDragOver = useCallback(
    (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!disabled) {
        setDragging(true);
      }
    },
    [disabled]
  );

  const onDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setDragging(false);
      if (!disabled) {
        handleFileSelect(e.dataTransfer.files?.[0] ?? null);
      }
    },
    [disabled, handleFileSelect]
  );

  const openPicker = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click();
    }
  }, [disabled]);

  const onClear = useCallback(() => {
    onChange(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [onChange]);

  const onClearClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onClear();
    },
    [onClear]
  );

  const showProgress = progress !== undefined && progress > 0 && progress < 100;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Drop zone as a real button element for accessibility */}
      <button
        aria-label="Upload file drop zone"
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-border border-dashed bg-muted/30 px-6 py-8 text-center transition-colors",
          dragging && "border-ring bg-ring/5",
          file !== null && "border-ring/50",
          disabled && "pointer-events-none opacity-50"
        )}
        disabled={disabled}
        onClick={openPicker}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        type="button"
      >
        <UploadCloudIcon
          className={cn(
            "size-9 text-muted-foreground transition-colors",
            dragging && "text-ring"
          )}
        />
        {file === null ? (
          <>
            <p className="font-medium text-foreground text-sm">
              Drop a file here, or{" "}
              <span className="text-ring underline-offset-2 hover:underline">
                browse
              </span>
            </p>
            {accept !== undefined && (
              <p className="text-muted-foreground text-xs">{accept}</p>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{file.name}</Badge>
            <Button
              aria-label="Remove file"
              className="h-auto px-0 text-muted-foreground text-xs underline-offset-2 hover:text-foreground"
              disabled={disabled}
              onClick={onClearClick}
              type="button"
              variant="link"
            >
              Remove
            </Button>
          </div>
        )}
      </button>

      {/* Hidden real file input */}
      <input
        accept={accept}
        aria-label="Upload file"
        className="sr-only"
        disabled={disabled}
        id={id}
        onChange={onInputChange}
        ref={inputRef}
        type="file"
      />

      {/* Progress bar */}
      {showProgress ? (
        <div
          aria-label={`Upload ${progress}% complete`}
          aria-valuenow={progress}
          className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-ring transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      {/* Browse fallback button for keyboard / no-drop context */}
      {file === null ? (
        <Button
          className="w-full"
          disabled={disabled}
          onClick={openPicker}
          size="sm"
          type="button"
          variant="outline"
        >
          Choose file
        </Button>
      ) : null}
    </div>
  );
}

export type { UploadDropZoneProps };
export { UploadDropZone };
