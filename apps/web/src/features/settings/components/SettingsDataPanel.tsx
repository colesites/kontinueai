"use client";

import { useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Progress } from "@repo/ui/components/ui/progress";
import { Separator } from "@repo/ui/components/ui/separator";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileArchive,
  FileJson,
  FileText,
  Loader2,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { formatBytes } from "@repo/core/memory";

type ExportFormat = "json" | "markdown" | "zip";
type ImportProvider = "chatgpt" | "claude" | "kontinue";

const FORMAT_META: Record<
  ExportFormat,
  { label: string; description: string; icon: React.ElementType }
> = {
  json: {
    label: "JSON",
    description: "Single machine-readable file with conversations, memories, summaries.",
    icon: FileJson,
  },
  markdown: {
    label: "Markdown",
    description: "Human-readable document with one section per conversation.",
    icon: FileText,
  },
  zip: {
    label: "ZIP archive",
    description: "JSON + one Markdown file per conversation + README. Recommended.",
    icon: FileArchive,
  },
};

const PROVIDER_OPTIONS: Array<{
  value: ImportProvider;
  label: string;
  hint: string;
}> = [
  {
    value: "chatgpt",
    label: "ChatGPT",
    hint: "Upload conversations.json from your OpenAI data export.",
  },
  {
    value: "kontinue",
    label: "Kontinue",
    hint: "Upload a JSON file previously exported from Kontinue AI.",
  },
];

function formatTimestamp(ms: number | null | undefined): string {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}

export function SettingsDataPanel() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Your data</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Export everything Kontinue AI has stored about you, or bring your history
          over from another assistant.
        </p>
      </div>

      <ExportSection />
      <Separator className="bg-border/60" />
      <ImportSection />
    </div>
  );
}

// ── EXPORT ────────────────────────────────────────────────────────────────

