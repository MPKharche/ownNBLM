"""Optional Stripe provider (not required for India-first deploy)."""

from __future__ import annotations

import json
from typing import Any

from app.core.config import get_settings
from app.models.org import Org
from app.services.audit import log_audit
from app.services.payments.base import PaymentProvider


class StripeProvider(PaymentProvider):
    name = "stripe"

    def create_checkout(self, *, org_id: str, plan: str, email: str, org_name: str) -> str:
        import stripe  # noqa: PLC0415

        settings = get_settings()
        stripe.api_key = settings.stripe_secret_key
        price_map = {
            "personal": settings.stripe_price_personal,
            "team": settings.stripe_price_team,
            "business": settings.stripe_price_business,
        }
        price_id = price_map.get(plan, "")
        if not price_id:
            raise ValueError(f"Stripe price not configured for plan: {plan}")
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{settings.frontend_url}/billing?success=1",
            cancel_url=f"{settings.frontend_url}/billing?canceled=1",
            customer_email=email,
            metadata={"org_id": org_id, "plan": plan},
        )
        return session.url or ""

    def create_portal_url(self, *, org_id: str, email: str, subscription_id: str | None) -> str | None:
        import stripe  # noqa: PLC0415

        from app.core.database import SessionLocal

        settings = get_settings()
        stripe.api_key = settings.stripe_secret_key
        with SessionLocal() as db:
            org = db.get(Org, org_id)
            if org is None:
                return None
            customer_id = org.stripe_customer_id
            if not customer_id:
                customer = stripe.Customer.create(email=email, metadata={"org_id": org_id})
                org.stripe_customer_id = customer.id
                org.payment_provider = "stripe"
                db.commit()
                customer_id = customer.id
            session = stripe.billing_portal.Session.create(
                customer=customer_id,
                return_url=f"{settings.frontend_url}/billing",
            )
            return session.url

    def verify_webhook(self, body: bytes, signature: str) -> dict[str, Any]:
        import stripe  # noqa: PLC0415

        settings = get_settings()
        stripe.api_key = settings.stripe_secret_key
        event = stripe.Webhook.construct_event(
            body, signature, settings.stripe_webhook_secret
        )
        return json.loads(json.dumps(event.to_dict()))

    def handle_webhook_event(self, db, event: dict[str, Any]) -> None:
        etype = event.get("type", "")
        data = event.get("data", {}).get("object", {})
        org_id = (data.get("metadata") or {}).get("org_id")
        if etype == "checkout.session.completed":
            plan = (data.get("metadata") or {}).get("plan")
            if org_id and plan:
                org = db.get(Org, org_id)
                if org:
                    org.tier = plan
                    org.payment_provider = "stripe"
                    org.stripe_customer_id = data.get("customer")
                    db.commit()
                    log_audit(
                        db,
                        org_id=org_id,
                        action="billing.webhook",
                        resource_type="org",
                        resource_id=org_id,
                        metadata={"event": etype, "plan": plan},
                    )
