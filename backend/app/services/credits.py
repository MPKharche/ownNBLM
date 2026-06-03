"""LLM credit metering — Decimal only; Redis or DB fallback."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.usage import WorkspaceUsage


def _period_key() -> str:
    now = datetime.now(UTC)
    return f"{now.year}-{now.month:02d}"


def get_or_create_usage(db: Session, org_id: str) -> WorkspaceUsage:
    period = _period_key()
    row = db.execute(
        select(WorkspaceUsage).where(
            WorkspaceUsage.org_id == org_id,
            WorkspaceUsage.period == period,
        )
    ).scalar_one_or_none()
    if row is None:
        settings = get_settings()
        from app.models.org import Org

        org = db.get(Org, org_id)
        tier = org.tier if org else "free"
        row = WorkspaceUsage(
            org_id=org_id,
            period=period,
            queries_used=0,
            query_limit=settings.query_limit_for_tier(tier),
            storage_bytes=0,
        )
        db.add(row)
        db.flush()
    return row


def check_query_allowed(db: Session, org_id: str) -> tuple[bool, WorkspaceUsage]:
    usage = get_or_create_usage(db, org_id)
    allowed = usage.queries_used < usage.query_limit
    return allowed, usage


def deduct_query(db: Session, org_id: str, cost: Decimal = Decimal("1")) -> WorkspaceUsage:
    usage = get_or_create_usage(db, org_id)
    usage.queries_used = int(Decimal(usage.queries_used) + cost)
    usage.last_query_at = datetime.now(UTC)
    db.flush()
    return usage


def usage_percent(usage: WorkspaceUsage) -> int:
    if usage.query_limit <= 0:
        return 100
    return int((usage.queries_used / usage.query_limit) * 100)
