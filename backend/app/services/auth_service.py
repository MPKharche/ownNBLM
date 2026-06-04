"""JWT auth — email/password, refresh tokens, Google OAuth, magic link."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
from jose import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.org import Org
from app.models.refresh_token import RefreshToken
from app.models.user import User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.secret_key,
        algorithm="HS256",
    )


def _hash_refresh(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def create_refresh_token(db: Session, user_id: str) -> str:
    settings = get_settings()
    raw = secrets.token_urlsafe(48)
    row = RefreshToken(
        id=str(uuid.uuid4()),
        user_id=user_id,
        token_hash=_hash_refresh(raw),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
    )
    db.add(row)
    db.commit()
    return raw


def refresh_access_token(db: Session, raw_refresh: str) -> tuple[str, str] | None:
    digest = _hash_refresh(raw_refresh)
    row = db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == digest,
            RefreshToken.revoked_at.is_(None),
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        return None
    user = db.get(User, row.user_id)
    if user is None:
        return None
    row.revoked_at = datetime.now(UTC)
    db.commit()
    new_refresh = create_refresh_token(db, user.id)
    return create_access_token(user.id), new_refresh


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


def register_user(
    db: Session,
    email: str,
    password: str,
    org_name: str,
    display_name: str = "",
) -> User:
    existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing:
        raise ValueError("Email already registered")
    org = Org(
        id=str(uuid.uuid4()),
        name=org_name,
        slug=email.split("@")[0].replace(".", "-")[:32],
        tier="free",
    )
    db.add(org)
    user = User(
        id=str(uuid.uuid4()),
        org_id=org.id,
        email=email.lower().strip(),
        password_hash=hash_password(password),
        display_name=display_name or email.split("@")[0],
        role="owner",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def token_response(user: User, db: Session) -> dict:
    return {
        "access_token": create_access_token(user.id),
        "refresh_token": create_refresh_token(db, user.id),
        "token_type": "bearer",
        "user_id": user.id,
        "org_id": user.org_id,
        "email": user.email,
        "role": user.role,
    }
