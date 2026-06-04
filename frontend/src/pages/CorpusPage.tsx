import { useCallback, useEffect, useState } from "react"
import { FileUpIcon, FolderOpenIcon, Loader2Icon, RefreshCwIcon, Trash2Icon } from "lucide-react"

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

type IngestUi = { pct: number; step: string }
type FolderWatch = {
  id: string
  path: string
  enabled: boolean
  last_scan_at: string | null
}

export function CorpusPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [watches, setWatches] = useState<FolderWatch[]>([])
  const [watchPath, setWatchPath] = useState("")
  const [watchBusy, setWatchBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [ingestUi, setIngestUi] = useState<Record<string, IngestUi>>({})

  const load = useCallback(() => {
    api<Source[]>("/api/v1/sources").then(setSources).catch(console.error)
    api<FolderWatch[]>("/api/v1/watch").then(setWatches).catch(() => setWatches([]))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function trackIngest(sourceId: string) {
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
  }

  useEffect(() => {
    const active = sources.filter((s) => s.status === "pending" || s.status === "processing")
    const unsubs = active.map((s) => trackIngest(s.id))
    return () => unsubs.forEach((u) => u())
  }, [sources])

  async function onDeleteSource(id: string) {
    if (!confirm("Remove this document from your corpus?")) return
    await deleteSource(id)
    setSources((prev) => prev.filter((s) => s.id !== id))
  }

  async function onRetrySource(id: string) {
    await retrySourceIngest(id)
    setIngestUi((prev) => ({ ...prev, [id]: { pct: 5, step: "Queued" } }))
    trackIngest(id)
  }

  async function onClearCorpus() {
    if (
      !confirm(
        "Delete ALL documents in this workspace? Sessions will lose source links. Upload fresh files after.",
      )
    ) {
      return
    }
    const r = await resetCorpus(true)
    setSources([])
    setIngestUi({})
    alert(`Corpus cleared (${r.deleted} removed). Upload new files when ready.`)
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
      console.error(e)
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

  async function onUpload(file: File) {
    setUploading(true)
    const form = new FormData()
    form.append("file", file)
    try {
      const token = localStorage.getItem("ownnblm_token")
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      else if (import.meta.env.DEV) headers["X-Dev-User-Id"] = "00000000-0000-4000-8000-000000000001"
      const res = await fetch("/api/v1/sources", { method: "POST", body: form, headers })
      if (!res.ok) throw new Error(await res.text())
      const src = (await res.json()) as Source
      setSources((prev) => [src, ...prev.filter((s) => s.id !== src.id)])
      setIngestUi((prev) => ({ ...prev, [src.id]: { pct: 5, step: "Queued" } }))
      trackIngest(src.id)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <label className="upload-zone-pulse flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/40 p-10 transition-colors duration-200 hover:border-accent">
        <FileUpIcon className="mb-2 size-10 text-muted" />
        <span className="font-heading text-lg font-medium">Drop your first PDF here</span>
        <span className="mt-1 text-sm text-muted-foreground">PDF, MD, or TXT — max 50MB</span>
        <input
          type="file"
          className="hidden"
          accept=".pdf,.md,.txt"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
          }}
        />
        {uploading && <Loader2Icon className="mt-3 size-5 animate-spin" />}
      </label>

      <section className="rounded-xl border border-border bg-surface/40 p-4">
        <div className="mb-2 flex items-center gap-2 font-heading text-sm font-medium">
          <FolderOpenIcon className="size-4" />
          Watched folders
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Server-side path (must exist on the API host). New PDF/MD/TXT files are ingested automatically.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={watchPath}
            onChange={(e) => setWatchPath(e.target.value)}
            placeholder="C:\Users\you\Documents\research"
            className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={watchBusy || !watchPath.trim()}
            onClick={() => addWatch()}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            Add watch
          </button>
        </div>
        {watches.length > 0 && (
          <ul className="mt-3 space-y-2">
            {watches.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
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

      {sources.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onClearCorpus()}
            className="text-xs text-muted-foreground underline hover:text-destructive"
          >
            Clear all documents
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {sources.map((s) => {
          const progress = ingestUi[s.id]
          return (
            <li
              key={s.id}
              className="rounded-lg border border-border bg-card px-4 py-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span>{s.name}</span>
                <div className="flex items-center gap-2">
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
                        ? "text-primary"
                        : s.status === "error"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }
                  >
                    {progress?.step ?? s.status}
                  </span>
                  {(s.status === "error" ||
                    s.status === "processing" ||
                    s.status === "pending") && (
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
                    onClick={() => onDeleteSource(s.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2Icon className="size-4" />
                  </button>
                </div>
              </div>
              {progress && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/30">
                  <div
                    className="progress-bar-fill h-full bg-primary"
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
