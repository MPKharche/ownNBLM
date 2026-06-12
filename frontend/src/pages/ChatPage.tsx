import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { motion } from "framer-motion"
import {
  BookOpenIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileUpIcon,
  MessageSquareIcon,
  PlusIcon,
  SendIcon,
  ShareIcon,
  SparklesIcon,
} from "lucide-react"
import { MarkdownRenderer } from "@/components/markdown-renderer"

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
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // F8: track message counts per session (uses already-fetched data, no extra API)
  const [sessionMsgCounts, setSessionMsgCounts] = useState<Record<string, number>>({})
  // S10: scroll-to-bottom button
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
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
    setMessages([])
    api<{ id: string; role: string; content: string; citations: Citation[] | null }[]>(
      `/api/v1/sessions/${activeId}/messages`,
    ).then((rows) => {
      const msgs = rows.map((r) => ({ role: r.role, content: r.content, citations: r.citations ?? undefined }))
      setMessages(msgs)
      // F8: record count for this session
      setSessionMsgCounts((prev) => ({ ...prev, [activeId]: msgs.length }))
    }).catch(() => setMessages([]))
  }, [activeId])

  // Auto-scroll on new messages — only when already near bottom
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  // S10: track scroll position to show/hide jump button
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    function onScroll() {
      const dist = el!.scrollHeight - el!.scrollTop - el!.clientHeight
      setShowScrollBtn(dist > 200)
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  // S3: auto-focus input on desktop when session becomes active
  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 640px)").matches
    if (activeId && !isMobile) {
      inputRef.current?.focus()
    }
  }, [activeId])

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

    // F6: block if no indexed sources
    if (indexedCount === 0 && (!notebook || notebook.source_ids.length === 0)) return

    const q = input.trim()
    setInput("")

    // F1: add user message + empty assistant draft immediately
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "", citations: [] }])
    setStreaming(true)

    let answer = ""
    let cites: Citation[] = []
    try {
      await streamChat(activeId, q, (ev) => {
        if (ev.event === "token" && typeof ev.delta === "string") {
          answer += ev.delta
          // F1: update last message (the draft assistant bubble) live
          setMessages((m) => {
            const copy = [...m]
            copy[copy.length - 1] = { role: "assistant", content: answer, citations: [] }
            return copy
          })
        }
        if (ev.event === "done" && Array.isArray(ev.citations)) cites = ev.citations as Citation[]
      })
      // Final update with citations
      setMessages((m) => {
        const copy = [...m]
        copy[copy.length - 1] = { role: "assistant", content: answer, citations: cites }
        return copy
      })
      // F8: increment message count for this session (+2: user + assistant)
      setSessionMsgCounts((prev) => ({ ...prev, [activeId]: (prev[activeId] ?? 0) + 2 }))

      // F2: auto-title session from first user message (only when title is still default)
      const session = sessions.find((s) => s.id === activeId)
      if (session && (session.title === "New session" || !session.title)) {
        const autoTitle = q.slice(0, 60)
        api(`/api/v1/sessions/${activeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: autoTitle }),
        }).then(() => {
          setSessions((prev) => prev.map((s) => s.id === activeId ? { ...s, title: autoTitle } : s))
        }).catch(() => { /* non-critical */ })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setMessages((m) => {
        const copy = [...m]
        copy[copy.length - 1] = { role: "assistant", content: msg, citations: [] }
        return copy
      })
    } finally {
      setStreaming(false)
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
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
      // Use notebook title + date in filename instead of raw session id
      const notebookSlug = notebook?.title.replace(/\s+/g, "-").slice(0, 30) ?? "session"
      const dateStr = new Date().toISOString().slice(0, 10)
      a.download = `${notebookSlug}-${dateStr}.${format === "bibtex" ? "bib" : "ris"}`
      a.click()
    } catch (e) {
      setShareMsg(e instanceof Error ? e.message : "Export failed")
    }
  }

  // F6: derive whether sending is blocked by missing sources
  const noSourcesBlocked = indexedCount === 0 && (!notebook || notebook.source_ids.length === 0) && hasSessions

  return (
    <div className="flex h-[calc(100svh-3rem)] min-h-0 flex-col">
      {/* Notebook breadcrumb */}
      {notebook && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface/30 px-3 py-1.5 text-xs">
          <BookOpenIcon className="size-3.5 text-muted-foreground shrink-0" />
          <Link to="/notebooks" className="text-muted-foreground hover:text-foreground transition-colors">Notebooks</Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-medium text-foreground truncate max-w-[160px]" title={notebook.title}>{notebook.title}</span>
          <span className="ml-auto text-muted-foreground shrink-0">{notebook.source_ids.length} source{notebook.source_ids.length !== 1 ? "s" : ""}</span>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Sessions sidebar */}
        <aside className={`flex flex-col border-r border-border bg-surface/20 transition-all duration-200 ${sidebarOpen ? "w-44 sm:w-52" : "w-0"} overflow-hidden shrink-0`}>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 min-w-44 sm:min-w-52">
            <button type="button" onClick={newSession}
              className="mb-1 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-xs font-medium transition-colors hover:border-accent hover:bg-muted">
              <PlusIcon className="size-3.5" /> New session
            </button>
            {!hasSessions && <p className="px-1 text-xs text-muted-foreground">No sessions yet.</p>}
            {sessions.map((s) => {
              const count = sessionMsgCounts[s.id]
              return (
                <button key={s.id} type="button" onClick={() => selectSession(s.id)}
                  className={`w-full cursor-pointer rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted ${activeId === s.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground"}`}>
                  <span className="flex items-center justify-between gap-1">
                    <span className="block truncate">{s.title}</span>
                    {/* F8: message count badge */}
                    {count != null && count > 0 && (
                      <span className="shrink-0 text-[9px] text-muted-foreground/60 tabular-nums">·{count}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        {/* Sidebar toggle handle */}
        <button type="button" onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Collapse sessions sidebar" : "Expand sessions sidebar"}
          className="flex shrink-0 items-center justify-center w-4 border-r border-border bg-surface/10 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          {sidebarOpen ? <ChevronLeftIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
        </button>

        {/* Main chat */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Toolbar */}
          {activeId && messages.length > 0 && (
            <div className="flex shrink-0 items-center justify-end gap-1.5 border-b border-border px-3 py-1.5">
              {shareMsg && <span className="mr-auto text-xs text-muted-foreground">{shareMsg}</span>}
              <button type="button" onClick={shareSession} aria-label="Share session"
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground">
                <ShareIcon className="size-3" /> Share
              </button>
              <button type="button" onClick={() => downloadCitations("bibtex")} aria-label="Export BibTeX citations"
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground">
                <DownloadIcon className="size-3" /> BibTeX
              </button>
              <button type="button" onClick={() => downloadCitations("ris")} aria-label="Export RIS citations"
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground">
                <DownloadIcon className="size-3" /> RIS
              </button>
            </div>
          )}

          {/* Message thread */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto relative">
            <div className="mx-auto max-w-3xl px-4 py-4 space-y-5">
              {/* Empty — no sessions */}
              {!hasSessions && (
                <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface/30 p-8 text-center">
                  <SparklesIcon className="mb-3 size-10 text-accent" />
                  <h2 className="font-heading text-lg font-medium">
                    {notebook ? `Chat in "${notebook.title}"` : "Start your first session"}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground max-w-xs">
                    {notebook
                      ? `${notebook.source_ids.length} source${notebook.source_ids.length !== 1 ? "s" : ""} attached. Create a session to ask questions.`
                      : "Create a session to ask questions grounded in your documents."}
                  </p>
                  {!notebook && indexedCount === 0 && (
                    <Link to="/corpus" className="mt-5 flex w-full max-w-xs flex-col items-center rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground transition-colors hover:border-accent hover:text-foreground">
                      <FileUpIcon className="mb-1.5 size-7" />Upload documents first
                    </Link>
                  )}
                  {notebook && notebook.source_ids.length === 0 && (
                    <Link to="/notebooks" className="mt-4 text-sm text-accent hover:underline underline-offset-2">
                      Add sources to this notebook →
                    </Link>
                  )}
                  <button type="button" onClick={newSession}
                    className="mt-5 flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">
                    <PlusIcon className="size-4" /> New session
                  </button>
                </div>
              )}

              {/* Empty session prompt */}
              {hasSessions && messages.length === 0 && activeId && (
                <div className="py-12 text-center">
                  <MessageSquareIcon className="mx-auto mb-2 size-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Ask a question about your {notebook ? "notebook sources" : "documents"}</p>
                  {!notebook && indexedCount === 0 && (
                    <p className="mt-2 text-sm"><Link to="/corpus" className="text-accent hover:underline underline-offset-2">Upload documents</Link> to get cited answers.</p>
                  )}
                </div>
              )}

              {/* Messages */}
              {messages.map((m, i) => (
                <motion.div key={i} variants={chatMessageVariants}
                  initial={motionSafe.initial} animate={motionSafe.animate} transition={chatMessageTransition}>
                  {m.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary/15 px-4 py-2.5 text-sm">
                        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent text-xs font-bold mt-0.5">A</div>
                      <div className="min-w-0 flex-1">
                        {/* F1: show content live as it streams; typing dots only before first token */}
                        {m.content ? (
                          <MarkdownRenderer content={m.content} />
                        ) : streaming && i === messages.length - 1 ? (
                          <div className="flex items-center gap-1.5 py-2">
                            <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                            <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                            <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                          </div>
                        ) : null}
                        <CitationChips citations={m.citations} onSelect={setViewer} />
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}

              <div ref={bottomRef} />
            </div>

            {/* S10: Jump-to-bottom button */}
            {showScrollBtn && (
              <button
                type="button"
                aria-label="Jump to latest message"
                onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="fixed bottom-24 right-6 z-10 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-lg transition-colors hover:border-accent hover:text-foreground sm:absolute sm:bottom-6 sm:right-4"
              >
                <ChevronDownIcon className="size-3.5" /> Latest
              </button>
            )}
          </div>

          {/* Input bar */}
          <div className="shrink-0 border-t border-border bg-background/80 p-3">
            {/* F6: no-sources warning inline */}
            {noSourcesBlocked && (
              <div className="mx-auto mb-2 max-w-3xl flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400">
                <FileUpIcon className="size-3.5 shrink-0" />
                No indexed sources —{" "}
                <Link to="/corpus" className="underline underline-offset-2 hover:text-amber-300">Upload documents</Link>
                {" "}to get cited answers.
              </div>
            )}
            <div className="mx-auto max-w-3xl flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px" }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={
                  noSourcesBlocked
                    ? "Upload documents in Corpus first…"
                    : hasSessions
                      ? (notebook ? `Ask about "${notebook.title}"…` : "Ask about your documents…")
                      : "Create a session first…"
                }
                disabled={streaming || !activeId || noSourcesBlocked}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-border bg-surface/60 px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:border-accent focus:outline-none disabled:opacity-50 leading-relaxed"
                style={{ minHeight: "2.75rem", maxHeight: "10rem" }}
              />
              <button type="button" onClick={send}
                aria-label="Send message"
                disabled={streaming || !activeId || !input.trim() || noSourcesBlocked}
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40">
                <SendIcon className="size-4" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground/60 mx-auto max-w-3xl">
              Shift+Enter for new line · Enter to send
            </p>
          </div>
        </div>
      </div>

      {viewer && <SourceExcerptPanel citation={viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}
