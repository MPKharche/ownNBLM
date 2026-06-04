import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { loginWithGoogle, requestMagicLink, verifyMagicLink } from "@/lib/api"

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

type Props = React.ComponentProps<"div"> & {
  onLogin: (email: string, password: string) => Promise<void>
  onRegister: (email: string, password: string) => Promise<void>
  onSuccess: () => void
}

export function LoginForm({ className, onLogin, onRegister, onSuccess, ...props }: Props) {
  const [mode, setMode] = useState<"login" | "register" | "magic">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState<string | null>(null)
  const googleBtnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const magicToken = params.get("magic_token")
    if (magicToken) {
      setBusy(true)
      verifyMagicLink(magicToken)
        .then(onSuccess)
        .catch((err) => setError(err instanceof Error ? err.message : "Magic link failed"))
        .finally(() => setBusy(false))
    }
  }, [onSuccess])

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleBtnRef.current) return
    const scriptId = "google-gsi"
    const renderButton = () => {
      const g = (window as unknown as { google?: { accounts: { id: unknown } } }).google
      if (!g?.accounts?.id || !googleBtnRef.current) return
      const idApi = g.accounts.id as {
        initialize: (cfg: object) => void
        renderButton: (el: HTMLElement, cfg: object) => void
      }
      idApi.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (res: { credential: string }) => {
          setBusy(true)
          setError(null)
          try {
            await loginWithGoogle(res.credential)
            onSuccess()
          } catch (err) {
            setError(err instanceof Error ? err.message : "Google sign-in failed")
          } finally {
            setBusy(false)
          }
        },
      })
      googleBtnRef.current.innerHTML = ""
      idApi.renderButton(googleBtnRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        width: 320,
      })
    }
    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script")
      s.id = scriptId
      s.src = "https://accounts.google.com/gsi/client"
      s.async = true
      s.onload = renderButton
      document.body.appendChild(s)
    } else {
      renderButton()
    }
  }, [onSuccess])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === "magic") {
        const res = await requestMagicLink(email)
        setMagicSent(res.magic_link_url ?? "Check your email for a sign-in link.")
        return
      }
      if (mode === "login") await onLogin(email, password)
      else await onRegister(email, password)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {GOOGLE_CLIENT_ID && (
        <div ref={googleBtnRef} className="flex justify-center min-h-10" />
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "login"
              ? "Login to your account"
              : mode === "register"
                ? "Create an account"
                : "Magic link"}
          </CardTitle>
          <CardDescription>
            {mode === "login"
              ? "Email and password"
              : mode === "register"
                ? "Sign up with email"
                : "We'll email you a one-time sign-in link"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </Field>
              {mode !== "magic" && (
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                  />
                </Field>
              )}
              {magicSent && (
                <p className="text-sm text-muted-foreground break-all">{magicSent}</p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Field>
                <Button type="submit" className="cursor-pointer" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : mode === "login"
                      ? "Sign in"
                      : mode === "register"
                        ? "Create account"
                        : "Send magic link"}
                </Button>
                <FieldDescription className="text-center space-y-1">
                  {mode === "login" && (
                    <>
                      <button
                        type="button"
                        className="block w-full cursor-pointer underline-offset-4 hover:underline"
                        onClick={() => setMode("magic")}
                      >
                        Sign in with magic link
                      </button>
                      <button
                        type="button"
                        className="block w-full cursor-pointer underline-offset-4 hover:underline"
                        onClick={() => setMode("register")}
                      >
                        Create account
                      </button>
                    </>
                  )}
                  {mode === "register" && (
                    <button
                      type="button"
                      className="cursor-pointer underline-offset-4 hover:underline"
                      onClick={() => setMode("login")}
                    >
                      Already have an account? Login
                    </button>
                  )}
                  {mode === "magic" && (
                    <button
                      type="button"
                      className="cursor-pointer underline-offset-4 hover:underline"
                      onClick={() => {
                        setMode("login")
                        setMagicSent(null)
                      }}
                    >
                      Back to password login
                    </button>
                  )}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
