import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Loader2Icon, SendIcon, ShieldIcon, UsersIcon, WebhookIcon } from "lucide-react"

import {
  createApiKey,
  createInvite,
  createWebhook,
  fetchAuditLog,
  fetchMembers,
  fetchMemberStorage,
  fetchPendingInvites,
  listApiKeys,
  listWebhooks,
  openBillingPortal,
  revokeApiKey,
  sendDigestPreview,
  type AuditEvent,
  type Member,
  type MemberStorage,
  type PendingInvite,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Tab = "members" | "keys" | "webhooks" | "audit"

export function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  // S9: sync active tab with ?tab= URL param so browser back/forward and sharing work
  const tabParam = searchParams.get("tab") as Tab | null
  const [tab, setTabState] = useState<Tab>(tabParam && ["members", "keys", "webhooks", "audit"].includes(tabParam) ? tabParam : "members")

  function setTab(t: Tab) {
    setTabState(t)
    setSearchParams({ tab: t }, { replace: true })
  }
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [storage, setStorage] = useState<MemberStorage[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [keys, setKeys] = useState<{ id: string; name: string; scope: string; key_prefix: string }[]>([])
  const [hooks, setHooks] = useState<{ id: string; url: string; events: string[] }[]>([])
  const [inviteEmail, setInviteEmail] = useState("")
  const [newKeyName, setNewKeyName] = useState("")
  const [newHookUrl, setNewHookUrl] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [secretKey, setSecretKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function loadMembers() {
    fetchMembers().then(setMembers).catch((e) => setMsg(e instanceof Error ? e.message : "Failed"))
    fetchPendingInvites().then(setInvites).catch(console.error)
    fetchMemberStorage().then(setStorage).catch(console.error)
  }

  function loadKeys() {
    listApiKeys().then(setKeys).catch(console.error)
  }

  function loadHooks() {
    listWebhooks().then(setHooks).catch(console.error)
  }

  function loadAudit() {
    fetchAuditLog().then(setAudit).catch(console.error)
  }

  useEffect(() => {
    if (tab === "members") loadMembers()
    if (tab === "keys") loadKeys()
    if (tab === "webhooks") loadHooks()
    if (tab === "audit") loadAudit()
  }, [tab])

  async function onInvite() {
    if (!inviteEmail.trim()) return
    setBusy(true)
    try {
      const r = await createInvite(inviteEmail.trim())
      setMsg(`Invite created: ${r.invite_url}`)
      setInviteEmail("")
      loadMembers()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Invite failed")
    } finally {
      setBusy(false)
    }
  }

  async function onCreateKey() {
    if (!newKeyName.trim()) return
    setBusy(true)
    try {
      const r = await createApiKey(newKeyName.trim(), "read_only")
      setSecretKey(r.api_key)
      setNewKeyName("")
      loadKeys()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Key creation failed")
    } finally {
      setBusy(false)
    }
  }

  async function onCreateHook() {
    if (!newHookUrl.trim()) return
    setBusy(true)
    try {
      await createWebhook(newHookUrl.trim(), ["source.indexed", "session.answer_generated"])
      setNewHookUrl("")
      loadHooks()
      setMsg("Webhook created")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Webhook failed")
    } finally {
      setBusy(false)
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof UsersIcon }[] = [
    { id: "members", label: "Team", icon: UsersIcon },
    { id: "keys", label: "API keys", icon: ShieldIcon },
    { id: "webhooks", label: "Webhooks", icon: WebhookIcon },
    { id: "audit", label: "Audit log", icon: ShieldIcon },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Workspace admin</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => openBillingPortal().catch((e) => setMsg(String(e)))}>
            Billing portal
          </Button>
          <Button variant="outline" size="sm" onClick={() => sendDigestPreview().then((r) => setMsg(`Digest sent to ${r.sent} owner(s)`))}>
            Send digest
          </Button>
        </div>
      </div>

      {msg && (
        <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{msg}</p>
      )}
      {secretKey && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          <p className="font-medium text-primary">New API key — copy now:</p>
          <code className="mt-1 block break-all font-mono text-xs">{secretKey}</code>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => setSecretKey(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="flex gap-2 border-b border-border pb-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "members" && (
        <div className="space-y-6">
          <div className="flex gap-2">
            <Input
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <Button disabled={busy} onClick={onInvite}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
              Invite
            </Button>
          </div>
          <section>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Members</h2>
            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.id} className="flex justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span>{m.email}</span>
                  <span className="text-muted-foreground">{m.role}</span>
                </li>
              ))}
            </ul>
          </section>
          {invites.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Pending invites</h2>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {invites.map((i) => (
                  <li key={i.id}>{i.email} · expires {new Date(i.expires_at).toLocaleDateString()}</li>
                ))}
              </ul>
            </section>
          )}
          {storage.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Storage by member</h2>
              <ul className="space-y-1 text-sm">
                {storage.map((s) => (
                  <li key={s.user_id ?? "unknown"}>
                    {s.display_name}: {(s.storage_bytes / 1e6).toFixed(1)} MB · {s.source_count} files
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === "keys" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Key name" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
            <Button disabled={busy} onClick={onCreateKey}>
              Create key
            </Button>
          </div>
          <ul className="space-y-2 text-sm">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span>
                  {k.name} · {k.scope} · {k.key_prefix}…
                </span>
                <Button size="sm" variant="ghost" onClick={() => revokeApiKey(k.id).then(loadKeys)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "webhooks" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="https://example.com/hook" value={newHookUrl} onChange={(e) => setNewHookUrl(e.target.value)} />
            <Button disabled={busy} onClick={onCreateHook}>
              Add webhook
            </Button>
          </div>
          <ul className="space-y-2 text-sm">
            {hooks.map((h) => (
              <li key={h.id} className="rounded-lg border border-border px-3 py-2">
                <div>{h.url}</div>
                <div className="text-xs text-muted-foreground">{h.events.join(", ")}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "audit" && (
        <ul className="max-h-96 space-y-1 overflow-y-auto font-mono text-xs">
          {audit.map((e) => (
            <li key={e.id} className="rounded border border-border/60 px-2 py-1">
              {e.created_at} · {e.action} · {e.resource_type}/{e.resource_id ?? "—"}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
