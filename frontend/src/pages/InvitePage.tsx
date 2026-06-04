import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { acceptInvite } from "@/lib/api"

export function InvitePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      await acceptInvite(token, password, name)
      navigate("/chat")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invite")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join workspace</CardTitle>
          <CardDescription>Accept your invitation to ownNBLM</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Input
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Password (new members)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full cursor-pointer" disabled={busy}>
              {busy ? "Joining…" : "Join workspace"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
