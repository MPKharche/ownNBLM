import { lazy, Suspense, useEffect, useState } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { AppShell } from "@/layouts/AppShell"

const BillingPage = lazy(() =>
  import("@/pages/BillingPage").then((m) => ({ default: m.BillingPage })),
)
const AdminPage = lazy(() =>
  import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage })),
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
const InvitePage = lazy(() =>
  import("@/pages/InvitePage").then((m) => ({ default: m.InvitePage })),
)

function PageFallback() {
  return (
    <div className="flex flex-1 items-center justify-center p-12 text-sm text-muted-foreground">
      Loading…
    </div>
  )
}

function Protected({ children }: { children: React.ReactNode }) {
  const authed = Boolean(localStorage.getItem("ownnblm_token"))
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
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route
          path="/*"
          element={
            <Protected>
              <AppShell
                theme={theme}
                onThemeToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              >
                <Suspense fallback={<PageFallback />}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/chat" replace />} />
                    <Route path="/corpus" element={<CorpusPage />} />
                    <Route path="/chat" element={<ChatPage />} />
                    <Route path="/billing" element={<BillingPage />} />
                    <Route path="/admin" element={<AdminPage />} />
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
