import { useCallback, useEffect, useRef, useState } from "react"
import {
  CheckCircle2Icon,
  FileTextIcon,
  FileUpIcon,
  FolderOpenIcon,
  Loader2Icon,
  RefreshCwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import {
  api,
  deleteSource,
  patchSourcePrivacy,
  resetCorpus,
  retrySourceIngest,
  subscribeIngestEvents,
  type IngestEvent,
  type Source,
} from "@/lib/api"
import { Button } from "@/components/ui/button"

type IngestUi = { pct: number; step: string }

// Files accepted for ingestion
const ACCEPTED = [".pdf", ".md", ".txt"]
const ACCEPTED_MIME = ["application/pdf", "text/markdown", "text/plain", "text/x-markdown"]

function isAccepted(f: File) {
  const ext = "." + f.name.split(".").pop()?.toLowerCase()
  return ACCEPTED.includes(ext) || ACCEPTED_MIME.includes(f.type)
}

export function CorpusPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<string[]>([]) // filenames in progress
  const [ingestUi, setIngestUi] = useState<Record<string, IngestUi>>({})
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const loadRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    api<Source[]>("/api/v1/sources").then(setSources).catch(console.error)
  }, [])

  useEffect(() => {
    if (loadRef.current) return
    loadRef.current = true
    load()
  }, [load])

  const trackIngest = useCallback((sourceId: string) => {
    return subscribeIngestEvents(sourceId, (ev: IngestEvent) => {
      if (ev.event === "ingest_progress") {
        setIngestUi((prev) => ({
          ...prev,
          [sourceId]: { pct: ev.pct ?? 0, step: ev.step ?? "Processing…" },
        }))
      }
      if (ev.event === "ingest_done" || ev.event === "ingest_error") {
        setIngestUi((prev) => {
          const next = { ...prev }
          delete next[sourceId]
          return next
        })
        load()
      }
    })
  }, [load])

  useEffect(() => {
    const active = sources.filter((s) => s.status === "pending" || s.status === "processing")
    const unsubs = active.map((s) => trackIngest(s.id))
    return () => unsubs.forEach((u) => u())
  }, [sources, trackIngest])

  async function uploadFiles(files: File[]) {
    const valid = files.filter(isAccepted)
    const skipped = files.length - valid.length
    if (!valid.length) {
      setError(`No supported files found. Accepted: ${ACCEPTED.join(", ")}`)
      return
    }
    if (skipped > 0) {
      setSuccessMsg(`Skipped ${skipped} unsupported file${skipped !== 1 ? "s" : ""}. Uploading ${valid.length} supported file${valid.length !== 1 ? "s" : ""}…`)
    }
    setUploading(true)
    setError(null)
    setUploadQueue(valid.map((f) => f.name))

    for (const file of valid) {
      const form = new FormData()
      form.append("file", file)
      try {
        const token = localStorage.getItem("ownnblm_token")
        const hdrs: Record<string, string> = {}
        if (token) hdrs.Authorization = `Bearer ${token}`
        else if (import.meta.env.DEV) hdrs["X-Dev-User-Id"] = "00000000-0000-4000-8000-000000000001"
        const res = await fetch("/api/v1/sources", { method: "POST", body: form, headers: hdrs })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || `Upload failed (${res.status})`)
        }
        const src = (await res.json()) as Source
        setSources((prev) => [src, ...prev.filter((s) => s.id !== src.id)])
        setIngestUi((prev) => ({ ...prev, [src.id]: { pct: 5, step: "Queued" } }))
        trackIngest(src.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : `Failed to upload ${file.name}`)
      }
      setUploadQueue((q) => q.filter((n) => n !== file.name))
    }
    setUploading(false)
    if (!error) setSuccessMsg(`${valid.length} file${valid.length !== 1 ? "s" : ""} queued for indexing.`)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const items = Array.from(e.dataTransfer.items)
    const files: File[] = []
    for (const item of items) {
      if (item.kind === "file") {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length) uploadFiles(files)
  }

  async function onConfirmDelete() {
    if (!confirmDelete) return
    const id = confirmDelete
    setConfirmDelete(null)
    try {
      await deleteSource(id)
      setSources((prev) => prev.filter((s) => s.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed")
    }
  }

  async function onConfirmClear() {
    setConfirmClear(false)
    try {
      const r = await resetCorpus(true)
      setSources([])
      setIngestUi({})
      setSuccessMsg(`Corpus cleared — ${r.deleted} document${r.deleted !== 1 ? "s" : ""} removed.`)
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed")
    }
  }

  async function onRetrySource(id: string) {
    try {
      await retrySourceIngest(id)
      setIngestUi((prev) => ({ ...prev, [id]: { pct: 5, step: "Queued" } }))
      trackIngest(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed")
    }
  }

  const indexedCount = sources.filter((s) => s.status === "indexed").length
  const processingCount = sources.filter((s) => ["pending", "processing"].includes(s.status)).length

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 lg:p-6">

      {/* Banners */}
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            <XIcon className="size-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
          <CheckCircle2Icon className="size-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Confirm dialogs */}
      {confirmDelete && (
        <div className="rounded-xl border border-destructive/50 bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Remove this document from your corpus?</p>
          <p className="text-xs text-muted-foreground">This cannot be undone. Sessions referencing it will lose this source.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={onConfirmDelete}>Remove</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {confirmClear && (
        <div className="rounded-xl border border-destructive/50 bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Delete ALL documents in this workspace?</p>
          <p className="text-xs text-muted-foreground">All sessions will lose their source links.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={onConfirmClear}>Delete all</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Upload zone */}
      <div
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-surface/40 p-10 text-center transition-colors duration-200 ${dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/60"}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <FileUpIcon className="mb-3 size-10 text-muted-foreground" />
        <p className="font-heading text-base font-medium">
          {uploading ? `Uploading…` : "Drop files or folder here"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">PDF, MD, TXT — max 50 MB each</p>

        {/* Upload buttons */}
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {/* File picker */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileTextIcon className="size-4" /> Pick files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.md,.txt"
            multiple
            onChange={(e) => { if (e.target.files?.length) { uploadFiles(Array.from(e.target.files)); e.target.value = "" } }}
          />

          {/* Folder picker — browser webkitdirectory */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderOpenIcon className="size-4" /> Pick folder
          </Button>
          {/* @ts-ignore — webkitdirectory is non-standard but widely supported */}
          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            // @ts-ignore
            webkitdirectory=""
            multiple
            onChange={(e) => {
              if (e.target.files?.length) {
                uploadFiles(Array.from(e.target.files))
                e.target.value = ""
              }
            }}
          />
        </div>

        {/* Upload queue progress */}
        {uploadQueue.length > 0 && (
          <div className="mt-4 w-full max-w-sm space-y-1">
            {uploadQueue.map((name) => (
              <div key={name} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin shrink-0" />
                <span className="truncate">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats bar */}
      {sources.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{sources.length} document{sources.length !== 1 ? "s" : ""}</span>
            {indexedCount > 0 && <span className="text-primary">{indexedCount} indexed</span>}
            {processingCount > 0 && (
              <span className="flex items-center gap-1 text-amber-400">
                <Loader2Icon className="size-3 animate-spin" />
                {processingCount} indexing…
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Source list */}
      {sources.length === 0 && !uploading && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No documents yet — upload files or pick a folder above.
        </p>
      )}

      <ul className="space-y-2">
        {sources.map((s) => {
          const progress = ingestUi[s.id]
          return (
            <li key={s.id} className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.byte_size ? `${(s.byte_size / 1024 / 1024).toFixed(1)} MB` : ""}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* Status badge */}
                  <span className={
                    s.status === "indexed"
                      ? "rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary"
                      : s.status === "error"
                        ? "rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive"
                        : "rounded-full bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
                  }>
                    {progress?.step ?? s.status}
                  </span>

                  {/* Private toggle */}
                  <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground" title="Private — hidden from other workspace members">
                    <input
                      type="checkbox"
                      checked={Boolean(s.is_private)}
                      onChange={(e) =>
                        patchSourcePrivacy(s.id, e.target.checked).then((updated) =>
                          setSources((prev) => prev.map((x) => (x.id === updated.id ? updated : x))),
                        )
                      }
                    />
                    Private
                  </label>

                  {/* Retry */}
                  {(s.status === "error" || s.status === "processing" || s.status === "pending") && (
                    <button
                      type="button"
                      aria-label="Retry ingest"
                      onClick={() => onRetrySource(s.id)}
                      className="text-muted-foreground hover:text-primary"
                    >
                      <RefreshCwIcon className="size-4" />
                    </button>
                  )}

                  {/* Delete */}
                  <button
                    type="button"
                    aria-label="Delete source"
                    onClick={() => setConfirmDelete(s.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2Icon className="size-4" />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              {progress && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/30">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${progress.pct}%` }}
                  />
                </div>
              )}

              {s.error_message && (
                <p className="mt-1 text-xs text-destructive">{s.error_message}</p>
              )}
            </li>
          )
        })}
      </ul>

    </div>
  )
}
