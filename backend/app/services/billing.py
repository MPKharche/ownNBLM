"""Billing helpers — payment providers live in app.services.payments."""

from __future__ import annotations

from decimal import Decimal

import structlog

from app.services.payments import billing_enabled, get_payment_provider

logger = structlog.get_logger()

stripe_enabled = billing_enabled  # backwards compat for imports


def create_checkout_session(org_id: str, price_id: str, customer_email: str) -> str | None:
    del price_id
    provider = get_payment_provider()
    if provider is None:
        return None
    return provider.create_checkout(
        org_id=org_id, plan="personal", email=customer_email, org_name="Workspace"
    )


def create_customer_portal_session(db, org, customer_email: str) -> str | None:
    provider = get_payment_provider()
    if provider is None:
        return None
    return provider.create_portal_url(
        org_id=org.id,
        email=customer_email,
        subscription_id=getattr(org, "payment_subscription_id", None),
    )


def record_metered_usage(org_id: str, quantity: Decimal) -> None:
    logger.info("metered_usage", org_id=org_id, quantity=str(quantity))
