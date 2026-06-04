"""Passwordless magic link authentication."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.magic_link_token import MagicLinkToken
from app.models.user import User
from app.services.auth_service import create_access_token, create_refresh_token, register_user


def request_magic_link(db: Session, email: str) -> tuple[MagicLinkToken, str | None]:
    email = email.lower().strip()
    token = secrets.token_urlsafe(32)
    row = MagicLinkToken(
        id=str(uuid.uuid4()),
        email=email,
        token=token,
        expires_at=datetime.now(UTC) + timedelta(minutes=15),
    )
    db.add(row)
    db.commit()
    settings = get_settings()
    link = f"{settings.frontend_url}/login?magic_token={token}"
    return row, link


def verify_magic_link(db: Session, token: str) -> tuple[str, str]:
    row = db.execute(
        select(MagicLinkToken).where(MagicLinkToken.token == token)
    ).scalar_one_or_none()
    if row is None:
        raise ValueError("Invalid or expired link")
    if row.used_at is not None:
        raise ValueError("Link already used")
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        raise ValueError("Link expired")

    user = db.execute(select(User).where(User.email == row.email)).scalar_one_or_none()
    if user is None:
        user = register_user(db, row.email, secrets.token_urlsafe(16), "My Workspace")

    row.used_at = datetime.now(UTC)
    db.commit()
    access = create_access_token(user.id)
    refresh = create_refresh_token(db, user.id)
    return access, refresh
