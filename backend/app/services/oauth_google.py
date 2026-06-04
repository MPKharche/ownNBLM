"""Google OAuth — ID token verification."""

from __future__ import annotations

import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.oauth_account import OAuthAccount
from app.models.org import Org
from app.models.user import User
from app.services.auth_service import create_access_token, create_refresh_token


def _verify_google_id_token(id_token: str) -> dict:
    settings = get_settings()
    if not settings.google_client_id:
        raise ValueError("Google OAuth not configured")
    resp = httpx.get(
        "https://oauth2.googleapis.com/tokeninfo",
        params={"id_token": id_token},
        timeout=10.0,
    )
    if resp.status_code != 200:
        raise ValueError("Invalid Google token")
    data = resp.json()
    if data.get("aud") != settings.google_client_id:
        raise ValueError("Token audience mismatch")
    return data


def login_or_register_google(db: Session, id_token: str) -> tuple[User, str, str]:
    profile = _verify_google_id_token(id_token)
    provider_user_id = profile.get("sub", "")
    email = (profile.get("email") or "").lower().strip()
    if not email:
        raise ValueError("Google account has no email")

    oauth = db.execute(
        select(OAuthAccount).where(
            OAuthAccount.provider == "google",
            OAuthAccount.provider_user_id == provider_user_id,
        )
    ).scalar_one_or_none()

    if oauth:
        user = db.get(User, oauth.user_id)
        if user is None:
            raise ValueError("Linked user missing")
    else:
        user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if user is None:
            org = Org(
                id=str(uuid.uuid4()),
                name=f"{profile.get('name', email)}'s Workspace",
                slug=email.split("@")[0].replace(".", "-")[:32],
                tier="free",
            )
            db.add(org)
            user = User(
                id=str(uuid.uuid4()),
                org_id=org.id,
                email=email,
                password_hash=None,
                display_name=profile.get("name", email.split("@")[0]),
                role="owner",
            )
            db.add(user)
        db.add(
            OAuthAccount(
                id=str(uuid.uuid4()),
                user_id=user.id,
                provider="google",
                provider_user_id=provider_user_id,
            )
        )
        db.commit()
        db.refresh(user)

    return user, create_access_token(user.id), create_refresh_token(db, user.id)
