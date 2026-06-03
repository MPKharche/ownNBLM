from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.models.org import Org
from app.services.credits import get_or_create_usage, usage_percent
from app.services.llm_burn import burn_status

router = APIRouter()


class UsageOut(BaseModel):
    queries_used: int
    query_limit: int
    queries_remaining: int
    usage_percent: int
    storage_bytes: int
    storage_limit_bytes: int
    tier: str
    llm_burn_enabled: bool
    llm_budget_usd: str | None
    llm_spent_usd: str | None
    llm_remaining_usd: str | None
    llm_burn_percent: int


@router.get("/dashboard", response_model=UsageOut)
def usage_dashboard(db: DbSession, user: CurrentUser):
    settings = get_settings()
    org = db.get(Org, user.org_id)
    tier = org.tier if org else "free"
    usage = get_or_create_usage(db, user.org_id)
    burn = burn_status(db, user.org_id)
    return UsageOut(
        queries_used=usage.queries_used,
        query_limit=usage.query_limit,
        queries_remaining=max(0, usage.query_limit - usage.queries_used),
        usage_percent=usage_percent(usage),
        storage_bytes=usage.storage_bytes,
        storage_limit_bytes=settings.storage_limit_for_tier(tier),
        tier=tier,
        llm_burn_enabled=burn["enabled"],
        llm_budget_usd=burn["budget_usd"],
        llm_spent_usd=burn["spent_usd"],
        llm_remaining_usd=burn["remaining_usd"],
        llm_burn_percent=burn["usage_percent"],
    )
