import { useSearchParams } from "react-router-dom"
import { LoginForm } from "@/components/login-form"
import { login, register } from "@/lib/api"

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [searchParams] = useSearchParams()
  const reason = searchParams.get("reason")

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">ownNBLM</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Research-grade knowledge assistant
          </p>
        </div>

        {reason === "session_expired" && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-400">
            Your session expired — please sign in again.
          </div>
        )}

        <LoginForm
          onLogin={async (email, password) => {
            await login(email, password)
          }}
          onRegister={async (email, password) => {
            await register(email, password)
          }}
          onSuccess={onLogin}
        />
      </div>
    </div>
  )
}

