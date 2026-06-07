"""Restrict sign-in and sign-up to an allowlisted email set (private preview)."""

from __future__ import annotations

from fastapi import HTTPException

from app.core.config import get_settings


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def allowlisted_emails() -> frozenset[str]:
    raw = get_settings().auth_allowlist_emails
    return frozenset(_normalize_email(e) for e in raw.split(",") if e.strip())


def is_auth_restricted() -> bool:
    return get_settings().auth_restricted


def assert_signup_disabled() -> None:
    if is_auth_restricted():
        raise HTTPException(
            status_code=403,
            detail="Sign-up is disabled while the app is in private preview.",
        )


def assert_login_email_allowed(email: str) -> None:
    """Gate password login; use the same 401 as bad password to avoid email enumeration."""
    if not is_auth_restricted():
        return
    if _normalize_email(email) not in allowlisted_emails():
        raise HTTPException(status_code=401, detail="Invalid credentials")


def assert_user_email_allowed(email: str) -> None:
    if not is_auth_restricted():
        return
    if _normalize_email(email) not in allowlisted_emails():
        raise HTTPException(status_code=403, detail="Account access is not enabled.")
