"""Audit log for workspace admin."""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent


def log_audit(
    db: Session,
    *,
    org_id: str,
    action: str,
    resource_type: str,
    user_id: str | None = None,
    resource_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        id=str(uuid.uuid4()),
        org_id=org_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        metadata_json=json.dumps(metadata or {}),
    )
    db.add(event)
    db.commit()
    return event


def list_audit_events(db: Session, org_id: str, *, limit: int = 100) -> list[AuditEvent]:
    return list(
        db.execute(
            select(AuditEvent)
            .where(AuditEvent.org_id == org_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(limit)
        ).scalars()
    )
