"""Razorpay — subscriptions & payment links (India merchant, international cards)."""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

import httpx
import structlog

from app.core.config import get_settings
from app.models.org import Org
from app.services.audit import log_audit
from app.services.payments.base import PaymentProvider

logger = structlog.get_logger()

PLAN_AMOUNTS_INR: dict[str, int] = {
    "personal": 99900,
    "team": 249900,
    "business": 649900,
}


class RazorpayProvider(PaymentProvider):
    name = "razorpay"

    def _auth(self) -> tuple[str, str]:
        s = get_settings()
        return s.razorpay_key_id, s.razorpay_key_secret

    def _plan_id(self, plan: str) -> str | None:
        s = get_settings()
        return {
            "personal": s.razorpay_plan_personal,
            "team": s.razorpay_plan_team,
            "business": s.razorpay_plan_business,
        }.get(plan) or None

    def create_checkout(self, *, org_id: str, plan: str, email: str, org_name: str) -> str:
        settings = get_settings()
        key_id, key_secret = self._auth()
        plan_id = self._plan_id(plan)
        callback = f"{settings.frontend_url}/billing?success=1&plan={plan}"

        with httpx.Client(timeout=30.0) as client:
            if plan_id:
                sub_body = {
                    "plan_id": plan_id,
                    "total_count": 120,
                    "quantity": 1,
                    "customer_notify": 1,
                    "notes": {"org_id": org_id, "plan": plan},
                }
                resp = client.post(
                    "https://api.razorpay.com/v1/subscriptions",
                    auth=(key_id, key_secret),
                    json=sub_body,
                )
                resp.raise_for_status()
                data = resp.json()
                url = data.get("short_url") or data.get("auth_link")
                if url:
                    return url

            amount = PLAN_AMOUNTS_INR.get(plan)
            if not amount:
                raise ValueError(f"Unknown plan: {plan}")
            link_body = {
                "amount": amount,
                "currency": settings.billing_currency,
                "accept_partial": False,
                "description": f"ownNBLM {plan} plan",
                "customer": {"name": org_name[:50], "email": email},
                "notify": {"email": True},
                "notes": {"org_id": org_id, "plan": plan},
                "callback_url": callback,
                "callback_method": "get",
            }
            resp = client.post(
                "https://api.razorpay.com/v1/payment_links",
                auth=(key_id, key_secret),
                json=link_body,
            )
            resp.raise_for_status()
            return resp.json()["short_url"]

    def create_portal_url(self, *, org_id: str, email: str, subscription_id: str | None) -> str | None:
        settings = get_settings()
        if subscription_id:
            return f"{settings.frontend_url}/billing?manage=1"
        return f"{settings.frontend_url}/billing"

    def verify_webhook(self, body: bytes, signature: str) -> dict[str, Any]:
        secret = get_settings().razorpay_webhook_secret
        if not secret:
            raise ValueError("RAZORPAY_WEBHOOK_SECRET not configured")
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise ValueError("Invalid Razorpay webhook signature")
        return json.loads(body)

    def handle_webhook_event(self, db, event: dict[str, Any]) -> None:
        etype = event.get("event", "")
        payload = event.get("payload", {})
        plan = None
        org_id = None
        sub_id = None

        if etype == "payment_link.paid":
            entity = payload.get("payment_link", {}).get("entity", {})
            notes = entity.get("notes") or {}
            org_id = notes.get("org_id")
            plan = notes.get("plan")
        elif etype in ("subscription.activated", "subscription.charged"):
            entity = payload.get("subscription", {}).get("entity", {})
            notes = entity.get("notes") or {}
            org_id = notes.get("org_id")
            plan = notes.get("plan")
            sub_id = entity.get("id")
        elif etype == "subscription.cancelled":
            entity = payload.get("subscription", {}).get("entity", {})
            notes = entity.get("notes") or {}
            org_id = notes.get("org_id")
            plan = "free"
            sub_id = None

        if not org_id:
            logger.warning("razorpay_webhook_no_org", event=etype)
            return

        org = db.get(Org, org_id)
        if org is None:
            return

        if plan and plan in ("personal", "team", "business", "free"):
            org.tier = plan if plan != "free" else "free"
        org.payment_provider = "razorpay"
        if sub_id:
            org.payment_subscription_id = sub_id
        db.commit()
        log_audit(
            db,
            org_id=org_id,
            action="billing.webhook",
            resource_type="org",
            resource_id=org_id,
            metadata={"event": etype, "plan": plan},
        )
        logger.info("razorpay_webhook_applied", org_id=org_id, plan=plan, event=etype)
