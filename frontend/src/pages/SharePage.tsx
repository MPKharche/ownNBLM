import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import ReactMarkdown from "react-markdown"

import { CitationChips } from "@/components/citation-chips"
import { SourceExcerptPanel, type Citation } from "@/components/source-excerpt-panel"

type ShareMessage = {
  role: string
  content: string
  citations: Citation[]
}

export function SharePage() {
  const { token } = useParams()
  const [data, setData] = useState<{
    session: { title: string }
    messages: ShareMessage[]
  } | null>(null)
  const [viewer, setViewer] = useState<Citation | null>(null)

  useEffect(() => {
    if (!token) return
    fetch(`/api/v1/share/${token}`)
      .then((r) => r.json())
      .then(setData)
  }, [token])

  if (!data) return <p className="p-8 text-center text-muted-foreground">Loading shared session…</p>

  return (
    <div className="flex min-h-svh">
      <div className="mx-auto max-w-2xl flex-1 p-8">
        <h1 className="font-heading text-2xl font-semibold">{data.session.title}</h1>
        <p className="text-sm text-muted-foreground">Read-only shared view</p>
        <div className="mt-6 space-y-4">
          {data.messages.map((m, i) => (
            <div key={i} className="rounded-lg border border-border p-4">
              <span className="text-xs uppercase text-muted-foreground">{m.role}</span>
              <div className="prose prose-invert mt-2 max-w-none text-sm">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
              <CitationChips citations={m.citations} onSelect={setViewer} />
            </div>
          ))}
        </div>
      </div>
      {viewer && <SourceExcerptPanel citation={viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}
