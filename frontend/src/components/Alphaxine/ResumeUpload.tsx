import { useState, useRef, useCallback, useEffect } from "react";
import {
  UploadCloud, FileText, AlertCircle, CheckCircle2, RefreshCw,
  X, Loader2, FolderOpen, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────────────────────

type FileStatus = "pending" | "uploading" | "processing" | "success" | "duplicate" | "error";

interface FileEntry {
  id: string;            // unique local id
  file: File;
  status: FileStatus;
  candidateName?: string;
  candidateEmail?: string;
  duplicateReason?: string;
  duplicateScore?: number;
  errorMessage?: string;
  resumeId?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCEPTED = ".pdf,.docx,.png,.jpg,.jpeg";
const MAX_MB   = 10;

const REASON_LABELS: Record<string, string> = {
  EXACT_FILENAME:     "Exact filename match",
  EMAIL_MATCH:        "Email address match",
  NAME_SKILL_OVERLAP: "Name + skill overlap",
  NAME_EXP_OVERLAP:   "Name + experience overlap",
  SKILL_OVERLAP:      "Strong skill overlap",
  SUMMARY_MATCH:      "Professional profile match",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatMB(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

const STATUS_STYLES: Record<FileStatus, { row: string; badge: string; label: string }> = {
  pending:   { row: "",                badge: "bg-slate-100 text-slate-500 border border-slate-200",             label: "Queued" },
  uploading: { row: "bg-blue-50/40",   badge: "bg-blue-50 text-blue-700 border border-blue-200 animate-pulse",  label: "Uploading…" },
  processing:{ row: "bg-orange-50/40", badge: "bg-orange-50 text-orange-700 border border-orange-200 animate-pulse",label: "Parsing AI…" },
  success:   { row: "bg-green-50/40",  badge: "bg-green-50 text-green-700 border border-green-200",              label: "Added" },
  duplicate: { row: "bg-amber-50/40",  badge: "bg-amber-50 text-amber-700 border border-amber-200",              label: "Duplicate" },
  error:     { row: "bg-red-50/40",    badge: "bg-red-50 text-red-700 border border-red-200",                    label: "Error" },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function ResumeUpload() {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── File selection ──────────────────────────────────────────────────────

  const addFiles = useCallback((rawFiles: FileList | File[]) => {
    const incoming = Array.from(rawFiles).filter(f => {
      if (f.size > MAX_MB * 1024 * 1024) return false;       // size guard
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      return ["pdf", "docx", "png", "jpg", "jpeg"].includes(ext);
    });
    if (!incoming.length) return;

    setEntries(prev => {
      // de-duplicate by name+size so drag-dropping same file twice doesn't double-add
      const existing = new Set(prev.map(e => e.file.name + e.file.size));
      const fresh = incoming
        .filter(f => !existing.has(f.name + f.size))
        .map(file => ({ id: uid(), file, status: "pending" as FileStatus }));
      return [...prev, ...fresh];
    });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    // reset input so the same file can be re-selected after removal
    e.target.value = "";
  };

  const removeEntry = (id: string) =>
    setEntries(prev => prev.filter(e => e.id !== id));

  const clearAll = () => setEntries([]);

  // ── Drag-and-drop ───────────────────────────────────────────────────────

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  // ── Upload logic ────────────────────────────────────────────────────────

  const uploadOne = async (entry: FileEntry): Promise<Partial<FileEntry>> => {
    const formData = new FormData();
    formData.append("resume", entry.file);
    const token = localStorage.getItem("token");

    const response = await fetch("http://localhost:5000/api/resumes/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return { status: "error", errorMessage: data.error || "Upload failed" };
    }

    return {
      status: "processing",
      resumeId: data.resumeId,
    };
  };

  const handleUploadAll = async () => {
    const pending = entries.filter(e => e.status === "pending");
    if (!pending.length) return;

    setIsRunning(true);

    // Concurrency limit: upload up to 3 files in parallel
    const CONCURRENCY_LIMIT = 3;
    const queue = [...pending];

    const worker = async () => {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry) continue;

        // mark as uploading
        setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: "uploading" } : e));

        try {
          const result = await uploadOne(entry);
          setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ...result } : e));
        } catch {
          setEntries(prev => prev.map(e =>
            e.id === entry.id ? { ...e, status: "error", errorMessage: "Network error" } : e
          ));
        }
      }
    };

    // Spawn concurrent workers
    const workers = Array(Math.min(CONCURRENCY_LIMIT, pending.length))
      .fill(null)
      .map(() => worker());

    // Wait for all uploads to complete
    await Promise.all(workers);

    setIsRunning(false);
  };

  useEffect(() => {
    const processingIds = entries
      .filter(e => e.status === "processing" && e.resumeId)
      .map(e => e.resumeId as number);

    if (processingIds.length === 0) return;

    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`http://localhost:5000/api/resumes/status?ids=${processingIds.join(",")}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error("Failed to check status");
        
        const statusList: any[] = await response.json();
        
        setEntries(prev => prev.map(entry => {
          if (entry.status !== "processing" || !entry.resumeId) return entry;
          
          const match = statusList.find(s => s.resume_id === entry.resumeId);
          if (!match) return entry;

          if (match.processing_status === "COMPLETED") {
            if (match.is_duplicate) {
              return {
                ...entry,
                status: "duplicate",
                candidateName: match.candidate_name || "Unknown",
                candidateEmail: match.candidate_email || "N/A",
                duplicateReason: match.duplicate_reason,
                duplicateScore: match.duplicate_score
              };
            } else {
              return {
                ...entry,
                status: "success",
                candidateName: match.candidate_name || "Unknown",
                candidateEmail: match.candidate_email || "N/A"
              };
            }
          } else if (match.processing_status === "FAILED") {
            return {
              ...entry,
              status: "error",
              errorMessage: match.error_message || "AI parsing failed"
            };
          }
          
          return entry;
        }));
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [entries]);

  // ── Derived counts ──────────────────────────────────────────────────────

  const counts = entries.reduce(
    (acc, e) => { acc[e.status] = (acc[e.status] ?? 0) + 1; return acc; },
    {} as Record<FileStatus, number>
  );
  const pendingCount   = counts.pending   ?? 0;
  const doneCount      = (counts.success ?? 0) + (counts.duplicate ?? 0) + (counts.error ?? 0);
  const total          = entries.length;
  const progressPct    = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const hasAnyResult   = doneCount > 0;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-6 gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Upload Resumes</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Select one or multiple files to parse and add to the talent pool.
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !isRunning && inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer select-none ${
          isDragging
            ? "border-[#F55036] bg-[#F55036]/5 scale-[1.01]"
            : "border-slate-300 hover:border-[#F55036]/50 bg-white hover:bg-orange-50/5"
        } ${isRunning ? "pointer-events-none opacity-60" : ""}`}
      >
        <div className="size-14 rounded-2xl bg-gradient-to-br from-[#F55036]/10 to-[#c9381f]/5 border border-[#F55036]/20 flex items-center justify-center mb-2">
          <UploadCloud className="size-7 text-[#F55036]" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-700">
            {isDragging ? "Drop files here" : "Click to select or drag & drop"}
          </h3>
          <p className="text-sm text-slate-400">
            PDF, DOCX, PNG, JPG supported
          </p>
          <p className="text-xs text-slate-400 mt-2">Up to {MAX_MB} MB per file</p>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (!isRunning) inputRef.current?.click(); }}
          className="mt-4 px-5 py-2.5 bg-gradient-to-r from-[#F55036] to-[#c9381f] text-white rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-orange-600/20 active:scale-95 transition-all duration-200"
        >
          Browse Files
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED}
          multiple
          onChange={handleInputChange}
        />
      </div>

      {/* File queue */}
      {entries.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Queue header */}
          <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">
                {total} file{total !== 1 ? "s" : ""} selected
              </span>
              {hasAnyResult && (
                <div className="flex items-center gap-2 text-xs">
                  {(counts.success ?? 0) > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      {counts.success} added
                    </span>
                  )}
                  {(counts.duplicate ?? 0) > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      {counts.duplicate} duplicate
                    </span>
                  )}
                  {(counts.error ?? 0) > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                      {counts.error} failed
                    </span>
                  )}
                </div>
              )}
            </div>
            {!isRunning && (
              <button
                onClick={clearAll}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Progress bar — shown while running or after completion */}
          {(isRunning || hasAnyResult) && (
            <div className="h-1.5 bg-slate-100">
              <div
                className="h-full bg-gradient-to-r from-primary to-orange-400 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          {/* File rows */}
          <ul className="flex flex-col gap-3 p-4 max-h-[420px] overflow-y-auto">
            {entries.map((entry) => {
              const style = STATUS_STYLES[entry.status];
              return (
                <li
                  key={entry.id}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex items-center gap-4 hover:border-slate-300 transition-all duration-200"
                >
                  {/* Icon */}
                  <div className="size-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                    {entry.status === "uploading" && (
                      <Loader2 className="size-5 text-blue-500 animate-spin" />
                    )}
                    {entry.status === "success" && (
                      <CheckCircle2 className="size-5 text-green-500" />
                    )}
                    {entry.status === "duplicate" && (
                      <RefreshCw className="size-5 text-amber-500" />
                    )}
                    {entry.status === "error" && (
                      <AlertCircle className="size-5 text-red-500" />
                    )}
                    {entry.status === "pending" && (
                      <FileText className="size-5 text-slate-400" />
                    )}
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-800 truncate max-w-[200px]" title={entry.file.name}>
                        {entry.file.name}
                      </span>
                      <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-lg ${style.badge}`}>
                        {style.label}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-0.5">{formatMB(entry.file.size)}</p>

                    {/* Result detail */}
                    {entry.status === "success" && entry.candidateName && (
                      <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                        <ChevronRight className="size-3" />
                        {entry.candidateName}
                        {entry.candidateEmail && <span className="text-green-500">({entry.candidateEmail})</span>}
                      </p>
                    )}
                    {entry.status === "duplicate" && (
                      <div className="mt-1 flex flex-wrap gap-2 items-center">
                        {entry.candidateName && (
                          <p className="text-xs text-amber-700 flex items-center gap-1">
                            <ChevronRight className="size-3" />
                            {entry.candidateName}
                          </p>
                        )}
                        {entry.duplicateScore !== undefined && (
                          <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                            Score {entry.duplicateScore}/100 — {REASON_LABELS[entry.duplicateReason ?? ""] ?? entry.duplicateReason}
                          </span>
                        )}
                      </div>
                    )}
                    {entry.status === "error" && entry.errorMessage && (
                      <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <ChevronRight className="size-3" />
                        {entry.errorMessage}
                      </p>
                    )}
                  </div>

                  {/* Remove button — only for pending items */}
                  {entry.status === "pending" && !isRunning && (
                    <button
                      onClick={() => removeEntry(entry.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all duration-200"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Action footer */}
          <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              {isRunning
                ? `Processing ${doneCount + 1} of ${total}…`
                : pendingCount > 0
                ? `${pendingCount} file${pendingCount !== 1 ? "s" : ""} ready to upload`
                : `All files processed`}
            </p>
            <div className="flex items-center gap-3">
              {!isRunning && entries.length > 0 && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all duration-200"
                >
                  <X className="size-4" />
                  Clear All
                </button>
              )}
              {isRunning ? (
                <button
                  onClick={() => setIsRunning(false)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl font-bold text-sm hover:bg-red-100 transition-all duration-200"
                >
                  <X className="size-4" />
                  Stop Upload
                </button>
              ) : (
                <button
                  onClick={handleUploadAll}
                  disabled={pendingCount === 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#F55036] to-[#c9381f] text-white rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-orange-600/20 active:scale-95 transition-all duration-200 disabled:opacity-50"
                >
                  <UploadCloud className="size-4" />
                  Upload {pendingCount > 1 ? `${pendingCount} Files` : "File"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state hint */}
      {entries.length === 0 && (
        <p className="mt-4 text-center text-xs text-slate-400">
          Tip: Select multiple files at once using Ctrl+Click or Shift+Click in the file picker.
        </p>
      )}
    </div>
  );
}
