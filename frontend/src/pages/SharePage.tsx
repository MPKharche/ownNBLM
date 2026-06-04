import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import ReactMarkdown from "react-markdown"

import { CitationChips } from "@/components/citation-chips"
import { SourceExcerptPanel, type Citation } from "@/components/source-excerpt-panel"
import { fetchShareAnnotations, postShareAnnotation } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type ShareMessage = {
  role: string
  content: string
  citations: Citation[]
}

type Annotation = {
  id: string
  content: string
  author_name: string
  created_at: string | null
}

export function SharePage() {
  const { token } = useParams()
  const [data, setData] = useState<{
    session: { title: string }
    messages: ShareMessage[]
  } | null>(null)
  const [viewer, setViewer] = useState<Citation | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [note, setNote] = useState("")
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    setAuthed(Boolean(localStorage.getItem("ownnblm_token")))
  }, [])

  useEffect(() => {
    if (!token) return
    fetch(`/api/v1/share/${token}`)
      .then((r) => r.json())
      .then(setData)
    fetchShareAnnotations(token)
      .then(setAnnotations)
      .catch(() => setAnnotations([]))
  }, [token])

  async function addAnnotation() {
    if (!token || !note.trim() || !authed) return
    try {
      await postShareAnnotation(token, note.trim())
      setNote("")
      const rows = await fetchShareAnnotations(token)
      setAnnotations(rows)
    } catch {
      /* ignore */
    }
  }

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

        {annotations.length > 0 && (
          <section className="mt-8 space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Team annotations</h2>
            {annotations.map((a) => (
              <div key={a.id} className="rounded-lg border border-border/80 bg-muted/10 p-3 text-sm">
                <p className="text-xs text-muted-foreground">{a.author_name}</p>
                <p>{a.content}</p>
              </div>
            ))}
          </section>
        )}

        {authed ? (
          <div className="mt-6 flex gap-2">
            <Input
              placeholder="Add a team comment…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button onClick={addAnnotation}>Post</Button>
          </div>
        ) : (
          <p className="mt-6 text-xs text-muted-foreground">Sign in to add team annotations.</p>
        )}
      </div>
      {viewer && <SourceExcerptPanel citation={viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}
