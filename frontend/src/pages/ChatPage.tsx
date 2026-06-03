import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import ReactMarkdown from "react-markdown"
import { MessageSquareIcon, PlusIcon } from "lucide-react"

import { api, streamChat, type Session, type Source } from "@/lib/api"
import { chatMessageTransition, chatMessageVariants, useMotionSafe } from "@/lib/motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Citation = { source_id: string; page?: number; chunk_id: string; excerpt: string }

type Msg = { role: string; content: string; citations?: Citation[] }

export function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [viewer, setViewer] = useState<Citation | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const motionSafe = useMotionSafe()

  useEffect(() => {
    api<Session[]>("/api/v1/sessions").then((s) => {
      setSessions(s)
      if (s[0]) setActiveId(s[0].id)
    })
    api<Source[]>("/api/v1/sources").then(setSources)
  }, [])

  useEffect(() => {
    if (!activeId) return
    api<{ id: string; role: string; content: string; citations: Citation[] | null }[]>(
      `/api/v1/sessions/${activeId}/messages`,
    ).then((rows) =>
      setMessages(rows.map((r) => ({ role: r.role, content: r.content, citations: r.citations ?? undefined }))),
    )
  }, [activeId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function newSession() {
    const indexed = sources.filter((s) => s.status === "indexed").map((s) => s.id)
    const s = await api<Session>("/api/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Research session", source_ids: indexed }),
    })
    setSessions((prev) => [s, ...prev])
    setActiveId(s.id)
    setMessages([])
  }

  async function send() {
    if (!activeId || !input.trim() || streaming) return
    const q = input.trim()
    setInput("")
    setMessages((m) => [...m, { role: "user", content: q }])
    setStreaming(true)
    let answer = ""
    let cites: Citation[] = []
    try {
      await streamChat(activeId, q, (ev) => {
        if (ev.event === "token" && typeof ev.delta === "string") answer += ev.delta
        if (ev.event === "done" && Array.isArray(ev.citations)) cites = ev.citations as Citation[]
      })
      setMessages((m) => [...m, { role: "assistant", content: answer, citations: cites }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setMessages((m) => [...m, { role: "assistant", content: msg }])
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="flex h-[calc(100svh-8rem)] min-h-0">
      <aside className="w-48 shrink-0 border-r border-border p-2">
        <Button type="button" variant="outline" size="sm" className="mb-2 w-full" onClick={newSession}>
          <PlusIcon className="size-4" /> New
        </Button>
        {sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveId(s.id)}
            className={`mb-1 w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted ${activeId === s.id ? "bg-muted font-medium" : ""}`}
          >
            {s.title}
          </button>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              <MessageSquareIcon className="mx-auto mb-2 size-8" />
              Ask a question about your corpus
            </p>
          )}
          {messages.map((m, i) => (
            <motion.div
              key={i}
              variants={chatMessageVariants}
              initial={motionSafe.initial}
              animate={motionSafe.animate}
              transition={chatMessageTransition}
              className={m.role === "user" ? "ml-auto max-w-[85%] rounded-lg bg-primary/10 px-4 py-2" : ""}
            >
              <div className="prose prose-invert max-w-none text-sm">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
              {m.citations?.map((c) => (
                <button
                  key={c.chunk_id}
                  type="button"
                  onClick={() => setViewer(c)}
                  className="mt-2 mr-2 rounded border border-border bg-surface px-2 py-1 text-xs transition-colors hover:border-accent"
                >
                  [{c.excerpt.slice(0, 40)}…]
                </button>
              ))}
            </motion.div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about your documents…"
            disabled={streaming || !activeId}
          />
          <Button type="button" onClick={send} disabled={streaming || !activeId}>
            Send
          </Button>
        </div>
      </div>

      {viewer && (
        <aside className="panel-slide w-72 shrink-0 border-l border-border bg-card p-4 text-sm">
          <h3 className="font-heading font-medium">Source excerpt</h3>
          <p className="mt-2 text-muted-foreground">Page {viewer.page ?? "?"}</p>
          <p className="mt-3 leading-relaxed">{viewer.excerpt}</p>
          <Button type="button" variant="ghost" size="sm" className="mt-4" onClick={() => setViewer(null)}>
            Close
          </Button>
        </aside>
      )}
    </div>
  )
}
