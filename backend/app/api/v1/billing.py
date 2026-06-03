from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.services.billing import create_checkout_session, stripe_enabled

router = APIRouter()


class CheckoutRequest(BaseModel):
    plan: str  # personal | team | business


@router.get("/plans")
def list_plans():
    return {
        "plans": [
            {"id": "free", "price": 0, "queries": 30, "storage_gb": 1},
            {"id": "personal", "price": 12, "queries": 500, "storage_gb": 10},
            {"id": "team", "price": 29, "queries": 2000, "storage_gb": 50},
            {"id": "business", "price": 79, "queries": 10000, "storage_gb": 200},
        ]
    }


@router.post("/checkout")
def checkout(body: CheckoutRequest, db: DbSession, user: CurrentUser):
    settings = get_settings()
    price_map = {
        "personal": settings.stripe_price_personal,
        "team": settings.stripe_price_team,
        "business": settings.stripe_price_business,
    }
    price_id = price_map.get(body.plan, "")
    if not price_id or not stripe_enabled():
        raise HTTPException(
            status_code=503,
            detail="Stripe not configured — set STRIPE_SECRET_KEY and price IDs in .env",
        )
    url = create_checkout_session(user.org_id, price_id, user.email)
    if not url:
        raise HTTPException(status_code=500, detail="Could not create checkout session")
    return {"checkout_url": url}
