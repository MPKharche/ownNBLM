"""Auth allowlist and sign-up lockdown."""

import os

import pytest
from fastapi import HTTPException

from app.core import auth_access, login_throttle, rate_limit as rl
from app.core.config import get_settings


@pytest.fixture(autouse=True)
def restricted_auth(monkeypatch):
    monkeypatch.setenv("AUTH_RESTRICTED", "true")
    monkeypatch.setenv("AUTH_ALLOWLIST_EMAILS", "admin@ownnblm.local")
    get_settings.cache_clear()
    rl._hits.clear()
    login_throttle._failures.clear()
    login_throttle._lockouts.clear()
    yield
    get_settings.cache_clear()
    rl._hits.clear()
    login_throttle._failures.clear()
    login_throttle._lockouts.clear()


def test_signup_disabled():
    with pytest.raises(HTTPException) as exc:
        auth_access.assert_signup_disabled()
    assert exc.value.status_code == 403


def test_login_rejects_non_allowlisted():
    with pytest.raises(HTTPException) as exc:
        auth_access.assert_login_email_allowed("stranger@example.com")
    assert exc.value.status_code == 401


def test_login_allows_allowlisted():
    auth_access.assert_login_email_allowed("admin@ownnblm.local")


def test_lockout_after_failures():
    from starlette.requests import Request

    rl._hits.clear()
    login_throttle._failures.clear()
    login_throttle._lockouts.clear()

    req = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/login",
            "headers": [],
            "client": ("203.0.113.1", 12345),
        }
    )
    email = "admin@ownnblm.local"
    for _ in range(5):
        login_throttle.record_failed_login(req, email)
    with pytest.raises(HTTPException) as exc:
        login_throttle.assert_login_allowed(req, email)
    assert exc.value.status_code == 429
