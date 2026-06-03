import { lazy, Suspense, useEffect, useState } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { AppShell } from "@/layouts/AppShell"

const BillingPage = lazy(() =>
  import("@/pages/BillingPage").then((m) => ({ default: m.BillingPage })),
)
const ChatPage = lazy(() => import("@/pages/ChatPage").then((m) => ({ default: m.ChatPage })))
const CorpusPage = lazy(() =>
  import("@/pages/CorpusPage").then((m) => ({ default: m.CorpusPage })),
)
const LoginPage = lazy(() =>
  import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })),
)
const SharePage = lazy(() =>
  import("@/pages/SharePage").then((m) => ({ default: m.SharePage })),
)

function PageFallback() {
  return (
    <div className="flex flex-1 items-center justify-center p-12 text-sm text-muted-foreground">
      Loading…
    </div>
  )
}

function Protected({ children }: { children: React.ReactNode }) {
  const authed = localStorage.getItem("ownnblm_token") || import.meta.env.DEV
  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const [theme, setTheme] = useState<"dark" | "light">("dark")

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light")
  }, [theme])

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route
          path="/login"
          element={<LoginPage onLogin={() => (window.location.href = "/chat")} />}
        />
        <Route path="/share/:token" element={<SharePage />} />
        <Route
          path="/*"
          element={
            <Protected>
              <AppShell>
                <div className="flex items-center gap-4 border-b border-border px-4 py-2 text-xs">
                  <nav className="flex gap-3">
                    <a href="/corpus" className="cursor-pointer text-muted-foreground transition-colors duration-200 hover:text-foreground">
                      Corpus
                    </a>
                    <a href="/chat" className="cursor-pointer text-muted-foreground transition-colors duration-200 hover:text-foreground">
                      Chat
                    </a>
                    <a href="/billing" className="cursor-pointer text-muted-foreground transition-colors duration-200 hover:text-foreground">
                      Billing
                    </a>
                  </nav>
                  <button
                    type="button"
                    className="ml-auto cursor-pointer text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                  >
                    {theme === "dark" ? "Light" : "Dark"}
                  </button>
                </div>
                <Suspense fallback={<PageFallback />}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/chat" replace />} />
                    <Route path="/corpus" element={<CorpusPage />} />
                    <Route path="/chat" element={<ChatPage />} />
                    <Route path="/billing" element={<BillingPage />} />
                  </Routes>
                </Suspense>
              </AppShell>
            </Protected>
          }
        />
      </Routes>
    </Suspense>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
