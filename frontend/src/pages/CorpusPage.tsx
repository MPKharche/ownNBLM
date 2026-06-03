import { useCallback, useEffect, useState } from "react"
import { FileUpIcon, Loader2Icon } from "lucide-react"

import { api, type Source } from "@/lib/api"
export function CorpusPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [uploading, setUploading] = useState(false)

  const load = useCallback(() => {
    api<Source[]>("/api/v1/sources").then(setSources).catch(console.error)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function onUpload(file: File) {
    setUploading(true)
    const form = new FormData()
    form.append("file", file)
    try {
      const token = localStorage.getItem("ownnblm_token")
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      else headers["X-Dev-User-Id"] = "00000000-0000-4000-8000-000000000001"
      const res = await fetch("/api/v1/sources", { method: "POST", body: form, headers })
      if (!res.ok) throw new Error(await res.text())
      const src = (await res.json()) as Source
      load()
      void pollUntilIndexed(src.id)
    } finally {
      setUploading(false)
    }
  }

  async function pollUntilIndexed(id: string) {
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const list = await api<Source[]>("/api/v1/sources")
      const s = list.find((x) => x.id === id)
      if (s?.status === "indexed" || s?.status === "error") {
        setSources(list)
        return
      }
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/40 p-10 transition-colors hover:border-accent">
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
        {sources.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm"
          >
            <span>{s.name}</span>
            <span
              className={
                s.status === "indexed"
                  ? "text-primary"
                  : s.status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
              }
            >
              {s.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
