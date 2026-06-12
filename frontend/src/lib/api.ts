const API_BASE = import.meta.env.VITE_API_URL ?? ""

const DEV_USER_ID = "00000000-0000-4000-8000-000000000001"

/** URL to preview a source file inline in the browser (auth via token query param). */
export function sourcePreviewUrl(sourceId: string): string {
  const token = localStorage.getItem("ownnblm_token")
  const qs = token ? `?access_token=${encodeURIComponent(token)}` : ""
  return `${API_BASE}/api/v1/sources/${sourceId}/preview${qs}`
}

function headers(): HeadersInit {
  const h: Record<string, string> = {}
  const token = localStorage.getItem("ownnblm_token")
  if (token) h.Authorization = `Bearer ${token}`
  else if (import.meta.env.DEV) h["X-Dev-User-Id"] = DEV_USER_ID
  return h
}

export async function api<T = void>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers as Record<string, string>) },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail))
  }
  // 204 No Content and 205 Reset Content carry no body — return undefined cast as T
  if (res.status === 204 || res.status === 205) return undefined as unknown as T
  const ct = res.headers.get("content-type") ?? ""
  if (!ct.includes("application/json")) return undefined as unknown as T
  return res.json() as Promise<T>
}

type AuthPayload = {
  access_token: string
  refresh_token?: string
  user_id: string
  org_id: string
  email: string
  role?: string
}

export type AuthConfig = {
  restricted: boolean
  allow_register: boolean
  allow_magic_link: boolean
  allow_google: boolean
  message: string | null
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  return api<AuthConfig>("/api/v1/auth/config")
}

export async function login(email: string, password: string) {
  const data = await api<AuthPayload>("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  persistAuth(data)
  return data
}

export async function requestMagicLink(email: string) {
  return api<{ sent: boolean; magic_link_url?: string }>("/api/v1/auth/magic-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })
}

export async function verifyMagicLink(token: string) {
  const data = await api<AuthPayload>("/api/v1/auth/magic-link/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  })
  persistAuth(data)
  return data
}

export async function loginWithGoogle(idToken: string) {
  const data = await api<AuthPayload>("/api/v1/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  })
  persistAuth(data)
  return data
}

export async function acceptInvite(token: string, password: string, displayName: string) {
  const data = await api<AuthPayload>("/api/v1/auth/invites/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password, display_name: displayName }),
  })
  persistAuth(data)
  return data
}

export function persistAuth(data: {
  access_token: string
  email: string
  user_id: string
}) {
  localStorage.setItem("ownnblm_token", data.access_token)
  localStorage.setItem("ownnblm_email", data.email)
  localStorage.setItem("ownnblm_user_id", data.user_id)
}

export function clearAuth() {
  localStorage.removeItem("ownnblm_token")
  localStorage.removeItem("ownnblm_email")
  localStorage.removeItem("ownnblm_user_id")
}

export function getStoredUser(): { email: string; name: string } {
  const email = localStorage.getItem("ownnblm_email") ?? ""
  const name = email ? email.split("@")[0] : "Account"
  return { email, name: name.charAt(0).toUpperCase() + name.slice(1) }
}

export async function register(email: string, password: string, orgName = "My Workspace") {
  const data = await api<{ access_token: string; user_id: string; org_id: string; email: string }>(
    "/api/v1/auth/register",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, org_name: orgName }),
    },
  )
  persistAuth(data)
  return data
}

export async function createShareLink(sessionId: string) {
  return api<{ token: string; url: string }>(`/api/v1/sessions/${sessionId}/share`, {
    method: "POST",
  })
}

export async function startCheckout(plan: string) {
  return api<{ checkout_url: string }>("/api/v1/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  })
}

export type Source = {
  id: string
  name: string
  status: string
  source_type: string
  byte_size: number | null
  error_message: string | null
  is_private?: boolean
}

export type Session = { id: string; title: string; source_ids: string[]; notebook_id?: string | null }

export type Notebook = {
  id: string
  title: string
  description: string | null
  source_ids: string[]
  session_count: number
}

export async function listNotebooks(): Promise<Notebook[]> {
  return api<Notebook[]>("/api/v1/notebooks")
}

export async function createNotebook(title: string, description?: string, source_ids: string[] = []): Promise<Notebook> {
  return api<Notebook>("/api/v1/notebooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, source_ids }),
  })
}

export async function updateNotebook(id: string, patch: { title?: string; description?: string }): Promise<Notebook> {
  return api<Notebook>(`/api/v1/notebooks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
}

export async function deleteNotebook(id: string): Promise<void> {
  await api(`/api/v1/notebooks/${id}`, { method: "DELETE" })
}

export async function addSourceToNotebook(notebookId: string, sourceId: string): Promise<void> {
  await api(`/api/v1/notebooks/${notebookId}/sources/${sourceId}`, { method: "PUT" })
}

export async function removeSourceFromNotebook(notebookId: string, sourceId: string): Promise<void> {
  await api(`/api/v1/notebooks/${notebookId}/sources/${sourceId}`, { method: "DELETE" })
}

export async function listNotebookSessions(notebookId: string): Promise<Session[]> {
  return api<Session[]>(`/api/v1/notebooks/${notebookId}/sessions`)
}

export async function createNotebookSession(notebookId: string, title = "New session"): Promise<Session> {
  return api<Session>(`/api/v1/notebooks/${notebookId}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  })
}

export type Usage = {
  queries_used: number
  query_limit: number
  queries_remaining: number
  usage_percent: number
  storage_bytes: number
  storage_limit_bytes: number
  tier: string
  llm_burn_enabled: boolean
  llm_budget_usd: string | null
  llm_spent_usd: string | null
  llm_remaining_usd: string | null
  llm_burn_percent: number
}