function ExportSection() {
  const exports = useQuery(api.exports.listExports, {});
  const requestExport = useMutation(api.exports.requestExport);
  const deleteExport = useMutation(api.exports.deleteExport);
  const [pendingFormat, setPendingFormat] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inFlight = exports?.some((row) => row.status === "processing") ?? false;

  const handleRequest = async (format: ExportFormat) => {
    setError(null);
    setPendingFormat(format);
    try {
      await requestExport({ format });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start export.",
      );
    } finally {
      setPendingFormat(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Export</h3>
        <p className="text-xs text-muted-foreground">
          Includes conversations, memories, summaries, and account metadata.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(FORMAT_META) as ExportFormat[]).map((format) => {
          const meta = FORMAT_META[format];
          const Icon = meta.icon;
          const isPending = pendingFormat === format;
          return (
            <button
              type="button"
              key={format}
              disabled={inFlight || isPending}
              onClick={() => void handleRequest(format)}
              className="group flex flex-col items-start gap-3 rounded-xl border border-border/60 bg-background/70 p-4 text-left transition-all hover:border-foreground/20 hover:bg-foreground/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex size-9 items-center justify-center rounded-lg bg-foreground/5 text-foreground/80 transition-colors group-hover:bg-foreground/10">
                  <Icon className="size-4" />
                </div>
                {isPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{meta.label}</span>
                  {format === "zip" ? (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                      Recommended
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {meta.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Export couldn&apos;t start</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        {exports === undefined ? (
          <ExportSkeleton />
        ) : exports.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No exports yet. Generate one above — it&apos;s ready in seconds.
          </p>
        ) : (
          exports.map((row) => (
            <ExportRow
              key={row._id}
              row={row}
              onDelete={() => void deleteExport({ exportId: row._id })}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ExportSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-lg border border-border/40 bg-foreground/[0.02]"
        />
      ))}
    </div>
  );
}

type ExportRow = NonNullable<ReturnType<typeof useQuery<typeof api.exports.listExports>>>[number];

function ExportRow({
  row,
  onDelete,
}: {
  row: ExportRow;
  onDelete: () => void;
}) {
  const meta = FORMAT_META[row.format];
  const Icon = meta.icon;
  const getDownloadUrl = useAction(api.exportsWorker.getDownloadUrl);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!row.hasFile) return;
    setDownloading(true);
    try {
      const { url } = await getDownloadUrl({ exportId: row._id });
      // Trigger the browser download. Signed URL is short-lived (15min).
      window.location.href = url;
    } catch (err) {
      console.error("download failed", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground/5 text-foreground/80">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span>{meta.label}</span>
            <ExportStatusBadge status={row.status} />
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {row.status === "ready" && row.byteSize ? (
              <>
                {formatBytes(row.byteSize)} · {row.conversationCount ?? 0} chats ·{" "}
                {row.memoryCount ?? 0} memories · {formatTimestamp(row.completedAt)}
              </>
            ) : row.status === "processing" ? (
              <>Building your export…</>
            ) : row.status === "failed" ? (
              <>{row.errorMessage ?? "Export failed."}</>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {row.hasFile ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleDownload()}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Download
          </Button>
        ) : null}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onDelete}
          aria-label="Delete export"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function ExportStatusBadge({ status }: { status: ExportRow["status"] }) {
  if (status === "ready") {
    return (
      <Badge variant="outline" className="border-green-500/30 text-green-600 dark:text-green-400">
        <CheckCircle2 className="size-3" />
        Ready
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400">
        <Loader2 className="size-3 animate-spin" />
        Processing
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-destructive/40 text-destructive">
      <XCircle className="size-3" />
      Failed
    </Badge>
  );
}

// ── IMPORT ────────────────────────────────────────────────────────────────

function ImportSection() {
  const jobs = useQuery(api.imports.listImportJobs, {});
  const uploadLimit = useQuery(api.imports.getUploadLimit, {});
  const prepareImport = useMutation(api.imports.prepareImport);
  const createUploadUrl = useAction(api.importsWorker.createUploadUrl);
  const confirmImportUpload = useMutation(api.imports.confirmImportUpload);
  const cancelImport = useMutation(api.imports.cancelImport);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [provider, setProvider] = useState<ImportProvider>("chatgpt");
  const [uploadState, setUploadState] = useState<
    | { phase: "idle" }
    | { phase: "uploading"; filename: string; percent: number }
    | { phase: "queued" }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  const activeJob = jobs?.find(
    (job) => job.status === "queued" || job.status === "processing",
  );

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(json|zip)$/i.test(file.name)) {
      setUploadState({
        phase: "error",
        message: "Please select a .json (or .zip) export file.",
      });
      return;
    }
    // Client-side check against the plan limit so we fail fast without the
    // server round trip. The mutation re-validates so this can't be bypassed.
    if (uploadLimit && file.size > uploadLimit.limitBytes) {
      setUploadState({
        phase: "error",
        message: `File is ${formatBytes(file.size)} but your ${uploadLimit.planTier} plan allows up to ${formatBytes(uploadLimit.limitBytes)}. Upgrade or split the file.`,
      });
      return;
    }

    setUploadState({ phase: "uploading", filename: file.name, percent: 0 });
    try {
      // 1. Reserve a job + size budget on the backend (plan check happens here).
      const { jobId } = await prepareImport({
        provider,
        filename: file.name,
        contentLength: file.size,
        contentType: file.type || "application/json",
      });
      // 2. Get a presigned PUT URL bound to that job's R2 key.
      const { uploadUrl } = await createUploadUrl({ jobId });

      // 3. PUT directly to R2 with progress reporting via XHR (fetch has no
      //    upload progress events). The signed URL fixes content-type +
      //    content-length, so any tampering by the client would 403.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type || "application/json");
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadState({ phase: "uploading", filename: file.name, percent });
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`R2 rejected upload (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.send(file);
      });

      // 4. Tell the backend the upload landed; this schedules the parser.
      await confirmImportUpload({ jobId });
      setUploadState({ phase: "queued" });
    } catch (err) {
      setUploadState({
        phase: "error",
        message: err instanceof Error ? err.message : "Upload failed.",
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const isUploading = uploadState.phase === "uploading";
  const isDisabled = isUploading || !!activeJob;

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Import from another assistant</h3>
        <p className="text-xs text-muted-foreground">
          We import the oldest and newest conversations first so you can chat with
          full context within seconds. The rest streams in quietly in the background.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PROVIDER_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`group cursor-pointer rounded-xl border p-4 transition-all ${
              provider === option.value
                ? "border-primary/60 bg-primary/[0.04] shadow-[0_0_0_1px_var(--primary)/0.2]"
                : "border-border/60 bg-background/70 hover:border-foreground/20"
            } ${isDisabled ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              type="radio"
              name="import-provider"
              value={option.value}
              checked={provider === option.value}
              onChange={() => setProvider(option.value)}
              className="sr-only"
            />
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{option.label}</div>
              {provider === option.value ? (
                <CheckCircle2 className="size-4 text-primary" />
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {option.hint}
            </p>
          </label>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-foreground/5 text-foreground/80">
            <Upload className="size-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {isUploading
                ? `Uploading ${uploadState.filename}…`
                : activeJob
                  ? "An import is already running"
                  : "Drop your export file or browse"}
            </p>
            <p className="text-xs text-muted-foreground">
              {uploadLimit
                ? `JSON up to ${formatBytes(uploadLimit.limitBytes)} on your ${uploadLimit.planTier} plan. Uploaded directly to encrypted object storage.`
                : "JSON file. Uploaded directly to encrypted object storage."}
            </p>
          </div>
          {isUploading ? (
            <div className="w-full max-w-xs space-y-1.5">
              <Progress value={uploadState.percent} className="h-1.5" />
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {uploadState.percent}%
              </p>
            </div>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={isDisabled}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Uploading
              </>
            ) : (
              <>
                <Upload className="size-4" />
                Choose file
              </>
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json,.zip"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </div>
      </div>

      {uploadState.phase === "error" ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Upload failed</AlertTitle>
          <AlertDescription>{uploadState.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-3">
        {jobs === undefined ? (
          <ExportSkeleton />
        ) : jobs.length === 0 ? null : (
          jobs.map((job) => (
            <ImportJobCard
              key={job._id}
              jobId={job._id}
              onCancel={() => void cancelImport({ jobId: job._id })}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ImportJobCard({
  jobId,
  onCancel,
}: {
  jobId: Id<"importJobs">;
  onCancel: () => void;
}) {
  const detail = useQuery(api.imports.getImportJob, { jobId });
  if (!detail) return null;

  const { job, phase1, phase2, currentChunk } = detail;
  const isActive = job.status === "queued" || job.status === "processing";
  const isDone = job.status === "completed";
  const isFailed = job.status === "failed";
  const isCanceled = job.status === "canceled";
  const phase1Ready = !!job.phase1CompletedAt;
  const percent = Math.round((job.progress ?? 0) * 100);

  return (
    <div className="rounded-xl border border-border/60 bg-background/70 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span>
              {job.sourceFilename ?? job.provider} ·{" "}
              {job.totalConversations} conversations
            </span>
            {isActive ? (
              <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400">
                <Loader2 className="size-3 animate-spin" />
                {job.currentStage ?? "running"}
              </Badge>
            ) : isDone ? (
              <Badge variant="outline" className="border-green-500/30 text-green-600 dark:text-green-400">
                <CheckCircle2 className="size-3" />
                Complete
              </Badge>
            ) : isFailed ? (
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                <XCircle className="size-3" />
                Failed
              </Badge>
            ) : isCanceled ? (
              <Badge variant="outline">Canceled</Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Started {formatTimestamp(job.createdAt)}
            {job.completedAt ? ` · finished ${formatTimestamp(job.completedAt)}` : ""}
          </p>
        </div>
        {isActive ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Progress value={percent} className="h-1.5" />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>
            {job.processedConversations} / {job.totalConversations} conversations
          </span>
          <span>{percent}%</span>
        </div>
      </div>

      {phase1Ready && isActive ? (
        <div className="rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2 text-xs">
          <span className="font-medium text-primary">Phase 1 complete.</span>{" "}
          Your most important memories are ready while the rest continues importing.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <PhaseLine
          label="Phase 1 (priority)"
          done={phase1.done}
          total={phase1.total}
          icon={Clock}
        />
        <PhaseLine
          label="Phase 2 (background)"
          done={phase2.done}
          total={phase2.total}
          icon={Clock}
        />
      </div>

      {currentChunk && isActive ? (
        <p className="text-[11px] text-muted-foreground italic">
          Currently importing {currentChunk.chunkType} batch ·{" "}
          {currentChunk.conversationCount} conversations
        </p>
      ) : null}

      {isFailed && job.errorMessage ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>{job.errorMessage}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function PhaseLine({
  label,
  done,
  total,
  icon: Icon,
}: {
  label: string;
  done: number;
  total: number;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-center justify-between rounded-md bg-foreground/[0.03] px-2.5 py-1.5">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </span>
      <span className="font-medium tabular-nums">
        {done}/{total || 0}
      </span>
    </div>
  );
}
