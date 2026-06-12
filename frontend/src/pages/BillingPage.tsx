import { useEffect, useState } from "react"

import { api, startCheckout, type Usage } from "@/lib/api"
import { Button } from "@/components/ui/button"

type Plan = {
  id: string
  price: number
  price_display?: string
  queries: number
  storage_gb: number
}

// F5: color-code progress bars by utilization
function barColor(pct: number) {
  if (pct >= 90) return "bg-red-500"
  if (pct >= 70) return "bg-amber-500"
  return "bg-primary"
}

function UsageBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/30">
      <div
        className={`progress-bar-fill h-full transition-all ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  )
}

export function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [usage, setUsage] = useState<Usage | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [provider, setProvider] = useState<string | null>(null)

  useEffect(() => {
    api<{ plans: Plan[] }>("/api/v1/billing/plans").then((r) => setPlans(r.plans))
    api<Usage>("/api/v1/usage/dashboard").then(setUsage)
    api<{ provider: string | null; enabled: boolean }>("/api/v1/billing/provider").then((r) =>
      setProvider(r.enabled ? r.provider : null),
    )
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
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-medium">Usage</h2>
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground capitalize">
              {usage.tier} plan
            </span>
          </div>

          {/* F5: Queries — prominent remaining callout */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Queries</span>
              {/* Big remaining number */}
              <span className={`text-lg font-semibold tabular-nums ${usage.usage_percent >= 90 ? "text-red-400" : usage.usage_percent >= 70 ? "text-amber-400" : "text-primary"}`}>
                {usage.queries_remaining.toLocaleString()} remaining
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {usage.queries_used.toLocaleString()} of {usage.query_limit.toLocaleString()} used ({usage.usage_percent}%)
            </p>
            <UsageBar pct={usage.usage_percent} color={barColor(usage.usage_percent)} />
          </div>

          {/* F5: Storage — now has a progress bar */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Storage</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {(usage.storage_bytes / 1e6).toFixed(1)} MB / {(usage.storage_limit_bytes / 1e9).toFixed(1)} GB
              </span>
            </div>
            {(() => {
              const storagePct = usage.storage_limit_bytes > 0
                ? Math.round((usage.storage_bytes / usage.storage_limit_bytes) * 100)
                : 0
              return (
                <>
                  <p className="mt-0.5 text-xs text-muted-foreground">{storagePct}% used</p>
                  <UsageBar pct={storagePct} color={barColor(storagePct)} />
                </>
              )
            })()}
          </div>

          {/* LLM burn — shown to all, N/A for non-admin */}
          {usage.llm_burn_enabled && usage.llm_budget_usd ? (
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">AI usage</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  ${usage.llm_spent_usd} of ${usage.llm_budget_usd}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                ${usage.llm_remaining_usd} remaining ({usage.llm_burn_percent}%)
              </p>
              <UsageBar pct={usage.llm_burn_percent} color={barColor(usage.llm_burn_percent)} />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">AI usage budget</span>
                <span className="text-xs text-muted-foreground">N/A (admin-only feature)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {provider && (
        <p className="text-sm text-muted-foreground">
          Payments via {provider === "razorpay" ? "Razorpay" : provider} (India + international cards).
        </p>
      )}
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((p) => (
          <div key={p.id} className="rounded-xl border border-border p-4">
            <h3 className="font-heading capitalize">{p.id}</h3>
            <p className="text-2xl font-semibold">
              {p.price_display ?? `$${p.price}`}/mo
            </p>
            <p className="text-sm text-muted-foreground">
              {p.queries.toLocaleString()} queries · {p.storage_gb} GB storage
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
