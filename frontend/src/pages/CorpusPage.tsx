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
// F3: per-file upload progress
type UploadProgress = { name: string; pct: number }

// ── Helpers ──────────────────────────────────────────────────────────────────

const ACCEPTED = [".pdf", ".md", ".txt"]
const ACCEPTED_MIME = ["application/pdf", "text/markdown", "text/plain", "text/x-markdown"]

function isAccepted(f: File) {
  const ext = "." + (f.name.split(".").pop()?.toLowerCase() ?? "")
  return ACCEPTED.includes(ext) || ACCEPTED_MIME.includes(f.type)
}

// S5: Semantic status badge colors — green/blue/red/amber/grey
function statusBadge(status: string, step?: string) {
  const label = step ?? status
  if (status === "indexed")
    return <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-green-500/15 text-green-400">{label}</span>
  if (status === "error")
    return <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-destructive/15 text-destructive">{label}</span>
  if (status === "processing" || (status === "pending" && step))
    return <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/15 text-blue-400">
      <Loader2Icon className="size-2.5 animate-spin" />{label}
    </span>
  if (status === "pending")
    return <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted/40 text-muted-foreground">{label}</span>
  return <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted/40 text-muted-foreground">{label}</span>
}

// S4: already good — fmt is used for human-readable sizes
function fmt(bytes: number | null) {
  if (!bytes) return "—"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// S19: file type icon + color
function fileTypeIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (ext === "pdf") return <FileTextIcon className="size-3.5 shrink-0 text-red-400/70" />
  if (ext === "md") return <FileTextIcon className="size-3.5 shrink-0 text-blue-400/70" />
  return <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
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

// F7: persist collapse state to sessionStorage
function loadCollapsed(): Set<string> {
  try {
    const raw = sessionStorage.getItem("corpus_collapsed")
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set()
}
function saveCollapsed(c: Set<string>) {
  try { sessionStorage.setItem("corpus_collapsed", JSON.stringify([...c])) } catch { /* ignore */ }
}

// ── Component ────────────────────────────────────────────────────────────────

export function CorpusPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [uploading, setUploading] = useState(false)
  // F3: per-file upload progress
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
  const [ingestUi, setIngestUi] = useState<Record<string, IngestUi>>({})
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<Source | null>(null)
  // F7: load from sessionStorage on mount
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)
  const loadRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api<Source[]>("/api/v1/sources")
      .then(setSources)
      .catch((e) => {
        console.error("Failed to load sources:", e)
        setError(e instanceof Error ? e.message : "Failed to load documents")
      })
      .finally(() => setLoading(false))
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

  // F3: XHR-based upload with per-file progress
  async function uploadFiles(files: File[]) {
    const valid = files.filter(isAccepted)
    if (!valid.length) { setError(`No supported files. Accepted: ${ACCEPTED.join(", ")}`); return }
    setUploading(true); setError(null)
    setUploadProgress(valid.map((f) => ({ name: f.name, pct: 0 })))

    for (const file of valid) {
      const form = new FormData()
      form.append("file", file)
      const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath
      if (relPath) form.append("folder_path", relPath)

      try {
        const token = localStorage.getItem("ownnblm_token")
        const src = await new Promise<Source>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open("POST", "/api/v1/sources")
          if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`)
          else if (import.meta.env.DEV) xhr.setRequestHeader("X-Dev-User-Id", "00000000-0000-4000-8000-000000000001")

          // F3: track upload bytes progress
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100)
              setUploadProgress((prev) => prev.map((p) => p.name === file.name ? { ...p, pct } : p))
            }
          }
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText) as Source)
            } else {
              reject(new Error(xhr.responseText || `HTTP ${xhr.status}`))
            }
          }
          xhr.onerror = () => reject(new Error("Network error"))
          xhr.send(form)
        })
        setSources((prev) => [src, ...prev.filter((s) => s.id !== src.id)])
        setIngestUi((prev) => ({ ...prev, [src.id]: { pct: 5, step: "Queued" } }))
        trackIngest(src.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : `Failed: ${file.name}`)
      }
      setUploadProgress((prev) => prev.filter((p) => p.name !== file.name))
    }
    setUploading(false)
    setUploadProgress([])
    setSuccessMsg(`${valid.length} file${valid.length !== 1 ? "s" : ""} queued for indexing.`)
    setTimeout(() => setSuccessMsg(null), 5000)
  }

  function toggleFolder(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) { next.delete(path) } else { next.add(path) }
      // F7: persist to sessionStorage
      saveCollapsed(next)
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
          <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}><XIcon className="size-4" /></button>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-400">
          <CheckCircle2Icon className="size-4 shrink-0" />{successMsg}
        </div>
      )}

      {/* ── Confirm dialogs ── */}
      {confirmDelete && (
        <div className="rounded-xl border border-destructive/50 bg-card p-4 space-y-2">
          <p className="text-sm font-medium">Remove this document from your corpus?</p>
          <p className="text-xs text-muted-foreground">This cannot be undone. Sessions referencing it will lose this source.</p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="destructive" onClick={onDelete}>Remove</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {confirmClear && (
        <div className="rounded-xl border border-destructive/50 bg-card p-4 space-y-2">
          <p className="text-sm font-medium">Delete ALL documents in this workspace?</p>
          <p className="text-xs text-muted-foreground">All sessions will lose source links.</p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="destructive" onClick={onClear}>Delete all</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
          </div>
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
          {/* @ts-expect-error webkitdirectory is not in standard React HTML types */}
          <input ref={folderInputRef} type="file" className="hidden" webkitdirectory="" multiple
            onChange={(e) => { if (e.target.files?.length) { uploadFiles(Array.from(e.target.files)); e.target.value = "" } }} />
        </div>

        {/* F3: per-file upload progress */}
        {uploadProgress.length > 0 && (
          <div className="mt-3 w-full max-w-sm space-y-2 text-left">
            {uploadProgress.map((p) => (
              <div key={p.name} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Loader2Icon className="size-3 animate-spin shrink-0" />
                    <span className="truncate">{p.name}</span>
                  </div>
                  <span className="shrink-0 tabular-nums">{p.pct}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-muted/30">
                  <div className="h-full rounded-full bg-accent transition-all duration-200" style={{ width: `${p.pct}%` }} />
                </div>
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
            {totalIndexed > 0 && <span className="text-green-400">{totalIndexed} indexed</span>}
            {totalProcessing > 0 && <span className="flex items-center gap-1 text-blue-400"><Loader2Icon className="size-3 animate-spin" />{totalProcessing} indexing</span>}
          </div>
          <button type="button" onClick={() => setConfirmClear(true)}
            className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-destructive hover:underline underline-offset-2">
            Clear all
          </button>
        </div>
      )}

      {/* ── Empty state ── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading documents...</p>
        </div>
      )}
      {!loading && sources.length === 0 && !uploading && (
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
                  aria-expanded={!isCollapsed}
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
                  <span /><span /><span /><span />
                </button>

                {/* ── Document rows ── */}
                {!isCollapsed && group.sources.map((s) => {
                  const progress = ingestUi[s.id]
                  return (
                    <div key={s.id} className="border-t border-border/40 last:border-b-0">
                      <div className="grid grid-cols-[1fr_80px_90px_70px_28px_28px_28px] items-center gap-1 px-3 py-1.5 text-xs transition-colors hover:bg-muted/20">
                        {/* Name — S19: file type icon */}
                        <span className="flex min-w-0 items-center gap-2 pl-7">
                          {fileTypeIcon(s.name)}
                          <span className="truncate text-foreground/90" title={s.name}>{s.name}</span>
                        </span>
                        {/* Size */}
                        <span className="text-right text-[10px] text-muted-foreground tabular-nums">{fmt(s.byte_size)}</span>
                        {/* Status — S5: semantic colors applied via statusBadge */}
                        <span>{statusBadge(s.status, progress?.step)}</span>
                        {/* Private */}
                        <span className="flex justify-center">
                          <input
                            type="checkbox"
                            aria-label={`Toggle private for ${s.name}`}
                            className="size-3 accent-primary cursor-pointer"
                            checked={Boolean(s.is_private)}
                            onChange={(e) => patchSourcePrivacy(s.id, e.target.checked).then((u) =>
                              setSources((prev) => prev.map((x) => x.id === u.id ? u : x)))}
                          />
                        </span>
                        {/* Preview */}
                        <span className="flex justify-center">
                          {s.status === "indexed" && (
                            <button type="button" title="Preview document" aria-label={`Preview ${s.name}`} onClick={() => setPreview(s)}
                              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-accent">
                              <ExternalLinkIcon className="size-3.5" />
                            </button>
                          )}
                        </span>
                        {/* Retry */}
                        <span className="flex justify-center">
                          {["error", "pending", "processing"].includes(s.status) && (
                            <button type="button" title="Retry ingest" aria-label={`Retry ${s.name}`} onClick={() => onRetry(s.id)}
                              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-blue-400">
                              <RefreshCwIcon className="size-3.5" />
                            </button>
                          )}
                        </span>
                        {/* Delete */}
                        <span className="flex justify-center">
                          <button type="button" title="Delete document" aria-label={`Delete ${s.name}`} onClick={() => setConfirmDelete(s.id)}
                            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive">
                            <Trash2Icon className="size-3.5" />
                          </button>
                        </span>
                      </div>
                      {/* Ingest progress bar */}
                      {progress && (
                        <div className="ml-12 mr-3 mb-1 h-1 overflow-hidden rounded-full bg-muted/20">
                          <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${progress.pct}%` }} />
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
