/**
 * CorpusPage — folder-tree hierarchy view of uploaded documents.
 *
 * Layout:
 *  - Upload zone (drag-drop / pick files / pick folder)
 *  - Folder tree: collapsible folder rows as master groups
 *  - Compact Excel-row document rows inside each folder
 *  - Root-level files (no folder) shown under "/ (root)"
 *
 * Folder_path is set on upload from the webkitRelativePath of the File.
 * Documents carry: name, folder path, status badge, size, private toggle,
 * preview link, retry, delete — all in one tight row.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const ACCEPTED = [".pdf", ".md", ".txt"]
const ACCEPTED_MIME = ["application/pdf", "text/markdown", "text/plain", "text/x-markdown"]

function isAccepted(f: File) {
  const ext = "." + (f.name.split(".").pop()?.toLowerCase() ?? "")
  return ACCEPTED.includes(ext) || ACCEPTED_MIME.includes(f.type)
}

function statusBadge(status: string, step?: string) {
  const label = step ?? status
  if (status === "indexed") return <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/15 text-primary">{label}</span>
  if (status === "error") return <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-destructive/15 text-destructive">{label}</span>
  if (status === "processing" || status === "pending")
    return <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-400"><Loader2Icon className="size-2.5 animate-spin" />{label}</span>
  return <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted/40 text-muted-foreground">{label}</span>
}

function fmt(bytes: number | null) {
  if (!bytes) return "—"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Group sources into folder buckets
type FolderGroup = { path: string; label: string; sources: Source[] }

function buildTree(sources: Source[], search: string): FolderGroup[] {
  const q = search.toLowerCase()
  const filtered = q ? sources.filter((s) => s.name.toLowerCase().includes(q) || (s.folder_path ?? "").toLowerCase().includes(q)) : sources

  const map = new Map<string, Source[]>()
  for (const s of filtered) {
    const key = s.folder_path ?? ""
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }

  // Sort: root first, then alphabetical
  const keys = [...map.keys()].sort((a, b) => {
    if (!a) return -1
    if (!b) return 1
    return a.localeCompare(b)
  })

  return keys.map((path) => ({
    path,
    label: path || "/ (root)",
    sources: map.get(path)!,
  }))
}

// ── Component ────────────────────────────────────────────────────────────────

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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
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
      if (ev.event === "ingest_progress")
        setIngestUi((prev) => ({ ...prev, [sourceId]: { pct: ev.pct ?? 0, step: ev.step ?? "Processing…" } }))
      if (ev.event === "ingest_done" || ev.event === "ingest_error") {
        setIngestUi((prev) => { const n = { ...prev }; delete n[sourceId]; return n })
        load()
      }
    })
  }, [load])

  useEffect(() => {
    const active = sources.filter((s) => ["pending", "processing"].includes(s.status))
    const unsubs = active.map((s) => trackIngest(s.id))
    return () => unsubs.forEach((u) => u())
  }, [sources, trackIngest])

  async function uploadFiles(files: File[]) {
    const valid = files.filter(isAccepted)
    if (!valid.length) { setError(`No supported files. Accepted: ${ACCEPTED.join(", ")}`); return }
    setUploading(true); setError(null)
    setUploadQueue(valid.map((f) => f.name))

    for (const file of valid) {
      const form = new FormData()
      form.append("file", file)
      // Preserve relative path from webkitdirectory (e.g. "Research/Papers/doc.pdf")
      const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath
      if (relPath) form.append("folder_path", relPath)

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
    setSuccessMsg(`${valid.length} file${valid.length !== 1 ? "s" : ""} queued for indexing.`)
    setTimeout(() => setSuccessMsg(null), 5000)
  }

  function toggleFolder(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  async function onRetry(id: string) {
    try { await retrySourceIngest(id); setIngestUi((prev) => ({ ...prev, [id]: { pct: 5, step: "Queued" } })); trackIngest(id) }
    catch (e) { setError(e instanceof Error ? e.message : "Retry failed") }
  }

  async function onDelete() {
    if (!confirmDelete) return
    const id = confirmDelete; setConfirmDelete(null)
    try { await deleteSource(id); setSources((prev) => prev.filter((s) => s.id !== id)) }
    catch (e) { setError(e instanceof Error ? e.message : "Delete failed") }
  }

  async function onClear() {
    setConfirmClear(false)
    try {
      const r = await resetCorpus(true); setSources([]); setIngestUi({})
      setSuccessMsg(`Cleared ${r.deleted} document${r.deleted !== 1 ? "s" : ""}.`)
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (e) { setError(e instanceof Error ? e.message : "Clear failed") }
  }

  const tree = buildTree(sources, search)
  const totalIndexed = sources.filter((s) => s.status === "indexed").length
  const totalProcessing = sources.filter((s) => ["pending", "processing"].includes(s.status)).length

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">

      {/* ── Banners ── */}
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

      {/* ── Confirm dialogs ── */}
      {confirmDelete && (
        <div className="rounded-xl border border-destructive/50 bg-card p-4 space-y-2">
          <p className="text-sm font-medium">Remove this document from your corpus?</p>
          <p className="text-xs text-muted-foreground">This cannot be undone. Sessions referencing it will lose this source.</p>
          <div className="flex gap-2 pt-1"><Button size="sm" variant="destructive" onClick={onDelete}>Remove</Button><Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button></div>
        </div>
      )}
      {confirmClear && (
        <div className="rounded-xl border border-destructive/50 bg-card p-4 space-y-2">
          <p className="text-sm font-medium">Delete ALL documents in this workspace?</p>
          <p className="text-xs text-muted-foreground">All sessions will lose source links.</p>
          <div className="flex gap-2 pt-1"><Button size="sm" variant="destructive" onClick={onClear}>Delete all</Button><Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button></div>
        </div>
      )}

      {/* ── Upload zone ── */}
      <div
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-surface/40 px-6 py-6 text-center transition-colors ${dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/60"}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = Array.from(e.dataTransfer.files); if (f.length) uploadFiles(f) }}
      >
        <FileUpIcon className="mb-2 size-7 text-muted-foreground" />
        <p className="text-sm font-medium">{uploading ? "Uploading…" : "Drop files or a folder here"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">PDF, MD, TXT — max 50 MB · folder structure preserved</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <FileTextIcon className="size-3.5" /> Pick files
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.md,.txt" multiple
            onChange={(e) => { if (e.target.files?.length) { uploadFiles(Array.from(e.target.files)); e.target.value = "" } }} />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => folderInputRef.current?.click()}>
            <FolderOpenIcon className="size-3.5" /> Pick folder
          </Button>
          {/* @ts-ignore */}
          <input ref={folderInputRef} type="file" className="hidden" webkitdirectory="" multiple
            onChange={(e) => { if (e.target.files?.length) { uploadFiles(Array.from(e.target.files)); e.target.value = "" } }} />
        </div>
        {uploadQueue.length > 0 && (
          <div className="mt-3 w-full max-w-sm space-y-1 text-left">
            {uploadQueue.map((name) => (
              <div key={name} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin shrink-0" /><span className="truncate">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Toolbar ── */}
      {sources.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or folder…"
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs focus:border-accent focus:outline-none" />
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <span>{sources.length} file{sources.length !== 1 ? "s" : ""}</span>
            {totalIndexed > 0 && <span className="text-primary">{totalIndexed} indexed</span>}
            {totalProcessing > 0 && <span className="flex items-center gap-1 text-amber-400"><Loader2Icon className="size-3 animate-spin" />{totalProcessing} indexing</span>}
          </div>
          <button type="button" onClick={() => setConfirmClear(true)}
            className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-destructive hover:underline underline-offset-2">
            Clear all
          </button>
        </div>
      )}

      {/* ── Empty state ── */}
      {sources.length === 0 && !uploading && (
        <p className="py-10 text-center text-sm text-muted-foreground">No documents yet — upload files or pick a folder above.</p>
      )}

      {/* ── Folder tree ── */}
      {tree.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Column header */}
          <div className="grid grid-cols-[1fr_80px_90px_70px_28px_28px_28px] items-center gap-1 border-b border-border bg-surface/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Name</span>
            <span className="text-right">Size</span>
            <span>Status</span>
            <span className="text-center">Private</span>
            <span />
            <span />
            <span />
          </div>

          {tree.map((group) => {
            const isCollapsed = collapsed.has(group.path)
            const hasFolder = group.path !== ""
            const groupIndexed = group.sources.filter((s) => s.status === "indexed").length

            return (
              <div key={group.path} className="border-b border-border last:border-b-0">
                {/* ── Folder row ── */}
                <button
                  type="button"
                  onClick={() => toggleFolder(group.path)}
                  className="grid w-full grid-cols-[1fr_80px_90px_70px_28px_28px_28px] items-center gap-1 bg-surface/30 px-3 py-2 text-left transition-colors hover:bg-muted/30"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {isCollapsed ? <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />}
                    {hasFolder ? <FolderOpenIcon className="size-4 shrink-0 text-accent/80" /> : <FileUpIcon className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="truncate text-xs font-semibold text-foreground">{group.label}</span>
                  </span>
                  <span className="text-right text-[10px] text-muted-foreground">
                    {group.sources.reduce((sum, s) => sum + (s.byte_size ?? 0), 0) > 0
                      ? fmt(group.sources.reduce((sum, s) => sum + (s.byte_size ?? 0), 0))
                      : ""}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {groupIndexed}/{group.sources.length} indexed
                  </span>
                  <span />
                  <span />
                  <span />
                  <span />
                </button>

                {/* ── Document rows ── */}
                {!isCollapsed && group.sources.map((s) => {
                  const progress = ingestUi[s.id]
                  return (
                    <div key={s.id} className="border-t border-border/40 last:border-b-0">
                      <div className="grid grid-cols-[1fr_80px_90px_70px_28px_28px_28px] items-center gap-1 px-3 py-1.5 text-xs transition-colors hover:bg-muted/20">
                        {/* Name */}
                        <span className="flex min-w-0 items-center gap-2 pl-7">
                          <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
                          <span className="truncate text-foreground/90" title={s.name}>{s.name}</span>
                        </span>
                        {/* Size */}
                        <span className="text-right text-[10px] text-muted-foreground tabular-nums">{fmt(s.byte_size)}</span>
                        {/* Status */}
                        <span>{statusBadge(s.status, progress?.step)}</span>
                        {/* Private */}
                        <span className="flex justify-center">
                          <input type="checkbox" className="size-3 accent-primary cursor-pointer" checked={Boolean(s.is_private)}
                            onChange={(e) => patchSourcePrivacy(s.id, e.target.checked).then((u) =>
                              setSources((prev) => prev.map((x) => x.id === u.id ? u : x)))} />
                        </span>
                        {/* Preview */}
                        <span className="flex justify-center">
                          {s.status === "indexed" && (
                            <button type="button" title="Preview" onClick={() => setPreview(s)}
                              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-accent">
                              <ExternalLinkIcon className="size-3.5" />
                            </button>
                          )}
                        </span>
                        {/* Retry */}
                        <span className="flex justify-center">
                          {["error", "pending", "processing"].includes(s.status) && (
                            <button type="button" title="Retry" onClick={() => onRetry(s.id)}
                              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-primary">
                              <RefreshCwIcon className="size-3.5" />
                            </button>
                          )}
                        </span>
                        {/* Delete */}
                        <span className="flex justify-center">
                          <button type="button" title="Delete" onClick={() => setConfirmDelete(s.id)}
                            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive">
                            <Trash2Icon className="size-3.5" />
                          </button>
                        </span>
                      </div>
                      {/* Ingest progress bar */}
                      {progress && (
                        <div className="ml-12 mr-3 mb-1 h-1 overflow-hidden rounded-full bg-muted/20">
                          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress.pct}%` }} />
                        </div>
                      )}
                      {s.error_message && (
                        <p className="ml-12 mb-1 text-[10px] text-destructive">{s.error_message}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Preview drawer ── */}
      {preview && (
        <DocumentPreviewDrawer sourceId={preview.id} sourceName={preview.name} onClose={() => setPreview(null)} />
      )}
    </div>
  )
}
