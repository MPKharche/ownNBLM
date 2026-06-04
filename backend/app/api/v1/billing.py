from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.models.org import Org
from app.services.payments import billing_enabled, get_payment_provider

router = APIRouter()


class CheckoutRequest(BaseModel):
    plan: str  # personal | team | business


@router.get("/provider")
def billing_provider():
    provider = get_payment_provider()
    settings = get_settings()
    return {
        "enabled": billing_enabled(),
        "provider": provider.name if provider else None,
        "currency": settings.billing_currency,
        "display_currency": "INR" if settings.billing_currency == "INR" else settings.billing_currency,
        "note": "Razorpay supports Indian and international cards (Stripe optional).",
    }


@router.get("/plans")
def list_plans():
    settings = get_settings()
    if settings.billing_currency == "INR":
        return {
            "plans": [
                {"id": "free", "price": 0, "price_display": "₹0", "queries": 30, "storage_gb": 1},
                {"id": "personal", "price": 999, "price_display": "₹999", "queries": 500, "storage_gb": 10},
                {"id": "team", "price": 2499, "price_display": "₹2,499", "queries": 2000, "storage_gb": 50},
                {"id": "business", "price": 6499, "price_display": "₹6,499", "queries": 10000, "storage_gb": 200},
            ]
        }
    return {
        "plans": [
            {"id": "free", "price": 0, "price_display": "$0", "queries": 30, "storage_gb": 1},
            {"id": "personal", "price": 12, "price_display": "$12", "queries": 500, "storage_gb": 10},
            {"id": "team", "price": 29, "price_display": "$29", "queries": 2000, "storage_gb": 50},
            {"id": "business", "price": 79, "price_display": "$79", "queries": 10000, "storage_gb": 200},
        ]
    }


@router.post("/checkout")
def checkout(body: CheckoutRequest, db: DbSession, user: CurrentUser):
    if body.plan not in ("personal", "team", "business"):
        raise HTTPException(status_code=400, detail="Invalid plan")
    provider = get_payment_provider()
    if provider is None:
        raise HTTPException(
            status_code=503,
            detail="Billing not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env",
        )
    org = db.get(Org, user.org_id)
    if org is None:
        raise HTTPException(status_code=404)
    try:
        url = provider.create_checkout(
            org_id=user.org_id,
            plan=body.plan,
            email=user.email,
            org_name=org.name,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"checkout_url": url, "provider": provider.name}


@router.post("/portal")
def billing_portal(db: DbSession, user: CurrentUser):
    provider = get_payment_provider()
    if provider is None:
        raise HTTPException(status_code=503, detail="Billing not configured")
    org = db.get(Org, user.org_id)
    if org is None:
        raise HTTPException(status_code=404)
    url = provider.create_portal_url(
        org_id=org.id,
        email=user.email,
        subscription_id=org.payment_subscription_id,
    )
    return {"portal_url": url or f"{get_settings().frontend_url}/billing"}


@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request, db: DbSession):
    provider = get_payment_provider()
    if provider is None or provider.name != "razorpay":
        raise HTTPException(status_code=503, detail="Razorpay not configured")
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    try:
        event = provider.verify_webhook(body, signature)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    provider.handle_webhook_event(db, event)
    return {"ok": True}


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, db: DbSession):
    from app.services.payments.stripe_provider import StripeProvider

    settings = get_settings()
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    provider = StripeProvider()
    body = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    try:
        event = provider.verify_webhook(body, signature)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    provider.handle_webhook_event(db, event)
    return {"ok": True}
