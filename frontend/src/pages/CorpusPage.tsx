import { useCallback, useEffect, useRef, useState } from "react"
import { FileUpIcon, FolderOpenIcon, Loader2Icon, RefreshCwIcon, Trash2Icon, XIcon } from "lucide-react"

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
type FolderWatch = { id: string; path: string; enabled: boolean; last_scan_at: string | null }

export function CorpusPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [watches, setWatches] = useState<FolderWatch[]>([])
  const [watchPath, setWatchPath] = useState("")
  const [watchBusy, setWatchBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [ingestUi, setIngestUi] = useState<Record<string, IngestUi>>({})
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null) // source id
  const [confirmClear, setConfirmClear] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const loadRef = useRef(false)

  const load = useCallback(() => {
    api<Source[]>("/api/v1/sources").then(setSources).catch(console.error)
    api<FolderWatch[]>("/api/v1/watch").then(setWatches).catch(() => setWatches([]))
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

  async function onRetrySource(id: string) {
    try {
      await retrySourceIngest(id)
      setIngestUi((prev) => ({ ...prev, [id]: { pct: 5, step: "Queued" } }))
      trackIngest(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed")
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

  async function addWatch() {
    const path = watchPath.trim()
    if (!path) return
    setWatchBusy(true)
    try {
      await api("/api/v1/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      })
      setWatchPath("")
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add watch")
    } finally {
      setWatchBusy(false)
    }
  }

  async function removeWatch(id: string) {
    setWatchBusy(true)
    try {
      await api(`/api/v1/watch/${id}`, { method: "DELETE" })
      load()
    } finally {
      setWatchBusy(false)
    }
  }

  async function onUpload(files: FileList) {
    setUploading(true)
    setError(null)
    for (const file of Array.from(files)) {
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
      } catch (e) {
        setError(e instanceof Error ? e.message : `Failed to upload ${file.name}`)
      }
    }
    setUploading(false)
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
      {/* Error / success banners */}
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            <XIcon className="size-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
          {successMsg}
        </div>
      )}

      {/* Confirm delete dialog */}
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

      {/* Confirm clear corpus dialog */}
      {confirmClear && (
        <div className="rounded-xl border border-destructive/50 bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Delete ALL documents in this workspace?</p>
          <p className="text-xs text-muted-foreground">All sessions will lose their source links. Upload fresh files after clearing.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={onConfirmClear}>Delete all</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Upload zone */}
      <label
        className="upload-zone-pulse flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/40 p-10 transition-colors duration-200 hover:border-accent"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files) }}
      >
        <FileUpIcon className="mb-2 size-10 text-muted" />
        <span className="font-heading text-lg font-medium">
          {uploading ? "Uploading…" : "Drop files here or click to upload"}
        </span>
        <span className="mt-1 text-sm text-muted-foreground">PDF, MD, or TXT — max 50 MB · multiple files supported</span>
        <input
          type="file"
          className="hidden"
          accept=".pdf,.md,.txt"
          multiple
          disabled={uploading}
          onChange={(e) => { if (e.target.files?.length) onUpload(e.target.files) }}
        />
        {uploading && <Loader2Icon className="mt-3 size-5 animate-spin" />}
      </label>

      {/* Folder watch */}
      <section className="rounded-xl border border-border bg-surface/40 p-4">
        <div className="mb-2 flex items-center gap-2 font-heading text-sm font-medium">
          <FolderOpenIcon className="size-4" />
          Watched folders
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Server-side path on the API host. New PDF/MD/TXT files are ingested automatically.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={watchPath}
            onChange={(e) => setWatchPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addWatch()}
            placeholder="/path/to/your/documents"
            className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={watchBusy || !watchPath.trim()}
            onClick={addWatch}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {watchBusy ? <Loader2Icon className="size-4 animate-spin" /> : "Add watch"}
          </button>
        </div>
        {watches.length > 0 && (
          <ul className="mt-3 space-y-2">
            {watches.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span className="truncate font-mono text-xs">{w.path}</span>
                <button
                  type="button"
                  aria-label="Remove watch"
                  disabled={watchBusy}
                  onClick={() => removeWatch(w.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2Icon className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Source list */}
      {sources.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{sources.length} document{sources.length !== 1 ? "s" : ""} in corpus</p>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="text-xs text-muted-foreground underline hover:text-destructive"
            >
              Clear all documents
            </button>
          </div>

          <ul className="space-y-2">
            {sources.map((s) => {
              const progress = ingestUi[s.id]
              return (
                <li key={s.id} className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block truncate font-medium">{s.name}</span>
                      {s.byte_size && (
                        <span className="text-xs text-muted-foreground">
                          {(s.byte_size / 1024 / 1024).toFixed(1)} MB
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
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
                      <span
                        className={
                          s.status === "indexed"
                            ? "text-primary text-xs"
                            : s.status === "error"
                              ? "text-destructive text-xs"
                              : "text-muted-foreground text-xs"
                        }
                      >
                        {progress?.step ?? s.status}
                      </span>
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
                  {progress && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/30">
                      <div
                        className="progress-bar-fill h-full bg-primary transition-all"
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
        </>
      )}

      {sources.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-4">
          No documents yet — upload a PDF, MD, or TXT file above.
        </p>
      )}
    </div>
  )
}
