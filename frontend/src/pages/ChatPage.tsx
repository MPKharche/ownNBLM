import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { motion } from "framer-motion"
import ReactMarkdown from "react-markdown"
import {
  BookOpenIcon,
  FileUpIcon,
  MessageSquareIcon,
  PlusIcon,
  ShareIcon,
  SparklesIcon,
} from "lucide-react"

import { CitationChips } from "@/components/citation-chips"
import { SourceExcerptPanel, type Citation } from "@/components/source-excerpt-panel"
import {
  api,
  createNotebookSession,
  createShareLink,
  exportSessionCitations,
  listNotebookSessions,
  streamChat,
  type Notebook,
  type Session,
  type Source,
} from "@/lib/api"
import { chatMessageTransition, chatMessageVariants, useMotionSafe } from "@/lib/motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Msg = { role: string; content: string; citations?: Citation[] }

export function ChatPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const notebookId = searchParams.get("notebook")
  const initialSessionId = searchParams.get("session")

  const [notebook, setNotebook] = useState<Notebook | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(initialSessionId)
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

  // Load notebook metadata + sessions
  useEffect(() => {
    async function loadData() {
      if (notebookId) {
        const [nb, nbSessions] = await Promise.all([
          api<Notebook>(`/api/v1/notebooks/${notebookId}`),
          listNotebookSessions(notebookId),
        ])
        setNotebook(nb)
        setSessions(nbSessions)
        if (!activeId && nbSessions[0]) setActiveId(nbSessions[0].id)
      } else {
        // No notebook context — load all sessions (legacy flat mode)
        const allSessions = await api<Session[]>("/api/v1/sessions")
        setSessions(allSessions)
        if (!activeId && allSessions[0]) setActiveId(allSessions[0].id)
      }
      const srcs = await api<Source[]>("/api/v1/sources")
      setSources(srcs)
    }
    loadData()
  }, [notebookId])

  // Load messages for active session — clear immediately on switch to avoid stale flash
  useEffect(() => {
    if (!activeId) { setMessages([]); return }
    setMessages([]) // clear while loading
    api<{ id: string; role: string; content: string; citations: Citation[] | null }[]>(
      `/api/v1/sessions/${activeId}/messages`,
    ).then((rows) =>
      setMessages(rows.map((r) => ({ role: r.role, content: r.content, citations: r.citations ?? undefined }))),
    ).catch(() => setMessages([]))
  }, [activeId])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function newSession() {
    setMessages([])
    if (notebookId) {
      const s = await createNotebookSession(notebookId)
      setSessions((prev) => [s, ...prev])
      setActiveId(s.id)
      navigate(`/chat?notebook=${notebookId}&session=${s.id}`, { replace: true })
    } else {
      const indexed = sources.filter((s) => s.status === "indexed").map((s) => s.id)
      const s = await api<Session>("/api/v1/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New session", source_ids: indexed }),
      })
      setSessions((prev) => [s, ...prev])
      setActiveId(s.id)
    }
  }

  function selectSession(id: string) {
    setActiveId(id)
    if (notebookId) {
      navigate(`/chat?notebook=${notebookId}&session=${id}`, { replace: true })
    }
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
    <div className="flex h-[calc(100svh-8rem)] min-h-0 flex-col">
      {/* Notebook breadcrumb */}
      {notebook && (
        <div className="flex items-center gap-2 border-b border-border bg-surface/30 px-4 py-2 text-sm">
          <BookOpenIcon className="size-4 text-muted-foreground shrink-0" />
          <Link
            to="/notebooks"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Notebooks
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link
            to={`/notebooks`}
            className="font-medium text-foreground hover:text-accent transition-colors truncate max-w-xs"
            title={notebook.title}
          >
            {notebook.title}
          </Link>
          <span className="ml-auto text-xs text-muted-foreground shrink-0">
            {notebook.source_ids.length} source{notebook.source_ids.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Sessions sidebar */}
        <aside className="w-48 shrink-0 border-r border-border p-2 flex flex-col gap-1 overflow-y-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mb-1 w-full cursor-pointer"
            onClick={newSession}
          >
            <PlusIcon className="size-4" /> New session
          </Button>

          {!hasSessions && (
            <p className="px-1 text-xs text-muted-foreground">No sessions yet — click New to start.</p>
          )}

          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSession(s.id)}
              className={`w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs transition-colors duration-200 hover:bg-muted ${
                activeId === s.id ? "bg-muted font-medium" : ""
              }`}
            >
              <span className="block truncate">{s.title}</span>
            </button>
          ))}
        </aside>

        {/* Main chat area */}
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={() => downloadCitations("bibtex")}
              >
                BibTeX
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={() => downloadCitations("ris")}
              >
                RIS
              </Button>
              {shareMsg && <span className="text-xs text-muted-foreground">{shareMsg}</span>}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Empty state — no sessions */}
            {!hasSessions && (
              <div className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-dashed border-border bg-surface/30 p-8 text-center">
                <SparklesIcon className="mb-3 size-10 text-accent" />
                <h2 className="font-heading text-lg font-medium">
                  {notebook ? `Start chatting in "${notebook.title}"` : "Start your first research session"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {notebook
                    ? `This notebook has ${notebook.source_ids.length} source${notebook.source_ids.length !== 1 ? "s" : ""} attached. Create a session to ask questions grounded in them.`
                    : "Click New session to create one, then ask questions grounded in your documents."}
                </p>
                {!notebook && indexedCount === 0 && (
                  <Link
                    to="/corpus"
                    className="upload-zone-pulse mt-6 flex w-full cursor-pointer flex-col items-center rounded-lg border border-dashed border-border p-6 transition-colors duration-200 hover:border-accent"
                  >
                    <FileUpIcon className="mb-2 size-8 text-muted-foreground" />
                    <span className="text-sm font-medium">Upload a PDF on the Corpus page first</span>
                  </Link>
                )}
                {notebook && notebook.source_ids.length === 0 && (
                  <Link
                    to="/notebooks"
                    className="mt-4 text-sm text-accent underline-offset-2 hover:underline"
                  >
                    Add sources to this notebook first →
                  </Link>
                )}
                <Button type="button" className="mt-4 cursor-pointer" onClick={newSession}>
                  <PlusIcon className="size-4" /> New session
                </Button>
              </div>
            )}

            {/* Empty session — prompt user */}
            {hasSessions && messages.length === 0 && activeId && (
              <div className="text-center text-sm text-muted-foreground">
                <MessageSquareIcon className="mx-auto mb-2 size-8" />
                <p>Ask a question about your {notebook ? "notebook sources" : "corpus"}</p>
                {!notebook && indexedCount === 0 && (
                  <p className="mt-2">
                    <Link to="/corpus" className="text-accent underline-offset-2 hover:underline">
                      Upload documents
                    </Link>{" "}
                    to get cited answers.
                  </p>
                )}
              </div>
            )}

            {/* Messages */}
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

            {/* Typing indicator */}
            {streaming && (
              <div className="flex items-center gap-1.5 px-1 text-muted-foreground">
                <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="flex gap-2 border-t border-border p-4">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder={
                hasSessions
                  ? notebook
                    ? `Ask about "${notebook.title}"…`
                    : "Ask about your documents…"
                  : "Create a session first…"
              }
              disabled={streaming || !activeId}
            />
            <Button
              type="button"
              className="cursor-pointer"
              onClick={send}
              disabled={streaming || !activeId}
            >
              Send
            </Button>
          </div>
        </div>
      </div>

      {viewer && <SourceExcerptPanel citation={viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}
