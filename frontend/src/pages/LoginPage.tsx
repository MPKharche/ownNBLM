import { LoginForm } from "@/components/login-form"
import { login, register } from "@/lib/api"

const DEV_EMAIL = "admin@ownnblm.local"
const DEV_PASSWORD = "admin123"

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  async function devLogin() {
    try {
      await login(DEV_EMAIL, DEV_PASSWORD)
    } catch {
      /* dev header fallback when seed user missing */
    }
    onLogin()
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">ownNBLM</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Research-grade knowledge assistant
          </p>
        </div>
        <LoginForm
          onLogin={async (email, password) => {
            await login(email, password)
            onLogin()
          }}
          onRegister={async (email, password) => {
            await register(email, password)
            onLogin()
          }}
        />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Dev seed: {DEV_EMAIL} / {DEV_PASSWORD}
        </p>
        <button
          type="button"
          onClick={devLogin}
          className="mt-4 w-full cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Continue as admin (dev)
        </button>
      </div>
    </div>
  )
}
