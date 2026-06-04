"""Outbound webhook delivery."""

from __future__ import annotations

import hashlib
import hmac
import json
import threading
import uuid
from datetime import UTC, datetime

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.webhook_subscription import WebhookSubscription

logger = structlog.get_logger()

WEBHOOK_EVENTS = frozenset({"source.indexed", "session.answer_generated"})


def list_webhooks(db: Session, org_id: str) -> list[WebhookSubscription]:
    return list(
        db.execute(
            select(WebhookSubscription)
            .where(WebhookSubscription.org_id == org_id)
            .order_by(WebhookSubscription.created_at.desc())
        ).scalars()
    )


def create_webhook(
    db: Session,
    *,
    org_id: str,
    url: str,
    events: list[str],
    created_by: str,
    secret: str | None = None,
) -> WebhookSubscription:
    import secrets

    valid = [e for e in events if e in WEBHOOK_EVENTS]
    if not valid:
        raise ValueError("No valid events")
    row = WebhookSubscription(
        id=str(uuid.uuid4()),
        org_id=org_id,
        url=url,
        secret=secret or secrets.token_urlsafe(24),
        events_json=json.dumps(valid),
        enabled=True,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    return row


def delete_webhook(db: Session, org_id: str, webhook_id: str) -> None:
    row = db.get(WebhookSubscription, webhook_id)
    if row is None or row.org_id != org_id:
        raise ValueError("Webhook not found")
    db.delete(row)
    db.commit()


def _sign_payload(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _deliver(url: str, secret: str, event: str, payload: dict) -> None:
    body_obj = {
        "event": event,
        "timestamp": datetime.now(UTC).isoformat(),
        "data": payload,
    }
    body = json.dumps(body_obj).encode()
    signature = _sign_payload(secret, body)
    try:
        resp = httpx.post(
            url,
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-ownNBLM-Signature": signature,
                "X-ownNBLM-Event": event,
            },
            timeout=10.0,
        )
        logger.info("webhook_delivered", url=url, event=event, status=resp.status_code)
    except Exception as exc:
        logger.warning("webhook_failed", url=url, event=event, error=str(exc))


def dispatch_webhook(org_id: str, event: str, payload: dict) -> None:
    if event not in WEBHOOK_EVENTS:
        return

    def _run() -> None:
        with SessionLocal() as db:
            rows = db.execute(
                select(WebhookSubscription).where(
                    WebhookSubscription.org_id == org_id,
                    WebhookSubscription.enabled.is_(True),
                )
            ).scalars()
            for row in rows:
                try:
                    events = json.loads(row.events_json or "[]")
                except json.JSONDecodeError:
                    events = []
                if event in events:
                    _deliver(row.url, row.secret, event, payload)

    threading.Thread(target=_run, daemon=True).start()
