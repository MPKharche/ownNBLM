import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import ReactMarkdown from "react-markdown"
import { FileUpIcon, MessageSquareIcon, PlusIcon, ShareIcon, SparklesIcon } from "lucide-react"
import { Link } from "react-router-dom"

import { CitationChips } from "@/components/citation-chips"
import { SourceExcerptPanel, type Citation } from "@/components/source-excerpt-panel"
import { api, createShareLink, exportSessionCitations, streamChat, type Session, type Source } from "@/lib/api"
import { chatMessageTransition, chatMessageVariants, useMotionSafe } from "@/lib/motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Msg = { role: string; content: string; citations?: Citation[] }

export function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [viewer, setViewer] = useState<Citation | null>(null)
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const motionSafe = useMotionSafe()

  const indexedCount = sources.filter((s) => s.status === "indexed").length
  const hasSessions = sessions.length > 0

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

  async function shareSession() {
    if (!activeId || messages.length === 0) return
    setShareMsg(null)
    try {
      const { url } = await createShareLink(activeId)
      const full = `${window.location.origin}${url}`
      await navigator.clipboard.writeText(full)
      setShareMsg("Share link copied to clipboard")
    } catch (e) {
      setShareMsg(e instanceof Error ? e.message : "Could not create share link")
    }
  }

  async function downloadCitations(format: "bibtex" | "ris" | "zotero") {
    if (!activeId) return
    try {
      const text = await exportSessionCitations(activeId, format)
      const blob = new Blob([text], { type: "text/plain" })
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `session.${format === "bibtex" ? "bib" : "ris"}`
      a.click()
    } catch (e) {
      setShareMsg(e instanceof Error ? e.message : "Export failed")
    }
  }

  return (
    <div className="flex h-[calc(100svh-8rem)] min-h-0">
      <aside className="w-48 shrink-0 border-r border-border p-2">
        <Button type="button" variant="outline" size="sm" className="mb-2 w-full cursor-pointer" onClick={newSession}>
          <PlusIcon className="size-4" /> New
        </Button>
        {!hasSessions && (
          <p className="mb-2 px-1 text-xs text-muted-foreground">No sessions yet — click New to start.</p>
        )}
        {sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveId(s.id)}
            className={`mb-1 w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs transition-colors duration-200 hover:bg-muted ${activeId === s.id ? "bg-muted font-medium" : ""}`}
          >
            {s.title}
          </button>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {activeId && messages.length > 0 && (
          <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={shareSession}
            >
              <ShareIcon className="size-4" /> Share
            </Button>
            <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={() => downloadCitations("bibtex")}>
              BibTeX
            </Button>
            <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={() => downloadCitations("ris")}>
              RIS
            </Button>
            {shareMsg && <span className="text-xs text-muted-foreground">{shareMsg}</span>}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!hasSessions && (
            <div className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-dashed border-border bg-surface/30 p-8 text-center">
              <SparklesIcon className="mb-3 size-10 text-accent" />
              <h2 className="font-heading text-lg font-medium">Start your first research session</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Click <strong>New</strong> in the sidebar to create a session, then ask questions grounded in your
                documents.
              </p>
              {indexedCount === 0 && (
                <Link
                  to="/corpus"
                  className="upload-zone-pulse mt-6 flex w-full cursor-pointer flex-col items-center rounded-lg border border-dashed border-border p-6 transition-colors duration-200 hover:border-accent"
                >
                  <FileUpIcon className="mb-2 size-8 text-muted-foreground" />
                  <span className="text-sm font-medium">Upload a PDF on the Corpus page first</span>
                </Link>
              )}
              <Button type="button" className="mt-4 cursor-pointer" onClick={newSession}>
                <PlusIcon className="size-4" /> New session
              </Button>
            </div>
          )}

          {hasSessions && messages.length === 0 && activeId && (
            <div className="text-center text-sm text-muted-foreground">
              <MessageSquareIcon className="mx-auto mb-2 size-8" />
              <p>Ask a question about your corpus</p>
              {indexedCount === 0 && (
                <p className="mt-2">
                  <Link to="/corpus" className="text-accent underline-offset-2 hover:underline">
                    Upload documents
                  </Link>{" "}
                  to get cited answers.
                </p>
              )}
            </div>
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
              <CitationChips citations={m.citations} onSelect={setViewer} />
            </motion.div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={hasSessions ? "Ask about your documents…" : "Create a session first…"}
            disabled={streaming || !activeId}
          />
          <Button type="button" className="cursor-pointer" onClick={send} disabled={streaming || !activeId}>
            Send
          </Button>
        </div>
      </div>

      {viewer && <SourceExcerptPanel citation={viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}
