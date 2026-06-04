import { LoginForm } from "@/components/login-form"

import { login, register } from "@/lib/api"



export function LoginPage({ onLogin }: { onLogin: () => void }) {

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

