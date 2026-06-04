"""Stripe billing — subscriptions + metered overage."""

from __future__ import annotations

from decimal import Decimal

import structlog

from app.core.config import get_settings

logger = structlog.get_logger()


def stripe_enabled() -> bool:
    return bool(get_settings().stripe_secret_key)


def create_checkout_session(org_id: str, price_id: str, customer_email: str) -> str | None:
    if not stripe_enabled():
        return None
    import stripe  # noqa: PLC0415

    settings = get_settings()
    stripe.api_key = settings.stripe_secret_key
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{settings.frontend_url}/billing?success=1",
        cancel_url=f"{settings.frontend_url}/billing?canceled=1",
        customer_email=customer_email,
        metadata={"org_id": org_id},
    )
    return session.url


def create_customer_portal_session(db, org, customer_email: str) -> str | None:
    if not stripe_enabled():
        return None
    import stripe  # noqa: PLC0415

    from app.core.config import get_settings

    settings = get_settings()
    stripe.api_key = settings.stripe_secret_key
    customer_id = org.stripe_customer_id
    if not customer_id:
        customer = stripe.Customer.create(email=customer_email, metadata={"org_id": org.id})
        org.stripe_customer_id = customer.id
        db.commit()
        customer_id = customer.id
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{settings.frontend_url}/admin",
    )
    return session.url


def record_metered_usage(org_id: str, quantity: Decimal) -> None:
    if not stripe_enabled():
        logger.info("stripe_metered_skipped", org_id=org_id, quantity=str(quantity))
        return
    # Stripe Usage Records API wired when subscription items exist
    logger.info("stripe_metered_record", org_id=org_id, quantity=str(quantity))