export async function streamChat(
  sessionId: string,
  message: string,
  onEvent: (ev: Record<string, unknown>) => void,
) {
  const res = await fetch(`${API_BASE}/api/v1/sessions/${sessionId}/chat`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  })
  if (!res.ok) {
    const text = await res.text()
    let detail = text
    try {
      const j = JSON.parse(text) as { detail?: string | { message?: string } }
      if (typeof j.detail === "string") detail = j.detail
      else if (j.detail && typeof j.detail === "object" && "message" in j.detail)
        detail = String(j.detail.message)
    } catch {
      /* use raw */
    }
    throw new Error(detail || `Request failed (${res.status})`)
  }
  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buf = ""
  let streamError: string | null = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      try {
        const ev = JSON.parse(line.slice(6)) as Record<string, unknown>
        if (ev.event === "error" && typeof ev.message === "string") {
          streamError = ev.message
        }
        onEvent(ev)
      } catch {
        /* ignore */
      }
    }
  }
  if (streamError) throw new Error(streamError)
}

export type IngestEvent = {
  event: string
  source_id?: string
  pct?: number
  step?: string
  chunks?: number
  reason?: string
}

/** SSE ingest progress from /api/v1/sources/{id}/events (EventSource cannot send headers). */
export function subscribeIngestEvents(
  sourceId: string,
  onEvent: (ev: IngestEvent) => void,
): () => void {
  const qs = new URLSearchParams()
  const token = localStorage.getItem("ownnblm_token")
  if (token) qs.set("access_token", token)
  else if (import.meta.env.DEV) qs.set("x-dev-user-id", DEV_USER_ID)
  const url = `${API_BASE}/api/v1/sources/${sourceId}/events?${qs}`
  const es = new EventSource(url)
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data) as IngestEvent)
    } catch {
      /* ignore */
    }
  }
  return () => es.close()
}

export type Member = { id: string; email: string; display_name: string; role: string }
export type PendingInvite = { id: string; email: string; role: string; expires_at: string }
export type MemberStorage = {
  user_id: string | null
  email: string | null
  display_name: string
  storage_bytes: number
  source_count: number
}
export type AuditEvent = {
  id: string
  action: string
  resource_type: string
  resource_id: string | null
  user_id: string | null
  created_at: string
}

export async function fetchMembers() {
  return api<Member[]>("/api/v1/admin/members")
}

export async function fetchPendingInvites() {
  return api<PendingInvite[]>("/api/v1/admin/invites")
}

export async function createInvite(email: string, role = "member") {
  return api<{ invite_url: string }>("/api/v1/admin/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
  })
}

export async function fetchMemberStorage() {
  return api<MemberStorage[]>("/api/v1/admin/members/storage")
}

export async function fetchAuditLog() {
  return api<AuditEvent[]>("/api/v1/admin/audit")
}

export async function openBillingPortal() {
  const r = await api<{ portal_url: string }>("/api/v1/admin/billing-portal", { method: "POST" })
  window.location.href = r.portal_url
}

export async function listApiKeys() {
  return api<{ id: string; name: string; scope: string; key_prefix: string }[]>("/api/v1/admin/api-keys")
}

export async function createApiKey(name: string, scope: string) {
  return api<{ api_key: string; id: string }>("/api/v1/admin/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, scope }),
  })
}

export async function listWebhooks() {
  return api<{ id: string; url: string; events: string[] }[]>("/api/v1/admin/webhooks")
}

export async function createWebhook(url: string, events: string[]) {
  return api<{ id: string }>("/api/v1/admin/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, events }),
  })
}

export async function sendDigestPreview() {
  return api<{ sent: number }>("/api/v1/admin/digest/send", { method: "POST" })
}

export async function provisionStack() {
  return api<{ deployment_mode: string; dedicated_url: string | null }>(
    "/api/v1/admin/provision-stack",
    { method: "POST" },
  )
}

export async function revokeApiKey(keyId: string) {
  return api<{ ok: boolean }>(`/api/v1/admin/api-keys/${keyId}`, { method: "DELETE" })
}

export async function deleteSource(sourceId: string) {
  return api<{ ok: boolean }>(`/api/v1/sources/${sourceId}`, { method: "DELETE" })
}

export async function retrySourceIngest(sourceId: string) {
  return api<{ ok: boolean; status: string }>(`/api/v1/sources/${sourceId}/retry`, {
    method: "POST",
  })
}

export async function resetCorpus(deleteAll: boolean) {
  return api<{ deleted: number; requeued: number }>("/api/v1/admin/corpus/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delete_all: deleteAll, requeue_stuck: true }),
  })
}

export async function patchSourcePrivacy(sourceId: string, isPrivate: boolean) {
  return api<Source>(`/api/v1/sources/${sourceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_private: isPrivate }),
  })
}

export async function fetchShareAnnotations(token: string) {
  return api<
    { id: string; content: string; author_name: string; created_at: string | null }[]
  >(`/api/v1/team/share/${token}/annotations`)
}

export async function postShareAnnotation(token: string, content: string) {
  return api<{ id: string }>(`/api/v1/team/share/${token}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
}

export function exportSessionCitations(sessionId: string, format: "bibtex" | "ris" | "zotero") {
  return fetch(`/api/v1/sessions/${sessionId}/export?format=${format}`, {
    headers: headers() as Record<string, string>,
  }).then(async (r) => {
    if (!r.ok) throw new Error(await r.text())
    return r.text()
  })
}
