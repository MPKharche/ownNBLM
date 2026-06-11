import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  BookOpenIcon,
  ChevronRightIcon,
  FilePlusIcon,
  Loader2Icon,
  MessageSquarePlusIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import {
  addSourceToNotebook,
  api,
  createNotebook,
  createNotebookSession,
  deleteNotebook,
  listNotebooks,
  removeSourceFromNotebook,
  updateNotebook,
  type Notebook,
  type Source,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Panel = "list" | "detail"

export function NotebooksPage() {
  const navigate = useNavigate()
  const [panel, setPanel] = useState<Panel>("list")
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  // Keep active as an ID so it always re-derives from fresh list data
  const [activeId, setActiveId] = useState<string | null>(null)
  const [allSources, setAllSources] = useState<Source[]>([])
  const [busy, setBusy] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null) // sourceId being toggled
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState("")
  const [error, setError] = useState<string | null>(null)
  const loadRef = useRef(false)

  const active = notebooks.find((n) => n.id === activeId) ?? null

  async function load() {
    try {
      const [nbs, srcs] = await Promise.all([
        listNotebooks(),
        api<Source[]>("/api/v1/sources"),
      ])
      setNotebooks(nbs)
      setAllSources(srcs)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data")
    }
  }

  useEffect(() => {
    if (loadRef.current) return
    loadRef.current = true
    load()
  }, [])

  async function onCreateNotebook() {
    if (!newTitle.trim()) return
    setBusy(true)
    setError(null)
    try {
      const nb = await createNotebook(newTitle.trim(), newDesc.trim() || undefined)
      setNewTitle("")
      setNewDesc("")
      setCreating(false)
      await load()
      setActiveId(nb.id)
      setPanel("detail")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create notebook")
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteNotebook(id: string) {
    if (!window.confirm("Delete this notebook and all its sessions?")) return
    setError(null)
    try {
      await deleteNotebook(id)
      if (activeId === id) {
        setActiveId(null)
        setPanel("list")
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete notebook")
    }
  }

  async function onToggleSource(sourceId: string) {
    if (!active || toggling) return
    setToggling(sourceId)
    setError(null)
    try {
      const attached = active.source_ids.includes(sourceId)
      if (attached) {
        await removeSourceFromNotebook(active.id, sourceId)
      } else {
        await addSourceToNotebook(active.id, sourceId)
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update sources")
    } finally {
      setToggling(null)
    }
  }

  async function onRenameNotebook() {
    if (!active || !editTitle.trim()) return
    setError(null)
    try {
      await updateNotebook(active.id, { title: editTitle.trim() })
      setEditingTitle(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rename")
    }
  }

  async function onNewSession() {
    if (!active) return
    setBusy(true)
    setError(null)
    try {
      const session = await createNotebookSession(active.id)
      navigate(`/chat?notebook=${active.id}&session=${session.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session")
      setBusy(false)
    }
  }

  const indexedSources = allSources.filter((s) => s.status === "indexed")
  const pendingSources = allSources.filter((s) => s.status !== "indexed")

  // ── List panel ──────────────────────────────────────────────────────────────
  if (panel === "list") {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-2xl font-semibold">Notebooks</h1>
          <Button size="sm" onClick={() => { setCreating(true); setError(null) }}>
            <PlusIcon className="size-4" /> New notebook
          </Button>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {creating && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-medium">Create notebook</h2>
            <Input
              placeholder="Notebook title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onCreateNotebook()}
              autoFocus
            />
            <Input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !newTitle.trim()} onClick={onCreateNotebook}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : <FilePlusIcon className="size-4" />}
                Create
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewTitle(""); setNewDesc("") }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {notebooks.length === 0 && !creating && (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface/30 p-12 text-center">
            <BookOpenIcon className="mb-3 size-12 text-muted-foreground" />
            <h2 className="font-heading text-lg font-medium">No notebooks yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a notebook to group your documents and run focused chat sessions on them.
            </p>
            <Button className="mt-6" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" /> New notebook
            </Button>
          </div>
        )}

        <ul className="space-y-2">
          {notebooks.map((nb) => (
            <li
              key={nb.id}
              className="group flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-accent/60"
              onClick={() => { setActiveId(nb.id); setPanel("detail"); setError(null) }}
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{nb.title}</p>
                {nb.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{nb.description}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {nb.source_ids.length} source{nb.source_ids.length !== 1 ? "s" : ""} ·{" "}
                  {nb.session_count} session{nb.session_count !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  aria-label="Delete notebook"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  onClick={(e) => { e.stopPropagation(); onDeleteNotebook(nb.id) }}
                >
                  <Trash2Icon className="size-4" />
                </button>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // ── Detail panel ─────────────────────────────────────────────────────────────
  if (!active) {
    // Notebook was deleted or not found — go back to list
    setPanel("list")
    setActiveId(null)
    return null
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-6">
      {/* Back + action */}
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => { setPanel("list"); setActiveId(null); setEditingTitle(false); setError(null) }}
        >
          ← All notebooks
        </button>
        <Button
          size="sm"
          disabled={busy || active.source_ids.length === 0}
          onClick={onNewSession}
          title={active.source_ids.length === 0 ? "Attach at least one source first" : ""}
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <MessageSquarePlusIcon className="size-4" />}
          New chat session
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Title */}
      <div>
        {editingTitle ? (
          <div className="flex gap-2">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameNotebook()
                if (e.key === "Escape") setEditingTitle(false)
              }}
              autoFocus
              className="text-xl font-semibold"
            />
            <Button size="sm" onClick={onRenameNotebook} disabled={!editTitle.trim()}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingTitle(false)}>
              <XIcon className="size-4" />
            </Button>
          </div>
        ) : (
          <h1
            className="font-heading text-2xl font-semibold cursor-pointer hover:text-accent transition-colors group flex items-center gap-2"
            title="Click to rename"
            onClick={() => { setEditingTitle(true); setEditTitle(active.title) }}
          >
            {active.title}
            <span className="text-xs text-muted-foreground font-normal opacity-0 group-hover:opacity-100 transition-opacity">
              (click to rename)
            </span>
          </h1>
        )}
        {active.description && (
          <p className="mt-1 text-sm text-muted-foreground">{active.description}</p>
        )}
      </div>

      {/* Source picker */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="font-heading text-sm font-medium flex items-center gap-2">
          <BookOpenIcon className="size-4" />
          Sources in this notebook
        </h2>

        {indexedSources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No indexed sources yet.{" "}
            <button
              type="button"
              className="underline cursor-pointer hover:text-foreground"
              onClick={() => navigate("/corpus")}
            >
              Upload documents on the Corpus page
            </button>
            {" "}first.
          </p>
        ) : (
          <ul className="space-y-2">
            {indexedSources.map((src) => {
              const attached = active.source_ids.includes(src.id)
              const isToggling = toggling === src.id
              return (
                <li
                  key={src.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-3 min-w-0">
                    {isToggling ? (
                      <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={attached}
                        onChange={() => onToggleSource(src.id)}
                        disabled={!!toggling}
                        className="size-4 shrink-0 accent-primary"
                      />
                    )}
                    <span className="truncate">{src.name}</span>
                  </label>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {src.byte_size ? `${(src.byte_size / 1024 / 1024).toFixed(1)} MB` : ""}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {pendingSources.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {pendingSources.length} source{pendingSources.length !== 1 ? "s" : ""} still indexing — will appear here when ready.
          </p>
        )}
      </section>

      {/* Sessions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-medium">
            Chat sessions ({active.session_count})
          </h2>
          {active.session_count > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/chat?notebook=${active.id}`)}
            >
              Open in Chat →
            </Button>
          )}
        </div>
        {active.session_count === 0 && (
          <p className="text-sm text-muted-foreground">
            {active.source_ids.length === 0
              ? "Attach at least one source above, then create a session."
              : "Click \"New chat session\" above to start chatting with your sources."}
          </p>
        )}
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-destructive/30 p-4 space-y-2">
        <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
        <p className="text-xs text-muted-foreground">
          Deleting this notebook removes all its sessions permanently.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="border-destructive/50 text-destructive hover:bg-destructive/10"
          onClick={() => onDeleteNotebook(active.id)}
        >
          <Trash2Icon className="size-4" /> Delete notebook
        </Button>
      </section>
    </div>
  )
}
