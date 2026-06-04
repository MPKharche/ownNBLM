# Resume production — checklist

Production is **paused** (Vercel maintenance page, VPS API stopped). Use this list when you are ready to go live again.

## What is Resend? (optional — you can skip)

[Resend](https://resend.com) is a **transactional email API** (like SendGrid). ownNBLM uses it only to:

- Send **magic link** login emails (“Email me a link” on the login page)
- Send optional **weekly digest** emails to team workspaces

It is **not** required for normal login. Use **email + password** (`admin@ownnblm.local` / `admin123` after seed) or **Google sign-in** if `VITE_GOOGLE_CLIENT_ID` is set. Without Resend, the magic-link button will respond with `sent: false` in production — that is expected.

## Can resume now (no Razorpay, no Resend)

| Step | Command / action |
|------|------------------|
| 1. Ship code | Merge/commit hardening branch to `main`, `git pull` on VPS |
| 2. Migrate Postgres | `powershell -File scripts/migrate.ps1` locally; on VPS: `bash scripts/vps_migrate.sh` (or included in `vps_restart_api.sh`) |
| 3. Email (optional) | **Resend** (`RESEND_API_KEY`) only for “Email me a login link” + weekly digest. Skip if you use **password** or **Google** login — see below |
| 4. Restore Vercel app | `Copy-Item vercel.app.json vercel.json` then `cd frontend && npx vercel deploy --prod` |
| 5. Start API | `bash scripts/vps_restart_api.sh` on VPS |
| 6. Smoke test | `powershell -File scripts/e2e_prod_smoke.ps1` |

## Pending — Razorpay (registration in progress)

Do **not** block app resume on billing. Without keys, checkout returns 503 and free tier still works.

When Razorpay account is active:

1. Dashboard → API keys (test, then live).
2. Webhook: `https://<your-api-host>/api/v1/billing/webhooks/razorpay`  
   Events: `payment_link.paid`, `subscription.activated`, `subscription.charged`, `subscription.cancelled`
3. VPS `.env`:

```env
PAYMENT_PROVIDER=razorpay
BILLING_CURRENCY=INR
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

Details: [BILLING_RAZORPAY.md](./BILLING_RAZORPAY.md)

## Optional later

- Stripe: only if you open a non-India Stripe account (`PAYMENT_PROVIDER=stripe`).
- Dedicated Business stacks: `PORTAINER_URL`, `PORTAINER_API_KEY` — run `scripts/validate_provisioner.ps1`.

## Quick unpause (reference)

```powershell
powershell -File scripts/unpause_prod.ps1
```

That script prints the exact copy/deploy/ssh steps; it does not auto-enable billing or Razorpay.
