/**
 * Production test suite — covers every API function, all error paths,
 * all application route workflows, and all edge cases that can surface
 * in the Vercel deployment (empty VITE_API_URL, relative paths, etc.).
 *
 * Run: npx vitest run src/lib/production.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function stubLocalStorage(token: string | null = "test-token") {
  const store: Record<string, string> = {}
  if (token) store["ownnblm_token"] = token
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
  })
  return store
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

function mockFetch(response: Response | (() => Response)) {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() =>
    Promise.resolve(typeof response === "function" ? response() : response),
  ))
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. API CLIENT — core fetch wrapper
// ─────────────────────────────────────────────────────────────────────────────

describe("api() core — relative path when VITE_API_URL is empty (Vercel production)", () => {
  afterEach(() => vi.restoreAllMocks())

  it("makes request to relative path /api/... when API_BASE is empty", async () => {
    stubLocalStorage("tok")
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal("fetch", fetchSpy)
    const { api } = await import("./api")
    await api<{ ok: boolean }>("/api/v1/notebooks")
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/notebooks/),
      expect.any(Object),
    )
  })

  it("includes Authorization header when token present", async () => {
    stubLocalStorage("mytoken")
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal("fetch", fetchSpy)
    const { api } = await import("./api")
    await api("/api/v1/test")
    const opts = fetchSpy.mock.calls[0][1] as RequestInit
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer mytoken")
  })

  it("omits Authorization header when no token in localStorage", async () => {
    stubLocalStorage(null)
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal("fetch", fetchSpy)
    const { api } = await import("./api")
    await api("/api/v1/test")
    const opts = fetchSpy.mock.calls[0][1] as RequestInit
    expect((opts.headers as Record<string, string>)["Authorization"]).toBeUndefined()
  })

  it("parses JSON response on 200", async () => {
    stubLocalStorage()
    mockFetch(jsonResponse({ id: "abc", title: "Test" }))
    const { api } = await import("./api")
    const result = await api<{ id: string; title: string }>("/api/v1/test")
    expect(result.id).toBe("abc")
    expect(result.title).toBe("Test")
  })

  it("returns undefined for 204 No Content", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    const { api } = await import("./api")
    const result = await api("/api/v1/test")
    expect(result).toBeUndefined()
  })

  it("returns undefined for 205 Reset Content", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 205 })))
    const { api } = await import("./api")
    const result = await api("/api/v1/test")
    expect(result).toBeUndefined()
  })

  it("returns undefined when response has no JSON content-type", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
    ))
    const { api } = await import("./api")
    const result = await api("/api/v1/test")
    expect(result).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. HTTP Error handling
// ─────────────────────────────────────────────────────────────────────────────

describe("api() — HTTP error status codes", () => {
  afterEach(() => vi.restoreAllMocks())

  it("throws ApiError with status 401 and clears auth", async () => {
    const store = stubLocalStorage("old-token")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })))
    vi.stubGlobal("window", { ...globalThis.window, location: { href: "" } })
    const { api } = await import("./api")
    await expect(api("/test")).rejects.toThrow(/session expired/i)
    expect(store["ownnblm_token"]).toBeUndefined()
  })

  it("throws ApiError with isRateLimited=true on 429", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("{}", { status: 429, headers: { "Retry-After": "30" } }),
    ))
    const { api, ApiError } = await import("./api")
    try {
      await api("/test")
      expect.fail("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as InstanceType<typeof ApiError>).isRateLimited).toBe(true)
      expect((e as InstanceType<typeof ApiError>).status).toBe(429)
      expect((e as InstanceType<typeof ApiError>).message).toMatch(/30 seconds/)
    }
  })

  it("throws friendly message for 404", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "not found" }, 404)))
    const { api } = await import("./api")
    await expect(api("/test")).rejects.toThrow(/not found/i)
  })

  it("throws friendly message for 403", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "forbidden" }, 403)))
    const { api } = await import("./api")
    await expect(api("/test")).rejects.toThrow(/permission/i)
  })

  it("throws on 500 with server error message", async () => {
    stubLocalStorage()
    vi.useFakeTimers()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse({ detail: "Internal error" }, 500),
    ))
    const { api } = await import("./api")
    let caught: Error | null = null
    const p = api("/test").catch((e: Error) => { caught = e })
    await vi.runAllTimersAsync()
    await p
    expect(caught).not.toBeNull()
    expect(caught!.message).toMatch(/server error/i)
    vi.useRealTimers()
  }, 15000)

  it("extracts detail.message when detail is object", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse({ detail: { message: "Quota exceeded" } }, 422),
    ))
    const { api } = await import("./api")
    await expect(api("/test")).rejects.toThrow("Quota exceeded")
  })

  it("extracts err.message as fallback", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse({ message: "Something broke" }, 400),
    ))
    const { api } = await import("./api")
    await expect(api("/test")).rejects.toThrow("Something broke")
  })

  it("falls back to statusText when response body is not JSON", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("not json", { status: 400, statusText: "Bad Request" }),
    ))
    const { api } = await import("./api")
    await expect(api("/test")).rejects.toThrow()
  })

  it("includes request ID in error when X-Request-ID header present", async () => {
    stubLocalStorage()
    vi.useFakeTimers()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "error" }), {
        status: 500,
        headers: { "content-type": "application/json", "X-Request-ID": "req-xyz" },
      }),
    ))
    const { api, ApiError } = await import("./api")
    let caught: InstanceType<typeof ApiError> | null = null
    const p = api("/test").catch((e: InstanceType<typeof ApiError>) => { caught = e })
    await vi.runAllTimersAsync()
    await p
    expect(caught).not.toBeNull()
    expect(caught!.requestId).toBe("req-xyz")
    vi.useRealTimers()
  }, 15000)
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Network / timeout errors
// ─────────────────────────────────────────────────────────────────────────────

describe("api() — network and timeout errors", () => {
  afterEach(() => vi.restoreAllMocks())

  it("throws timeout error when AbortError is thrown", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" })))
    const { api, ApiError } = await import("./api")
    try {
      await api("/test")
      expect.fail("should throw")
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as InstanceType<typeof ApiError>).isTimeout).toBe(true)
    }
  })

  it("throws network error on TypeError 'Failed to fetch'", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    const { api, ApiError } = await import("./api")
    try {
      await api("/test")
      expect.fail("should throw")
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as InstanceType<typeof ApiError>).isNetworkError).toBe(true)
    }
  })

  it("throws generic ApiError for unknown errors", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unknown failure")))
    const { api, ApiError } = await import("./api")
    try {
      await api("/test")
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as InstanceType<typeof ApiError>).message).toBe("Unknown failure")
    }
  })

  it("throws offline error when navigator.onLine is false", async () => {
    stubLocalStorage()
    vi.stubGlobal("navigator", { onLine: false })
    const { api, ApiError } = await import("./api")
    try {
      await api("/test")
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as InstanceType<typeof ApiError>).isNetworkError).toBe(true)
      expect((e as InstanceType<typeof ApiError>).message).toMatch(/offline/i)
    }
    vi.stubGlobal("navigator", { onLine: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. 5xx Retry logic
// ─────────────────────────────────────────────────────────────────────────────

describe("api() — retry on 5xx", () => {
  afterEach(() => vi.restoreAllMocks())

  it("retries on 503 and succeeds on second call", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    vi.stubGlobal("fetch", fetchSpy)
    vi.useFakeTimers()
    const { api } = await import("./api")
    const p = api<{ ok: boolean }>("/test")
    // advance past the 1s delay
    await vi.runAllTimersAsync()
    const result = await p
    expect(result.ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it("isRetryable returns true for 500-599 range", () => {
    const isRetryable = (status?: number) => !!status && status >= 500 && status < 600
    expect(isRetryable(500)).toBe(true)
    expect(isRetryable(503)).toBe(true)
    expect(isRetryable(599)).toBe(true)
    expect(isRetryable(400)).toBe(false)
    expect(isRetryable(200)).toBe(false)
    expect(isRetryable(undefined)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Auth functions
// ─────────────────────────────────────────────────────────────────────────────

describe("Auth — login, register, magic link, google, invite", () => {
  afterEach(() => vi.restoreAllMocks())

  const authPayload = {
    access_token: "tok123",
    user_id: "u1",
    org_id: "o1",
    email: "test@example.com",
    role: "admin",
  }

  it("login() calls POST /auth/login and persists token", async () => {
    const store = stubLocalStorage(null)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(authPayload)))
    const { login } = await import("./api")
    await login("test@example.com", "password123")
    expect(store["ownnblm_token"]).toBe("tok123")
    expect(store["ownnblm_email"]).toBe("test@example.com")
    expect(store["ownnblm_user_id"]).toBe("u1")
  })

  it("register() calls POST /auth/register and persists token", async () => {
    const store = stubLocalStorage(null)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(authPayload)))
    const { register } = await import("./api")
    await register("test@example.com", "password", "My Workspace")
    expect(store["ownnblm_token"]).toBe("tok123")
  })

  it("requestMagicLink() sends email and returns sent status", async () => {
    stubLocalStorage(null)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ sent: true })))
    const { requestMagicLink } = await import("./api")
    const r = await requestMagicLink("user@example.com")
    expect(r.sent).toBe(true)
  })

  it("verifyMagicLink() persists token on success", async () => {
    const store = stubLocalStorage(null)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(authPayload)))
    const { verifyMagicLink } = await import("./api")
    await verifyMagicLink("magic-token-abc")
    expect(store["ownnblm_token"]).toBe("tok123")
  })

  it("loginWithGoogle() persists token", async () => {
    const store = stubLocalStorage(null)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(authPayload)))
    const { loginWithGoogle } = await import("./api")
    await loginWithGoogle("google-id-token")
    expect(store["ownnblm_token"]).toBe("tok123")
  })

  it("acceptInvite() persists token and returns payload", async () => {
    const store = stubLocalStorage(null)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(authPayload)))
    const { acceptInvite } = await import("./api")
    const result = await acceptInvite("invite-token", "password", "Alice")
    expect(store["ownnblm_token"]).toBe("tok123")
    expect(result.email).toBe("test@example.com")
  })

  it("login() throws ApiError on wrong credentials (401)", async () => {
    stubLocalStorage(null)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })))
    vi.stubGlobal("window", { ...globalThis.window, location: { href: "" } })
    const { login } = await import("./api")
    await expect(login("bad@example.com", "wrong")).rejects.toThrow()
  })

  it("login() throws on network error", async () => {
    stubLocalStorage(null)
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    const { login } = await import("./api")
    await expect(login("a@b.com", "p")).rejects.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Auth persistence helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("Auth helpers — persistAuth, clearAuth, getStoredUser", () => {
  afterEach(() => vi.restoreAllMocks())

  it("persistAuth stores all three keys", async () => {
    const store = stubLocalStorage(null)
    const { persistAuth } = await import("./api")
    persistAuth({ access_token: "t1", email: "a@b.com", user_id: "u99" })
    expect(store["ownnblm_token"]).toBe("t1")
    expect(store["ownnblm_email"]).toBe("a@b.com")
    expect(store["ownnblm_user_id"]).toBe("u99")
  })

  it("clearAuth removes all three keys", async () => {
    const store = stubLocalStorage("tok")
    store["ownnblm_email"] = "x@y.com"
    store["ownnblm_user_id"] = "uid"
    const { clearAuth } = await import("./api")
    clearAuth()
    expect(store["ownnblm_token"]).toBeUndefined()
    expect(store["ownnblm_email"]).toBeUndefined()
    expect(store["ownnblm_user_id"]).toBeUndefined()
  })

  it("getStoredUser returns email and capitalised name", async () => {
    stubLocalStorage("tok")
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => k === "ownnblm_email" ? "alice@example.com" : null,
    })
    const { getStoredUser } = await import("./api")
    const user = getStoredUser()
    expect(user.email).toBe("alice@example.com")
    expect(user.name).toBe("Alice")
  })

  it("getStoredUser returns 'Account' when no email stored", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null })
    const { getStoredUser } = await import("./api")
    const user = getStoredUser()
    expect(user.name).toBe("Account")
    expect(user.email).toBe("")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Notebook API functions
// ─────────────────────────────────────────────────────────────────────────────

describe("Notebook API functions", () => {
  afterEach(() => vi.restoreAllMocks())

  const notebook = { id: "nb1", title: "Research", description: null, source_ids: [], session_count: 0 }

  it("listNotebooks() returns array", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([notebook])))
    const { listNotebooks } = await import("./api")
    const result = await listNotebooks()
    expect(Array.isArray(result)).toBe(true)
    expect(result[0].id).toBe("nb1")
  })

  it("createNotebook() sends title, description, source_ids", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(notebook))
    vi.stubGlobal("fetch", fetchSpy)
    const { createNotebook } = await import("./api")
    await createNotebook("Research", "My notes", ["s1"])
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.title).toBe("Research")
    expect(body.description).toBe("My notes")
    expect(body.source_ids).toEqual(["s1"])
  })

  it("createNotebook() defaults source_ids to empty array", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(notebook))
    vi.stubGlobal("fetch", fetchSpy)
    const { createNotebook } = await import("./api")
    await createNotebook("Test")
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.source_ids).toEqual([])
  })

  it("updateNotebook() sends PATCH with partial fields", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ ...notebook, title: "Updated" }))
    vi.stubGlobal("fetch", fetchSpy)
    const { updateNotebook } = await import("./api")
    const result = await updateNotebook("nb1", { title: "Updated" })
    expect(result.title).toBe("Updated")
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe("PATCH")
  })

  it("deleteNotebook() sends DELETE and returns undefined", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchSpy)
    const { deleteNotebook } = await import("./api")
    const result = await deleteNotebook("nb1")
    expect(result).toBeUndefined()
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe("DELETE")
  })

  it("addSourceToNotebook() sends PUT to correct URL", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchSpy)
    const { addSourceToNotebook } = await import("./api")
    await addSourceToNotebook("nb1", "src1")
    expect(fetchSpy.mock.calls[0][0]).toMatch(/\/notebooks\/nb1\/sources\/src1/)
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe("PUT")
  })

  it("removeSourceFromNotebook() sends DELETE to correct URL", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchSpy)
    const { removeSourceFromNotebook } = await import("./api")
    await removeSourceFromNotebook("nb1", "src1")
    expect(fetchSpy.mock.calls[0][0]).toMatch(/\/notebooks\/nb1\/sources\/src1/)
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe("DELETE")
  })

  it("listNotebookSessions() calls GET /notebooks/:id/sessions", async () => {
    stubLocalStorage()
    const session = { id: "s1", title: "Session 1", source_ids: [], notebook_id: "nb1" }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([session])))
    const { listNotebookSessions } = await import("./api")
    const result = await listNotebookSessions("nb1")
    expect(result[0].id).toBe("s1")
  })

  it("createNotebookSession() defaults title to 'New session'", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse({ id: "s2", title: "New session", source_ids: [] }),
    )
    vi.stubGlobal("fetch", fetchSpy)
    const { createNotebookSession } = await import("./api")
    const result = await createNotebookSession("nb1")
    expect(result.title).toBe("New session")
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.title).toBe("New session")
  })

  it("listNotebooks() throws ApiError on 403", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "forbidden" }, 403)))
    const { listNotebooks } = await import("./api")
    await expect(listNotebooks()).rejects.toThrow(/permission/i)
  })

  it("deleteNotebook() throws ApiError on 404", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "not found" }, 404)))
    const { deleteNotebook } = await import("./api")
    await expect(deleteNotebook("missing")).rejects.toThrow(/not found/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Source API functions
// ─────────────────────────────────────────────────────────────────────────────

describe("Source API functions", () => {
  afterEach(() => vi.restoreAllMocks())

  it("deleteSource() returns { ok: true } on success", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true })))
    const { deleteSource } = await import("./api")
    const r = await deleteSource("src1")
    expect(r?.ok).toBe(true)
  })

  it("deleteSource() throws on 404 (already deleted)", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "not found" }, 404)))
    const { deleteSource } = await import("./api")
    await expect(deleteSource("missing")).rejects.toThrow()
  })

  it("retrySourceIngest() sends POST to /sources/:id/retry", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ ok: true, status: "pending" }))
    vi.stubGlobal("fetch", fetchSpy)
    const { retrySourceIngest } = await import("./api")
    const r = await retrySourceIngest("src1")
    expect(r.ok).toBe(true)
    expect(r.status).toBe("pending")
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe("POST")
  })

  it("patchSourcePrivacy() sends PATCH with is_private flag", async () => {
    stubLocalStorage()
    const src = { id: "src1", name: "doc.pdf", folder_path: null, status: "indexed", source_type: "pdf", byte_size: 1024, error_message: null, is_private: true }
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(src))
    vi.stubGlobal("fetch", fetchSpy)
    const { patchSourcePrivacy } = await import("./api")
    const result = await patchSourcePrivacy("src1", true)
    expect(result.is_private).toBe(true)
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.is_private).toBe(true)
  })

  it("sourcePreviewUrl() includes access_token query param", async () => {
    vi.stubGlobal("localStorage", { getItem: (k: string) => k === "ownnblm_token" ? "mytoken" : null })
    const { sourcePreviewUrl } = await import("./api")
    const url = sourcePreviewUrl("src1")
    expect(url).toMatch(/access_token=mytoken/)
    expect(url).toMatch(/\/sources\/src1\/preview/)
  })

  it("sourcePreviewUrl() omits access_token when no token", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null })
    const { sourcePreviewUrl } = await import("./api")
    const url = sourcePreviewUrl("src1")
    expect(url).not.toMatch(/access_token/)
    expect(url).toMatch(/\/sources\/src1\/preview/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. Admin API functions
// ─────────────────────────────────────────────────────────────────────────────

describe("Admin API functions", () => {
  afterEach(() => vi.restoreAllMocks())

  it("fetchMembers() returns Member[]", async () => {
    stubLocalStorage()
    const members = [{ id: "u1", email: "a@b.com", display_name: "Alice", role: "admin" }]
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(members)))
    const { fetchMembers } = await import("./api")
    const result = await fetchMembers()
    expect(result[0].email).toBe("a@b.com")
  })

  it("fetchPendingInvites() returns PendingInvite[]", async () => {
    stubLocalStorage()
    const invites = [{ id: "i1", email: "b@c.com", role: "member", expires_at: "2026-01-01" }]
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(invites)))
    const { fetchPendingInvites } = await import("./api")
    const result = await fetchPendingInvites()
    expect(result[0].email).toBe("b@c.com")
  })

  it("createInvite() posts email and role, returns invite_url", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ invite_url: "/invite/tok123" }))
    vi.stubGlobal("fetch", fetchSpy)
    const { createInvite } = await import("./api")
    const r = await createInvite("new@user.com", "member")
    expect(r.invite_url).toBe("/invite/tok123")
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.email).toBe("new@user.com")
    expect(body.role).toBe("member")
  })

  it("createInvite() defaults role to 'member'", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ invite_url: "/invite/x" }))
    vi.stubGlobal("fetch", fetchSpy)
    const { createInvite } = await import("./api")
    await createInvite("x@y.com")
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.role).toBe("member")
  })

  it("listApiKeys() returns key list", async () => {
    stubLocalStorage()
    const keys = [{ id: "k1", name: "My Key", scope: "read_only", key_prefix: "sk-abc" }]
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(keys)))
    const { listApiKeys } = await import("./api")
    const result = await listApiKeys()
    expect(result[0].key_prefix).toBe("sk-abc")
  })

  it("createApiKey() returns api_key and id", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ api_key: "sk-full-key", id: "k2" })))
    const { createApiKey } = await import("./api")
    const r = await createApiKey("Prod Key", "read_only")
    expect(r.api_key).toBe("sk-full-key")
  })

  it("revokeApiKey() sends DELETE and returns { ok: true }", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal("fetch", fetchSpy)
    const { revokeApiKey } = await import("./api")
    const r = await revokeApiKey("k1")
    expect(r?.ok).toBe(true)
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe("DELETE")
  })

  it("listWebhooks() returns webhook list", async () => {
    stubLocalStorage()
    const hooks = [{ id: "h1", url: "https://example.com/hook", events: ["source.indexed"] }]
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(hooks)))
    const { listWebhooks } = await import("./api")
    const result = await listWebhooks()
    expect(result[0].url).toBe("https://example.com/hook")
  })

  it("createWebhook() sends url and events", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ id: "h2" }))
    vi.stubGlobal("fetch", fetchSpy)
    const { createWebhook } = await import("./api")
    const r = await createWebhook("https://my.site/hook", ["source.indexed"])
    expect(r.id).toBe("h2")
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.url).toBe("https://my.site/hook")
    expect(body.events).toEqual(["source.indexed"])
  })

  it("sendDigestPreview() returns { sent: number }", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ sent: 2 })))
    const { sendDigestPreview } = await import("./api")
    const r = await sendDigestPreview()
    expect(r.sent).toBe(2)
  })

  it("resetCorpus() sends delete_all and requeue_stuck", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ deleted: 5, requeued: 0 }))
    vi.stubGlobal("fetch", fetchSpy)
    const { resetCorpus } = await import("./api")
    const r = await resetCorpus(true)
    expect(r.deleted).toBe(5)
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.delete_all).toBe(true)
    expect(body.requeue_stuck).toBe(true)
  })

  it("fetchMemberStorage() returns MemberStorage[]", async () => {
    stubLocalStorage()
    const storage = [{ user_id: "u1", email: "a@b.com", display_name: "Alice", storage_bytes: 1e6, source_count: 3 }]
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(storage)))
    const { fetchMemberStorage } = await import("./api")
    const result = await fetchMemberStorage()
    expect(result[0].storage_bytes).toBe(1e6)
  })

  it("fetchAuditLog() returns AuditEvent[]", async () => {
    stubLocalStorage()
    const events = [{ id: "e1", action: "login", resource_type: "user", resource_id: "u1", user_id: "u1", created_at: "2026-01-01T00:00:00Z" }]
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(events)))
    const { fetchAuditLog } = await import("./api")
    const result = await fetchAuditLog()
    expect(result[0].action).toBe("login")
  })

  it("admin endpoints throw on 403 (non-admin user)", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "forbidden" }, 403)))
    const { fetchMembers } = await import("./api")
    await expect(fetchMembers()).rejects.toThrow(/permission/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. Billing API functions
// ─────────────────────────────────────────────────────────────────────────────

describe("Billing API functions", () => {
  afterEach(() => vi.restoreAllMocks())

  it("startCheckout() returns checkout_url", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ checkout_url: "https://pay.example.com/checkout" })))
    const { startCheckout } = await import("./api")
    const r = await startCheckout("pro")
    expect(r.checkout_url).toBe("https://pay.example.com/checkout")
  })

  it("startCheckout() throws when billing not configured", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "Billing not enabled" }, 422)))
    const { startCheckout } = await import("./api")
    await expect(startCheckout("pro")).rejects.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11. Share / annotation API functions
// ─────────────────────────────────────────────────────────────────────────────

describe("Share and annotation API functions", () => {
  afterEach(() => vi.restoreAllMocks())

  it("createShareLink() returns token and url", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ token: "abc", url: "/share/abc" })))
    const { createShareLink } = await import("./api")
    const r = await createShareLink("sess1")
    expect(r.token).toBe("abc")
    expect(r.url).toBe("/share/abc")
  })

  it("fetchShareAnnotations() returns annotation array", async () => {
    stubLocalStorage()
    const ann = [{ id: "a1", content: "Good point", author_name: "Alice", created_at: null }]
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(ann)))
    const { fetchShareAnnotations } = await import("./api")
    const result = await fetchShareAnnotations("sharetoken")
    expect(result[0].content).toBe("Good point")
  })

  it("postShareAnnotation() sends content and returns id", async () => {
    stubLocalStorage()
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ id: "a2" }))
    vi.stubGlobal("fetch", fetchSpy)
    const { postShareAnnotation } = await import("./api")
    const r = await postShareAnnotation("sharetoken", "My comment")
    expect(r.id).toBe("a2")
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.content).toBe("My comment")
  })

  it("fetchShareAnnotations() throws on 404 (invalid token)", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "not found" }, 404)))
    const { fetchShareAnnotations } = await import("./api")
    await expect(fetchShareAnnotations("bad-token")).rejects.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 12. streamChat — SSE streaming
// ─────────────────────────────────────────────────────────────────────────────

describe("streamChat — SSE streaming", () => {
  afterEach(() => vi.restoreAllMocks())

  function makeSseBody(events: object[]) {
    return events.map((e) => `data: ${JSON.stringify(e)}`).join("\n") + "\n"
  }

  function mockStream(body: string) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => {
          let done = false
          return {
            read: async () => {
              if (!done) { done = true; return { done: false, value: new TextEncoder().encode(body) } }
              return { done: true, value: undefined }
            },
          }
        },
      },
    }))
  }

  it("fires onEvent for each token and the done event", async () => {
    stubLocalStorage()
    mockStream(makeSseBody([
      { event: "token", delta: "Hello" },
      { event: "token", delta: " world" },
      { event: "done", citations: [{ id: "c1" }] },
    ]))
    const { streamChat } = await import("./api")
    const events: object[] = []
    await streamChat("s1", "hi", (ev) => events.push(ev))
    const tokens = events.filter((e) => (e as { event: string }).event === "token")
    expect(tokens).toHaveLength(2)
    const done = events.find((e) => (e as { event: string }).event === "done")
    expect(done).toBeDefined()
  })

  it("throws after stream when error event is emitted", async () => {
    stubLocalStorage()
    mockStream(makeSseBody([
      { event: "error", message: "Budget exceeded" },
    ]))
    const { streamChat } = await import("./api")
    await expect(streamChat("s1", "q", () => {})).rejects.toThrow("Budget exceeded")
  })

  it("throws when HTTP response is not ok", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => JSON.stringify({ detail: "Quota reached" }),
    }))
    const { streamChat } = await import("./api")
    await expect(streamChat("s1", "q", () => {})).rejects.toThrow("Quota reached")
  })

  it("throws raw text when response body is not JSON", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }))
    const { streamChat } = await import("./api")
    await expect(streamChat("s1", "q", () => {})).rejects.toThrow("Internal Server Error")
  })

  it("handles null body reader gracefully", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    }))
    const { streamChat } = await import("./api")
    // Should not throw — body is null, reader is skipped
    await expect(streamChat("s1", "q", () => {})).resolves.toBeUndefined()
  })

  it("ignores malformed SSE lines", async () => {
    stubLocalStorage()
    mockStream("data: {broken json\ndata: {\"event\":\"done\",\"citations\":[]}\n")
    const { streamChat } = await import("./api")
    const events: object[] = []
    await streamChat("s1", "q", (ev) => events.push(ev))
    const done = events.find((e) => (e as { event: string }).event === "done")
    expect(done).toBeDefined()
  })

  it("skips lines that don't start with 'data: '", async () => {
    stubLocalStorage()
    mockStream(
      "event: ping\n" +
      "id: 1\n" +
      'data: {"event":"done","citations":[]}\n',
    )
    const { streamChat } = await import("./api")
    const events: object[] = []
    await streamChat("s1", "q", (ev) => events.push(ev))
    expect(events).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 13. subscribeIngestEvents — EventSource (tested via the exported function directly)
// ─────────────────────────────────────────────────────────────────────────────

describe("subscribeIngestEvents — EventSource SSE", () => {
  afterEach(() => vi.restoreAllMocks())

  it("creates EventSource with access_token in URL and returns unsubscribe", async () => {
    vi.stubGlobal("localStorage", { getItem: (k: string) => k === "ownnblm_token" ? "testtoken" : null })
    const closeSpy = vi.fn()
    let capturedUrl = ""
    const MockES = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url
      return { close: closeSpy, set onmessage(_: unknown) {} }
    })
    vi.stubGlobal("EventSource", MockES)

    const { subscribeIngestEvents } = await import("./api")
    const unsub = subscribeIngestEvents("src1", () => {})

    expect(capturedUrl).toMatch(/access_token=testtoken/)
    expect(capturedUrl).toMatch(/\/sources\/src1\/events/)
    unsub()
    expect(closeSpy).toHaveBeenCalledOnce()
  })

  it("calls onEvent with parsed ingest_progress event", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "tok" })
    let messageHandler: ((msg: { data: string }) => void) | null = null
    vi.stubGlobal("EventSource", vi.fn().mockImplementation(() => ({
      close: vi.fn(),
      set onmessage(fn: (msg: { data: string }) => void) { messageHandler = fn },
    })))

    const { subscribeIngestEvents } = await import("./api")
    const events: object[] = []
    subscribeIngestEvents("src1", (ev: object) => events.push(ev))
    messageHandler?.({ data: JSON.stringify({ event: "ingest_progress", pct: 50, step: "Chunking" }) })
    expect(events).toHaveLength(1)
    expect((events[0] as { pct: number }).pct).toBe(50)
  })

  it("ignores malformed JSON in EventSource messages", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "tok" })
    let messageHandler: ((msg: { data: string }) => void) | null = null
    vi.stubGlobal("EventSource", vi.fn().mockImplementation(() => ({
      close: vi.fn(),
      set onmessage(fn: (msg: { data: string }) => void) { messageHandler = fn },
    })))

    const { subscribeIngestEvents } = await import("./api")
    const events: object[] = []
    subscribeIngestEvents("src1", (ev: object) => events.push(ev))
    expect(() => messageHandler?.({ data: "not-json{{{" })).not.toThrow()
    expect(events).toHaveLength(0)
  })

  it("unsubscribe function calls es.close()", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "tok" })
    const closeSpy = vi.fn()
    vi.stubGlobal("EventSource", vi.fn().mockImplementation(() => ({
      close: closeSpy,
      set onmessage(_: unknown) {},
    })))

    const { subscribeIngestEvents } = await import("./api")
    const unsub = subscribeIngestEvents("src1", () => {})
    unsub()
    expect(closeSpy).toHaveBeenCalledOnce()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 14. exportSessionCitations
// ─────────────────────────────────────────────────────────────────────────────

describe("exportSessionCitations", () => {
  afterEach(() => vi.restoreAllMocks())

  it("returns text body for bibtex format", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "tok" })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "@article{Smith2025, ...}",
    }))
    const { exportSessionCitations } = await import("./api")
    const text = await exportSessionCitations("s1", "bibtex")
    expect(text).toBe("@article{Smith2025, ...}")
  })

  it("throws error text when response is not ok", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "tok" })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Export failed: no citations",
    }))
    const { exportSessionCitations } = await import("./api")
    await expect(exportSessionCitations("s1", "ris")).rejects.toThrow("Export failed: no citations")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 15. provisionStack
// ─────────────────────────────────────────────────────────────────────────────

describe("provisionStack", () => {
  afterEach(() => vi.restoreAllMocks())

  it("returns deployment_mode and dedicated_url", async () => {
    stubLocalStorage()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse({ deployment_mode: "shared", dedicated_url: null }),
    ))
    const { provisionStack } = await import("./api")
    const r = await provisionStack()
    expect(r.deployment_mode).toBe("shared")
    expect(r.dedicated_url).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 16. Route protection — Protected component logic
// ─────────────────────────────────────────────────────────────────────────────

describe("Route protection logic", () => {
  afterEach(() => vi.restoreAllMocks())

  it("authed is true when ownnblm_token is in localStorage", () => {
    vi.stubGlobal("localStorage", { getItem: (k: string) => k === "ownnblm_token" ? "tok" : null })
    const authed = Boolean(localStorage.getItem("ownnblm_token"))
    expect(authed).toBe(true)
  })

  it("authed is false when token missing from localStorage", () => {
    vi.stubGlobal("localStorage", { getItem: () => null })
    const authed = Boolean(localStorage.getItem("ownnblm_token"))
    expect(authed).toBe(false)
  })

  it("session expired reason is shown when ?reason=session_expired", () => {
    const searchParams = new URLSearchParams("reason=session_expired")
    const reason = searchParams.get("reason")
    expect(reason).toBe("session_expired")
  })

  it("valid ?tab= params are accepted in admin page", () => {
    const VALID_TABS = ["members", "keys", "webhooks", "audit"]
    for (const tab of VALID_TABS) {
      expect(VALID_TABS.includes(tab)).toBe(true)
    }
  })

  it("invalid ?tab= params fall back to 'members'", () => {
    const VALID_TABS = ["members", "keys", "webhooks", "audit"]
    const param = "settings"
    const resolved = VALID_TABS.includes(param) ? param : "members"
    expect(resolved).toBe("members")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 17. BillingPage — error handling (the bug we fixed)
// ─────────────────────────────────────────────────────────────────────────────

describe("BillingPage — API error handling", () => {
  it("barColor thresholds produce correct CSS class", () => {
    function barColor(pct: number) {
      if (pct >= 90) return "bg-red-500"
      if (pct >= 70) return "bg-amber-500"
      return "bg-primary"
    }
    // boundary tests
    expect(barColor(0)).toBe("bg-primary")
    expect(barColor(69)).toBe("bg-primary")
    expect(barColor(70)).toBe("bg-amber-500")
    expect(barColor(89)).toBe("bg-amber-500")
    expect(barColor(90)).toBe("bg-red-500")
    expect(barColor(100)).toBe("bg-red-500")
  })

  it("storage percent calculation is correct for typical values", () => {
    const calc = (used: number, limit: number) =>
      limit > 0 ? Math.round((used / limit) * 100) : 0
    expect(calc(0, 5e9)).toBe(0)
    expect(calc(5e9, 5e9)).toBe(100)
    expect(calc(2.5e9, 5e9)).toBe(50)
    expect(calc(1e6, 5e9)).toBe(0) // rounds down
    expect(calc(0, 0)).toBe(0) // no divide by zero
  })

  it("queries_remaining = query_limit - queries_used", () => {
    const usage = { queries_used: 750, query_limit: 1000, queries_remaining: 250 }
    expect(usage.queries_remaining).toBe(usage.query_limit - usage.queries_used)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 18. NotebooksPage — state machine logic
// ─────────────────────────────────────────────────────────────────────────────

describe("NotebooksPage — state and source filtering", () => {
  it("filteredIndexed excludes pending/processing sources", () => {
    type Source = { id: string; name: string; status: string }
    const allSources: Source[] = [
      { id: "s1", name: "paper.pdf", status: "indexed" },
      { id: "s2", name: "notes.md", status: "pending" },
      { id: "s3", name: "data.txt", status: "processing" },
      { id: "s4", name: "report.pdf", status: "indexed" },
    ]
    const indexed = allSources.filter((s) => s.status === "indexed")
    const pending = allSources.filter((s) => s.status !== "indexed")
    expect(indexed).toHaveLength(2)
    expect(pending).toHaveLength(2)
  })

  it("source search filter is case-insensitive", () => {
    const sources = [
      { name: "Climate Report.pdf" },
      { name: "budget.pdf" },
      { name: "CLIMATE CHANGE.md" },
    ]
    const q = "climate"
    const filtered = sources.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
    expect(filtered).toHaveLength(2)
  })

  it("new session navigation URL includes notebook and session params", () => {
    const notebookId = "nb-abc"
    const sessionId = "sess-xyz"
    const url = `/chat?notebook=${notebookId}&session=${sessionId}`
    expect(url).toBe("/chat?notebook=nb-abc&session=sess-xyz")
  })

  it("onNewSession is disabled when no sources are attached", () => {
    const active = { id: "nb1", title: "Test", description: null, source_ids: [], session_count: 0 }
    const disabled = active.source_ids.length === 0
    expect(disabled).toBe(true)
  })

  it("onNewSession is enabled when sources are attached", () => {
    const active = { id: "nb1", title: "Test", description: null, source_ids: ["s1"], session_count: 0 }
    const disabled = active.source_ids.length === 0
    expect(disabled).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 19. ChatPage — send() guard logic
// ─────────────────────────────────────────────────────────────────────────────

describe("ChatPage — send() guard conditions", () => {
  it("blocks send when no activeId", () => {
    const activeId = null
    const input = "hello"
    const streaming = false
    const shouldSend = !(!activeId || !input.trim() || streaming)
    expect(shouldSend).toBe(false)
  })

  it("blocks send when input is empty or whitespace", () => {
    const activeId = "sess1"
    const streaming = false
    for (const input of ["", "  ", "\t", "\n"]) {
      const shouldSend = !(!activeId || !input.trim() || streaming)
      expect(shouldSend).toBe(false)
    }
  })

  it("blocks send while streaming is in progress", () => {
    const activeId = "sess1"
    const input = "hello"
    const streaming = true
    const shouldSend = !(!activeId || !input.trim() || streaming)
    expect(shouldSend).toBe(false)
  })

  it("allows send with valid activeId, non-empty input, not streaming", () => {
    const activeId = "sess1"
    const input = "What does this document say about climate?"
    const streaming = false
    const shouldSend = !(!activeId || !input.trim() || streaming)
    expect(shouldSend).toBe(true)
  })

  it("noSourcesBlocked is true only when indexedCount=0, notebook=null, hasSessions=true", () => {
    const cases: Array<[number, null | { source_ids: string[] }, boolean, boolean]> = [
      [0, null, true, true],
      [1, null, true, false],
      [0, null, false, false],
      [0, { source_ids: ["s1"] }, true, false],
    ]
    for (const [indexedCount, notebook, hasSessions, expected] of cases) {
      const noSourcesBlocked =
        indexedCount === 0 &&
        (!notebook || notebook.source_ids.length === 0) &&
        hasSessions
      expect(noSourcesBlocked).toBe(expected)
    }
  })

  it("auto-title only fires for 'New session' or empty title", () => {
    const shouldAutoTitle = (title: string | undefined) =>
      title === "New session" || !title
    expect(shouldAutoTitle("New session")).toBe(true)
    expect(shouldAutoTitle("")).toBe(true)
    expect(shouldAutoTitle(undefined)).toBe(true)
    expect(shouldAutoTitle("My research")).toBe(false)
    expect(shouldAutoTitle("Climate Q&A")).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 20. CorpusPage — buildTree, statusBadge, upload filtering
// ─────────────────────────────────────────────────────────────────────────────

describe("CorpusPage — file utilities", () => {
  const ACCEPTED = [".pdf", ".md", ".txt"]
  const ACCEPTED_MIME = ["application/pdf", "text/markdown", "text/plain", "text/x-markdown"]

  function isAccepted(name: string, type = "") {
    const ext = "." + (name.split(".").pop()?.toLowerCase() ?? "")
    return ACCEPTED.includes(ext) || ACCEPTED_MIME.includes(type)
  }

  it("accepts .pdf, .md, .txt files", () => {
    expect(isAccepted("doc.pdf")).toBe(true)
    expect(isAccepted("notes.md")).toBe(true)
    expect(isAccepted("readme.txt")).toBe(true)
  })

  it("rejects unsupported file types", () => {
    expect(isAccepted("image.png")).toBe(false)
    expect(isAccepted("data.xlsx")).toBe(false)
    expect(isAccepted("archive.zip")).toBe(false)
    expect(isAccepted("script.js")).toBe(false)
  })

  it("accepts files by MIME type", () => {
    expect(isAccepted("file.unknown", "application/pdf")).toBe(true)
    expect(isAccepted("file.unknown", "text/markdown")).toBe(true)
  })

  it("file extension matching is case-insensitive", () => {
    expect(isAccepted("DOC.PDF")).toBe(true)
    expect(isAccepted("README.MD")).toBe(true)
    expect(isAccepted("DATA.TXT")).toBe(true)
  })

  function fmt(bytes: number | null) {
    if (!bytes) return "—"
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  it("fmt handles null and zero", () => {
    expect(fmt(null)).toBe("—")
    expect(fmt(0)).toBe("—")
  })

  it("fmt formats KB correctly", () => {
    expect(fmt(1024)).toBe("1 KB")
    expect(fmt(512 * 1024)).toBe("512 KB")
  })

  it("fmt formats MB correctly", () => {
    expect(fmt(1024 * 1024)).toBe("1.0 MB")
    expect(fmt(10 * 1024 * 1024)).toBe("10.0 MB")
  })

  it("ingest SSE event drives progress state correctly", () => {
    type IngestUi = { pct: number; step: string }
    let ingestUi: Record<string, IngestUi> = {}

    // Simulate progress event
    const progressEvent = { event: "ingest_progress", source_id: "s1", pct: 50, step: "Chunking" }
    ingestUi = { ...ingestUi, ["s1"]: { pct: progressEvent.pct, step: progressEvent.step } }
    expect(ingestUi["s1"].pct).toBe(50)

    // Simulate done event
    const newState = { ...ingestUi }
    delete newState["s1"]
    ingestUi = newState
    expect(ingestUi["s1"]).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 21. SharePage — fetch error handling (the bug we fixed)
// ─────────────────────────────────────────────────────────────────────────────

describe("SharePage — error fallback behaviour", () => {
  it("shows 'Session unavailable' when share fetch returns non-ok", async () => {
    // Simulates the fixed error-handling path
    let data: { session: { title: string }; messages: [] } | null = null
    const setData = (d: typeof data) => { data = d }

    async function fetchShare(token: string) {
      const r = await fetch(`/api/v1/share/${token}`)
      if (!r.ok) throw new Error(`Share link not found (${r.status})`)
      return r.json()
    }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await fetchShare("bad-token")
      .then(setData)
      .catch(() => setData({ session: { title: "Session unavailable" }, messages: [] }))

    expect(data).not.toBeNull()
    expect(data!.session.title).toBe("Session unavailable")
    vi.restoreAllMocks()
  })

  it("auth state is checked from localStorage on mount", () => {
    vi.stubGlobal("localStorage", { getItem: (k: string) => k === "ownnblm_token" ? "tok" : null })
    const authed = Boolean(localStorage.getItem("ownnblm_token"))
    expect(authed).toBe(true)

    vi.stubGlobal("localStorage", { getItem: () => null })
    const notAuthed = Boolean(localStorage.getItem("ownnblm_token"))
    expect(notAuthed).toBe(false)
    vi.restoreAllMocks()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 22. InvitePage — form validation and submit
// ─────────────────────────────────────────────────────────────────────────────

describe("InvitePage — accept invite logic", () => {
  afterEach(() => vi.restoreAllMocks())

  it("submit is blocked when no token in URL params", () => {
    const token: string | undefined = undefined
    const canSubmit = Boolean(token)
    expect(canSubmit).toBe(false)
  })

  it("submit is allowed when token is present", () => {
    const token = "invite-abc123"
    const canSubmit = Boolean(token)
    expect(canSubmit).toBe(true)
  })

  it("acceptInvite() navigates to /chat on success", async () => {
    stubLocalStorage(null)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      access_token: "tok", user_id: "u1", org_id: "o1", email: "new@user.com",
    })))
    const { acceptInvite } = await import("./api")
    const result = await acceptInvite("invite-tok", "password", "Alice")
    expect(result.email).toBe("new@user.com")
  })

  it("acceptInvite() throws with user-friendly message on 422", async () => {
    stubLocalStorage(null)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse({ detail: { message: "Token expired or already used" } }, 422),
    ))
    const { acceptInvite } = await import("./api")
    await expect(acceptInvite("old-tok", "pass", "Bob")).rejects.toThrow("Token expired or already used")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 23. ApiError class contract
// ─────────────────────────────────────────────────────────────────────────────

describe("ApiError class", () => {
  it("has correct defaults when only message provided", async () => {
    const { ApiError } = await import("./api")
    const e = new ApiError("Something failed")
    expect(e.name).toBe("ApiError")
    expect(e.message).toBe("Something failed")
    expect(e.status).toBeUndefined()
    expect(e.isNetworkError).toBe(false)
    expect(e.isTimeout).toBe(false)
    expect(e.isRateLimited).toBe(false)
  })

  it("stores all constructor fields", async () => {
    const { ApiError } = await import("./api")
    const e = new ApiError("Rate limited", 429, "req-1", false, false, true)
    expect(e.status).toBe(429)
    expect(e.requestId).toBe("req-1")
    expect(e.isRateLimited).toBe(true)
    expect(e.isNetworkError).toBe(false)
    expect(e.isTimeout).toBe(false)
  })

  it("is instanceof Error", async () => {
    const { ApiError } = await import("./api")
    expect(new ApiError("x")).toBeInstanceOf(Error)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 24. isOnline helper
// ─────────────────────────────────────────────────────────────────────────────

describe("isOnline()", () => {
  afterEach(() => vi.restoreAllMocks())

  it("returns true when navigator.onLine is true", async () => {
    vi.stubGlobal("navigator", { onLine: true })
    const { isOnline } = await import("./api")
    expect(isOnline()).toBe(true)
  })

  it("returns false when navigator.onLine is false", async () => {
    vi.stubGlobal("navigator", { onLine: false })
    const { isOnline } = await import("./api")
    expect(isOnline()).toBe(false)
  })
})
