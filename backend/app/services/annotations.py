"""Team annotations on shared sessions."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.session_annotation import SessionAnnotation
from app.models.share_link import ShareLink
from app.models.user import User


def list_annotations(
    db: Session,
    *,
    session_id: str,
    share_link_id: str | None = None,
) -> list[SessionAnnotation]:
    q = select(SessionAnnotation).where(SessionAnnotation.session_id == session_id)
    if share_link_id:
        q = q.where(
            (SessionAnnotation.share_link_id == share_link_id)
            | (SessionAnnotation.share_link_id.is_(None))
        )
    return list(db.execute(q.order_by(SessionAnnotation.created_at)).scalars())


def add_annotation(
    db: Session,
    *,
    org_id: str,
    session_id: str,
    content: str,
    user: User | None,
    share_link_id: str | None = None,
    message_id: str | None = None,
) -> SessionAnnotation:
    author = user.display_name if user else "Guest"
    row = SessionAnnotation(
        id=str(uuid.uuid4()),
        org_id=org_id,
        session_id=session_id,
        share_link_id=share_link_id,
        user_id=user.id if user else None,
        author_name=author,
        content=content.strip(),
        message_id=message_id,
    )
    db.add(row)
    db.commit()
    return row


def resolve_share(db: Session, token: str) -> ShareLink | None:
    return db.execute(select(ShareLink).where(ShareLink.token == token)).scalar_one_or_none()
