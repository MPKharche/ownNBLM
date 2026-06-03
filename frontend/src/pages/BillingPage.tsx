import { useEffect, useState } from "react"

import { api, startCheckout, type Usage } from "@/lib/api"
import { Button } from "@/components/ui/button"

type Plan = { id: string; price: number; queries: number; storage_gb: number }

export function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [usage, setUsage] = useState<Usage | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    api<{ plans: Plan[] }>("/api/v1/billing/plans").then((r) => setPlans(r.plans))
    api<Usage>("/api/v1/usage/dashboard").then(setUsage)
  }, [])

  async function upgrade(planId: string) {
    setBusy(planId)
    setMsg(null)
    try {
      const { checkout_url } = await startCheckout(planId)
      window.location.href = checkout_url
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upgrade unavailable")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {usage && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-heading text-lg font-medium">Usage</h2>
          <p className="mt-2 text-sm">
            Queries: {usage.queries_used} / {usage.query_limit} ({usage.usage_percent}%)
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/30">
            <div
              className="progress-bar-fill h-full bg-primary"
              style={{ width: `${Math.min(usage.usage_percent, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Storage: {(usage.storage_bytes / 1e6).toFixed(1)} MB /{" "}
            {(usage.storage_limit_bytes / 1e9).toFixed(1)} GB · Plan: {usage.tier}
          </p>
        </div>
      )}

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((p) => (
          <div key={p.id} className="rounded-xl border border-border p-4">
            <h3 className="font-heading capitalize">{p.id}</h3>
            <p className="text-2xl font-semibold">${p.price}/mo</p>
            <p className="text-sm text-muted-foreground">
              {p.queries} queries · {p.storage_gb} GB
            </p>
            {p.id !== "free" && (
              <Button
                type="button"
                className="mt-3 cursor-pointer"
                variant="outline"
                size="sm"
                disabled={busy === p.id}
                onClick={() => upgrade(p.id)}
              >
                {busy === p.id ? "Redirecting…" : "Upgrade"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
