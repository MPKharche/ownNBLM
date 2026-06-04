"""Weekly workspace digest email (Resend/Postmark or dev log)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import httpx
import structlog
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.message import Message
from app.models.org import Org
from app.models.session import Session as ChatSession
from app.models.user import User

logger = structlog.get_logger()


def build_digest_payload(db: Session, org_id: str) -> dict:
    since = datetime.now(UTC) - timedelta(days=7)
    query_count = db.execute(
        select(func.count(Message.id)).where(
            Message.org_id == org_id,
            Message.role == "user",
            Message.created_at >= since,
        )
    ).scalar() or 0
    sessions = db.execute(
        select(ChatSession.title)
        .where(ChatSession.org_id == org_id, ChatSession.updated_at >= since)
        .limit(5)
    ).scalars()
    return {
        "period_days": 7,
        "queries": int(query_count),
        "recent_sessions": list(sessions),
    }


def send_weekly_digest(db: Session, org_id: str) -> int:
    org = db.get(Org, org_id)
    if org is None:
        return 0
    owners = db.execute(
        select(User).where(User.org_id == org_id, User.role == "owner")
    ).scalars()
    payload = build_digest_payload(db, org_id)
    settings = get_settings()
    sent = 0
    for user in owners:
        if settings.resend_api_key:
            httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.digest_from_email,
                    "to": [user.email],
                    "subject": f"ownNBLM weekly digest — {org.name}",
                    "html": _html_digest(org.name, payload),
                },
                timeout=15.0,
            )
            sent += 1
        else:
            logger.info(
                "digest_dev",
                to=user.email,
                org=org.name,
                payload=json.dumps(payload),
            )
            sent += 1
    return sent


def _html_digest(org_name: str, payload: dict) -> str:
    sessions = payload.get("recent_sessions") or []
    items = "".join(f"<li>{s}</li>" for s in sessions) or "<li>No sessions this week</li>"
    return f"""
    <h2>{org_name} — weekly summary</h2>
    <p>Queries this week: <strong>{payload.get('queries', 0)}</strong></p>
    <p>Recent sessions:</p><ul>{items}</ul>
    """
