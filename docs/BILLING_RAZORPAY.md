# Billing — Razorpay (India + global cards)

**Status:** Razorpay merchant registration **in progress** — leave `RAZORPAY_*` unset until approved. App and free tier work without billing keys; paid checkout returns 503 until configured.

ownNBLM uses **Razorpay** by default. Stripe remains optional for non-India merchants.

## Why Razorpay

- Works for **Indian businesses** (Stripe is limited for many India-only entities).
- Accepts **international cards** on INR settlements.
- Subscriptions, payment links, and webhooks.

## Setup (test mode)

1. Create account at [https://dashboard.razorpay.com](https://dashboard.razorpay.com).
2. **Settings → API Keys** — copy Key ID and Key Secret (test).
3. **Settings → Webhooks** — add endpoint:
   `https://YOUR_API_HOST/api/v1/billing/webhooks/razorpay`
   Events: `payment_link.paid`, `subscription.activated`, `subscription.charged`, `subscription.cancelled`
4. Copy webhook secret into `.env`.

## Environment

```env
PAYMENT_PROVIDER=razorpay
BILLING_CURRENCY=INR
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

# Optional: pre-created subscription plan IDs (dashboard → Subscriptions → Plans)
RAZORPAY_PLAN_PERSONAL=plan_...
RAZORPAY_PLAN_TEAM=plan_...
RAZORPAY_PLAN_BUSINESS=plan_...
```

If plan IDs are omitted, checkout uses **payment links** with fixed INR amounts (₹999 / ₹2,499 / ₹6,499).

## Email (magic link + digest)

```env
RESEND_API_KEY=re_...
DIGEST_FROM_EMAIL=ownNBLM <billing@yourdomain.com>
```

## Stripe (optional)

Set `PAYMENT_PROVIDER=stripe` and Stripe keys only if you have a Stripe account.
