import { useEffect, useState } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { AppShell } from "@/layouts/AppShell"
import { BillingPage } from "@/pages/BillingPage"
import { ChatPage } from "@/pages/ChatPage"
import { CorpusPage } from "@/pages/CorpusPage"
import { LoginPage } from "@/pages/LoginPage"
import { SharePage } from "@/pages/SharePage"

function Protected({ children }: { children: React.ReactNode }) {
  const authed =
    localStorage.getItem("ownnblm_token") || import.meta.env.DEV
  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const [theme, setTheme] = useState<"dark" | "light">("dark")

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light")
  }, [theme])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLogin={() => window.location.href = "/chat"} />} />
      <Route path="/share/:token" element={<SharePage />} />
      <Route
        path="/*"
        element={
          <Protected>
            <AppShell>
              <div className="flex items-center gap-4 border-b border-border px-4 py-2 text-xs">
                <nav className="flex gap-3">
                  <a href="/corpus" className="hover:text-foreground text-muted-foreground">
                    Corpus
                  </a>
                  <a href="/chat" className="hover:text-foreground text-muted-foreground">
                    Chat
                  </a>
                  <a href="/billing" className="hover:text-foreground text-muted-foreground">
                    Billing
                  </a>
                </nav>
                <button
                  type="button"
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                >
                  {theme === "dark" ? "Light" : "Dark"}
                </button>
              </div>
              <Routes>
                <Route path="/" element={<Navigate to="/chat" replace />} />
                <Route path="/corpus" element={<CorpusPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/billing" element={<BillingPage />} />
              </Routes>
            </AppShell>
          </Protected>
        }
      />
    </Routes>
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
