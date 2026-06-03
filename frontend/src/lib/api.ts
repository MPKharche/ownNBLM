const API_BASE = import.meta.env.VITE_API_URL ?? ""

const DEV_USER_ID = "00000000-0000-4000-8000-000000000001"

function headers(): HeadersInit {
  const h: Record<string, string> = {}
  const token = localStorage.getItem("ownnblm_token")
  if (token) h.Authorization = `Bearer ${token}`
  else if (import.meta.env.DEV) h["X-Dev-User-Id"] = DEV_USER_ID
  return h
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers as Record<string, string>) },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail))
  }
  return res.json() as Promise<T>
}

export async function login(email: string, password: string) {
  const data = await api<{ access_token: string; user_id: string; org_id: string; email: string }>(
    "/api/v1/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
  )
  localStorage.setItem("ownnblm_token", data.access_token)
  return data
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
  localStorage.setItem("ownnblm_token", data.access_token)
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
}

export type Session = { id: string; title: string; source_ids: string[] }

export type Usage = {
  queries_used: number
  query_limit: number
  queries_remaining: number
  usage_percent: number
  storage_bytes: number
  storage_limit_bytes: number
  tier: string
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
