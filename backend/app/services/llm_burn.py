"""LLM burn control — rolling USD budget via env (Decimal only)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.llm_spend import LlmSpendEvent

GLOBAL_ORG = "*"


class LLMBurnExceeded(Exception):
    def __init__(self, spent: Decimal, budget: Decimal, window_hours: int):
        self.spent = spent
        self.budget = budget
        self.window_hours = window_hours
        super().__init__(
            f"LLM burn cap reached (${spent} / ${budget} in {window_hours}h). "
            "Try again after the window rolls or raise LLM_BUDGET_USD."
        )


def approx_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def estimate_chat_usd(
    prompt_tokens: int,
    completion_tokens: int,
    *,
    input_per_mtok: Decimal | None = None,
    output_per_mtok: Decimal | None = None,
) -> Decimal:
    settings = get_settings()
    inp = input_per_mtok if input_per_mtok is not None else settings.llm_price_input_per_mtok
    out = output_per_mtok if output_per_mtok is not None else settings.llm_price_output_per_mtok
    cost = (Decimal(prompt_tokens) / Decimal(1_000_000)) * inp
    cost += (Decimal(completion_tokens) / Decimal(1_000_000)) * out
    return cost.quantize(Decimal("0.00000001"))


def estimate_embed_usd(token_count: int, *, per_mtok: Decimal | None = None) -> Decimal:
    settings = get_settings()
    rate = per_mtok if per_mtok is not None else settings.llm_price_embed_per_mtok
    return ((Decimal(token_count) / Decimal(1_000_000)) * rate).quantize(Decimal("0.00000001"))


def _ledger_org_id(org_id: str) -> str:
    settings = get_settings()
    return GLOBAL_ORG if settings.llm_budget_scope == "global" else org_id


def spend_in_window(db: Session, org_id: str) -> Decimal:
    settings = get_settings()
    if not settings.llm_budget_enabled:
        return Decimal("0")
    since = datetime.now(UTC) - timedelta(hours=settings.llm_budget_window_hours)
    ledger = _ledger_org_id(org_id)
    total = db.execute(
        select(func.coalesce(func.sum(LlmSpendEvent.amount_usd), 0)).where(
            LlmSpendEvent.org_id == ledger,
            LlmSpendEvent.created_at >= since,
        )
    ).scalar_one()
    return Decimal(str(total))


def budget_remaining(db: Session, org_id: str) -> Decimal:
    settings = get_settings()
    if not settings.llm_budget_enabled:
        return Decimal("999999")
    spent = spend_in_window(db, org_id)
    return max(Decimal("0"), settings.llm_budget_usd - spent)


def assert_budget(db: Session, org_id: str, estimated_usd: Decimal) -> None:
    settings = get_settings()
    if not settings.llm_budget_enabled:
        return
    spent = spend_in_window(db, org_id)
    if spent + estimated_usd > settings.llm_budget_usd:
        raise LLMBurnExceeded(spent, settings.llm_budget_usd, settings.llm_budget_window_hours)


def record_spend(
    db: Session,
    org_id: str,
    amount_usd: Decimal,
    *,
    kind: str,
    model: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
) -> None:
    settings = get_settings()
    if not settings.llm_budget_enabled or amount_usd <= 0:
        return
    import uuid

    db.add(
        LlmSpendEvent(
            id=str(uuid.uuid4()),
            org_id=_ledger_org_id(org_id),
            kind=kind,
            model=model,
            amount_usd=amount_usd,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
    )
    db.flush()


def burn_status(db: Session, org_id: str) -> dict:
    settings = get_settings()
    spent = spend_in_window(db, org_id)
    budget = settings.llm_budget_usd if settings.llm_budget_enabled else None
    remaining = budget_remaining(db, org_id) if settings.llm_budget_enabled else None
    pct = 0
    if budget and budget > 0:
        pct = int(min(100, (spent / budget) * 100))
    return {
        "enabled": settings.llm_budget_enabled,
        "scope": settings.llm_budget_scope,
        "window_hours": settings.llm_budget_window_hours,
        "budget_usd": str(budget) if budget is not None else None,
        "spent_usd": str(spent.quantize(Decimal("0.00000001"))),
        "remaining_usd": str(remaining.quantize(Decimal("0.00000001"))) if remaining is not None else None,
        "usage_percent": pct,
    }
