import { useCallback, useEffect, useRef, useState } from "react"
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  FileTextIcon,
  FileUpIcon,
  FolderOpenIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
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
import { DocumentPreviewDrawer } from "@/components/document-preview-drawer"

type IngestUi = { pct: number; step: string }

const ACCEPTED = [".pdf", ".md", ".txt"]
const ACCEPTED_MIME = ["application/pdf", "text/markdown", "text/plain", "text/x-markdown"]

function isAccepted(f: File) {
  const ext = "." + (f.name.split(".").pop()?.toLowerCase() ?? "")
  return ACCEPTED.includes(ext) || ACCEPTED_MIME.includes(f.type)
}

function statusColor(status: string) {
  if (status === "indexed") return "bg-primary/15 text-primary"
  if (status === "error") return "bg-destructive/15 text-destructive"
  return "bg-muted/40 text-muted-foreground"
}

export function CorpusPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [search, setSearch] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<string[]>([])
  const [ingestUi, setIngestUi] = useState<Record<string, IngestUi>>({})
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<Source | null>(null)
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
        setIngestUi((prev) => ({ ...prev, [sourceId]: { pct: ev.pct ?? 0, step: ev.step ?? "Processing…" } }))
      }
      if (ev.event === "ingest_done" || ev.event === "ingest_error") {
        setIngestUi((prev) => { const n = { ...prev }; delete n[sourceId]; return n })
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
    if (!valid.length) { setError(`No supported files (${ACCEPTED.join(", ")})`); return }
    setUploading(true); setError(null)
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
        if (!res.ok) throw new Error(await res.text())
        const src = (await res.json()) as Source
        setSources((prev) => [src, ...prev.filter((s) => s.id !== src.id)])
        setIngestUi((prev) => ({ ...prev, [src.id]: { pct: 5, step: "Queued" } }))
        trackIngest(src.id)
      } catch (e) { setError(e instanceof Error ? e.message : `Failed: ${file.name}`) }
      setUploadQueue((q) => q.filter((n) => n !== file.name))
    }
    setUploading(false)
    setSuccessMsg(`${valid.length} file${valid.length !== 1 ? "s" : ""} queued.`)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  async function onRetrySource(id: string) {
    try { await retrySourceIngest(id); setIngestUi((prev) => ({ ...prev, [id]: { pct: 5, step: "Queued" } })); trackIngest(id) }
    catch (e) { setError(e instanceof Error ? e.message : "Retry failed") }
  }

  async function onConfirmDelete() {
    if (!confirmDelete) return
    const id = confirmDelete; setConfirmDelete(null)
    try { await deleteSource(id); setSources((prev) => prev.filter((s) => s.id !== id)) }
    catch (e) { setError(e instanceof Error ? e.message : "Delete failed") }
  }

  async function onConfirmClear() {
    setConfirmClear(false)
    try {
      const r = await resetCorpus(true); setSources([]); setIngestUi({})
      setSuccessMsg(`Cleared ${r.deleted} document${r.deleted !== 1 ? "s" : ""}.`)
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (e) { setError(e instanceof Error ? e.message : "Clear failed") }
  }

  const filtered = search.trim()
    ? sources.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : sources

  const indexedCount = sources.filter((s) => s.status === "indexed").length
  const processingCount = sources.filter((s) => ["pending", "processing"].includes(s.status)).length

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">

      {/* Banners */}
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}><XIcon className="size-4" /></button>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
          <CheckCircle2Icon className="size-4 shrink-0" />{successMsg}
        </div>
      )}

      {/* Confirm dialogs */}
      {confirmDelete && (
        <div className="rounded-xl border border-destructive/50 bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Remove this document?</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={onConfirmDelete}>Remove</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {confirmClear && (
        <div className="rounded-xl border border-destructive/50 bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Delete ALL documents?</p>
          <p className="text-xs text-muted-foreground">Sessions will lose source links.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={onConfirmClear}>Delete all</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Upload zone */}
      <div
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-surface/40 px-6 py-8 text-center transition-colors ${dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/60"}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = Array.from(e.dataTransfer.files); if (f.length) uploadFiles(f) }}
      >
        <FileUpIcon className="mb-2 size-8 text-muted-foreground" />
        <p className="font-medium text-sm">{uploading ? "Uploading…" : "Drop files or folder here"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">PDF, MD, TXT — max 50 MB each</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <FileTextIcon className="size-4" /> Pick files
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.md,.txt" multiple
            onChange={(e) => { if (e.target.files?.length) { uploadFiles(Array.from(e.target.files)); e.target.value = "" } }} />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => folderInputRef.current?.click()}>
            <FolderOpenIcon className="size-4" /> Pick folder
          </Button>
          {/* @ts-ignore */}
          <input ref={folderInputRef} type="file" className="hidden" webkitdirectory="" multiple
            onChange={(e) => { if (e.target.files?.length) { uploadFiles(Array.from(e.target.files)); e.target.value = "" } }} />
        </div>
        {uploadQueue.length > 0 && (
          <div className="mt-3 w-full max-w-sm space-y-1">
            {uploadQueue.map((name) => (
              <div key={name} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin shrink-0" /><span className="truncate">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats + search */}
      {sources.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <span>{sources.length} doc{sources.length !== 1 ? "s" : ""}</span>
            {indexedCount > 0 && <span className="text-primary">{indexedCount} indexed</span>}
            {processingCount > 0 && (
              <span className="flex items-center gap-1 text-amber-400">
                <Loader2Icon className="size-3 animate-spin" />{processingCount} indexing
              </span>
            )}
          </div>
          <button type="button" onClick={() => setConfirmClear(true)}
            className="shrink-0 text-xs text-muted-foreground hover:text-destructive hover:underline underline-offset-2">
            Clear all
          </button>
        </div>
      )}

      {/* Source grid */}
      {filtered.length === 0 && sources.length === 0 && !uploading && (
        <p className="py-8 text-center text-sm text-muted-foreground">No documents yet — upload files above.</p>
      )}
      {filtered.length === 0 && sources.length > 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">No results for "{search}"</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) => {
          const progress = ingestUi[s.id]
          return (
            <div key={s.id} className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/50">
              {/* File header */}
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface/60">
                  <FileTextIcon className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={s.name}>{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.byte_size ? `${(s.byte_size / 1024 / 1024).toFixed(1)} MB` : "—"}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(s.status)}`}>
                  {progress?.step ?? s.status}
                </span>
              </div>

              {/* Progress bar */}
              {progress && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/30">
                  <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress.pct}%` }} />
                </div>
              )}

              {s.error_message && (
                <p className="mt-2 text-xs text-destructive">{s.error_message}</p>
              )}

              {/* Actions */}
              <div className="mt-3 flex items-center gap-1 border-t border-border/60 pt-3">
                {/* Preview / open */}
                {s.status === "indexed" && (
                  <button type="button" onClick={() => setPreview(s)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs text-accent transition-colors hover:bg-accent/10">
                    <ExternalLinkIcon className="size-3.5" /> Preview
                  </button>
                )}

                {/* Retry */}
                {(s.status === "error" || s.status === "pending" || s.status === "processing") && (
                  <button type="button" aria-label="Retry" onClick={() => onRetrySource(s.id)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs text-muted-foreground transition-colors hover:text-primary">
                    <RefreshCwIcon className="size-3.5" /> Retry
                  </button>
                )}

                {/* Private toggle */}
                <label className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40">
                  <input type="checkbox" className="accent-primary size-3" checked={Boolean(s.is_private)}
                    onChange={(e) => patchSourcePrivacy(s.id, e.target.checked).then((u) =>
                      setSources((prev) => prev.map((x) => x.id === u.id ? u : x)))} />
                  Private
                </label>

                {/* Delete */}
                <button type="button" aria-label="Delete" onClick={() => setConfirmDelete(s.id)}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                  <Trash2Icon className="size-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Preview drawer */}
      {preview && (
        <DocumentPreviewDrawer
          sourceId={preview.id}
          sourceName={preview.name}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}
