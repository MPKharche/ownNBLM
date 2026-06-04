import { useCallback, useEffect, useState } from "react"
import { FileUpIcon, Loader2Icon } from "lucide-react"

import { api, patchSourcePrivacy, subscribeIngestEvents, type IngestEvent, type Source } from "@/lib/api"

type IngestUi = { pct: number; step: string }

export function CorpusPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [uploading, setUploading] = useState(false)
  const [ingestUi, setIngestUi] = useState<Record<string, IngestUi>>({})

  const load = useCallback(() => {
    api<Source[]>("/api/v1/sources").then(setSources).catch(console.error)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function trackIngest(sourceId: string) {
    const unsub = subscribeIngestEvents(sourceId, (ev: IngestEvent) => {
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
        unsub()
      }
    })
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
