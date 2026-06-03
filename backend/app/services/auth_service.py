"""JWT auth — email/password; Google OAuth stub for Phase 3."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import bcrypt
from jose import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.org import Org
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
    import uuid

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
        email=email,
        password_hash=hash_password(password),
        display_name=display_name or email.split("@")[0],
        role="owner",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
