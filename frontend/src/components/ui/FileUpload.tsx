import { useCallback, useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";

export interface FileUploadProps {
  /** Return a promise that rejects on upload/processing failure. */
  onUpload: (file: File, onProgress?: (pct: number) => void) => Promise<void>;
  accept?: string;
  maxSizeMB?: number;
  label?: string;
  className?: string;
}

const DEFAULT_ACCEPT = ".pdf,.doc,.docx,.xlsx,.csv,.png,.jpg";

/** Compliance-engine ingest currently accepts PDF, DOCX, TXT only. */
const SERVER_ALLOWED_EXT = new Set(["pdf", "docx", "txt"]);

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

export function FileUpload({
  onUpload,
  accept = DEFAULT_ACCEPT,
  maxSizeMB = 25,
  label = "Evidence file",
  className = "",
}: FileUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const maxBytes = maxSizeMB * 1024 * 1024;

  const resetForNewFile = useCallback(() => {
    setStatus("idle");
    setErrorMessage(null);
    setProgress(0);
  }, []);

  const runUpload = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setFileSize(file.size);
      setErrorMessage(null);
      setProgress(0);

      const ext = fileExt(file.name);
      if (!SERVER_ALLOWED_EXT.has(ext)) {
        setStatus("error");
        setErrorMessage(
          `Unsupported type (.${ext || "?"}). Ingest accepts PDF, DOCX, or TXT.`
        );
        return;
      }
      if (file.size > maxBytes) {
        setStatus("error");
        setErrorMessage(`File exceeds ${maxSizeMB} MB.`);
        return;
      }

      setStatus("uploading");
      try {
        await onUpload(file, (pct) => setProgress(Math.min(100, Math.max(0, pct))));
        setStatus("success");
        setProgress(100);
      } catch (e) {
        setStatus("error");
        setErrorMessage(e instanceof Error ? e.message : "Upload failed");
      }
    },
    [maxBytes, maxSizeMB, onUpload]
  );

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      resetForNewFile();
      void runUpload(f);
    },
    [resetForNewFile, runUpload]
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const f = e.dataTransfer.files?.[0];
      if (!f) return;
      resetForNewFile();
      void runUpload(f);
    },
    [resetForNewFile, runUpload]
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div className={`font-ui ${className}`}>
      <p className="mb-2 text-sm font-medium text-cortex-text">{label}</p>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={onInputChange}
      />

      <button
        type="button"
        onClick={openPicker}
        onDrop={onDrop}
        onDragOver={onDragOver}
        disabled={status === "uploading"}
        className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed bg-cortex-panel/30 px-4 py-8 transition-colors hover:bg-cortex-panel/50 disabled:cursor-not-allowed disabled:opacity-70"
        style={{ borderColor: "var(--border)" }}
      >
        <FileIcon className="mb-3 text-[color:var(--text-tertiary)]" />
        <span className="text-center text-sm text-cortex-muted">
          Drop file here or{" "}
          <span className="text-cortex-blue underline-offset-2 hover:underline">click to browse</span>
        </span>
      </button>

      {fileName != null && fileSize != null ? (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium text-cortex-text" title={fileName}>
              {fileName}
            </span>
            <span className="shrink-0 font-data text-xs text-cortex-muted">{formatBytes(fileSize)}</span>
          </div>

          {status === "uploading" ? (
            <>
              <div
                className="h-2 w-full overflow-hidden rounded-full"
                style={{ background: "var(--border)" }}
              >
                <div
                  className="h-full rounded-full bg-cortex-blue transition-[width] duration-200 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="font-data text-xs text-cortex-muted">
                {progress < 5 ? "Starting…" : `${Math.round(progress)}%`}
              </p>
            </>
          ) : null}

          {status === "success" ? (
            <div className="flex items-center gap-2 text-sm text-cortex-green">
              <span aria-hidden>✓</span>
              <span>
                Uploaded <span className="font-medium">{fileName}</span>
              </span>
            </div>
          ) : null}

          {status === "error" && errorMessage ? (
            <p className="text-sm text-cortex-red" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
